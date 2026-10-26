import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { ScheduleService } from '../schedule/schedule.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BookAppointmentDto } from './dto/appointments.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private waitlistService: WaitlistService,
    private scheduleService: ScheduleService,
    private realtimeGateway: RealtimeGateway,
  ) {}

  // ---------- PACIENTE ----------

  async book(patientId: string, dto: BookAppointmentDto) {
    const startsAt = new Date(dto.startsAt);
    const config = await this.scheduleService.getConfig();
    const endsAt = new Date(startsAt.getTime() + config.slotDurationMinutes * 60 * 1000);

    const dayStart = new Date(startsAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(startsAt);
    dayEnd.setHours(23, 59, 59, 999);

    const freeSlots = await this.scheduleService.computeAvailability(dayStart, dayEnd);
    const isValidSlot = freeSlots.some((slot) => slot.startsAt.getTime() === startsAt.getTime());

    if (!isValidSlot) {
      throw new BadRequestException('Ese horario ya no está disponible');
    }

    try {
      const appointment = await this.prisma.$transaction(
        async (tx) => {
          const patientAppointment = await tx.appointment.findFirst({
            where: { patientId, status: 'SCHEDULED' },
          });
          if (patientAppointment) {
            throw new BadRequestException('Solo puedes tener una cita confirmada a la vez');
          }

          const conflict = await tx.appointment.findFirst({
            where: { status: 'SCHEDULED', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
          });
          if (conflict) {
            throw new BadRequestException('Ese horario se acaba de ocupar, elige otro');
          }

          return tx.appointment.create({
            data: { patientId, startsAt, endsAt, status: 'SCHEDULED' },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      this.realtimeGateway.broadcastAvailabilityUpdate();
      return appointment;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      if (err?.code === 'P2034') {
        throw new BadRequestException('Ese horario se acaba de ocupar, elige otro');
      }
      throw err;
    }
  }

  async reschedule(patientId: string, appointmentId: string, dto: BookAppointmentDto) {
    const startsAt = new Date(dto.startsAt);
    const dayStart = new Date(startsAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(startsAt);
    dayEnd.setHours(23, 59, 59, 999);
    const slots = await this.scheduleService.computeAvailability(dayStart, dayEnd);
    const slot = slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
    if (!slot) throw new BadRequestException('Ese horario ya no está disponible');
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const original = await tx.appointment.findUnique({ where: { id: appointmentId } });
        if (!original) throw new NotFoundException('La cita no existe');
        if (original.patientId !== patientId) throw new ForbiddenException('No es tu cita');
        if (original.status !== 'SCHEDULED' || original.startsAt <= new Date()) {
          throw new BadRequestException('Solo puedes reprogramar citas confirmadas futuras');
        }
        const conflict = await tx.appointment.findFirst({
          where: { status: 'SCHEDULED', startsAt: { lt: slot.endsAt }, endsAt: { gt: startsAt } },
        });
        if (conflict) throw new BadRequestException('Ese horario se acaba de ocupar, elige otro');
        await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        const appointment = await tx.appointment.create({ data: { patientId, startsAt, endsAt: slot.endsAt } });
        return { original, appointment };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error?.code === 'P2034') throw new BadRequestException('La agenda cambió. Intenta de nuevo; tu cita anterior se conserva.');
      throw error;
    }
    // El cambio ya quedó confirmado; un fallo en los avisos no debe reportarlo como fallido.
    try {
      await this.waitlistService.assignNextForCancelledAppointment(appointmentId, result.original.startsAt, result.original.endsAt);
    } catch (error) {
      console.error('No se pudo avisar a la fila tras reprogramar', error);
    }
    this.realtimeGateway.broadcastAvailabilityUpdate();
    return result.appointment;
  }

  async listMine(patientId: string) {
    return this.prisma.appointment.findMany({
      where: { patientId },
      orderBy: { startsAt: 'asc' },
    });
  }

  /** Citas ya ocupadas por OTROS pacientes, para poder hacer fila por una en particular. */
  async listBookedForWatching(excludePatientId: string, from: Date, to: Date) {
    return this.prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        patientId: { not: excludePatientId },
        startsAt: { gte: from, lte: to },
      },
      select: { id: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  async cancelAsPatient(patientId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) throw new NotFoundException('La cita no existe');
    if (appointment.patientId !== patientId) throw new ForbiddenException('No es tu cita');
    if (appointment.status !== 'SCHEDULED') {
      throw new BadRequestException('Solo puedes cancelar citas confirmadas');
    }

    return this.cancelInternal(appointment.id, appointment.startsAt, appointment.endsAt);
  }

  // ---------- ADMIN ----------

  async listAllForAdmin() {
    return this.prisma.appointment.findMany({
      orderBy: { startsAt: 'asc' },
      include: { patient: { select: { id: true, name: true, email: true } } },
    });
  }

  async cancelAsAdmin(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) throw new NotFoundException('La cita no existe');
    if (appointment.status !== 'SCHEDULED') {
      throw new BadRequestException('Solo puedes cancelar citas confirmadas');
    }

    return this.cancelInternal(appointment.id, appointment.startsAt, appointment.endsAt);
  }

  // ---------- COMPARTIDO ----------

  private async cancelInternal(appointmentId: string, startsAt: Date, endsAt: Date) {
    const cancelled = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    // Le avisa a quien esté en la fila esperando ESTA cita en particular
    await this.waitlistService.assignNextForCancelledAppointment(appointmentId, startsAt, endsAt);

    // Le avisa a todos los conectados que la disponibilidad cambió
    this.realtimeGateway.broadcastAvailabilityUpdate();

    return cancelled;
  }
}
