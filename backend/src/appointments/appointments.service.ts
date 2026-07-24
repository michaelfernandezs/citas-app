import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { ScheduleService } from '../schedule/schedule.service';
import { BookAppointmentDto } from './dto/appointments.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private waitlistService: WaitlistService,
    private scheduleService: ScheduleService,
  ) {}

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
      throw new BadRequestException('Ese horario ya no está disponible, puedes unirte a la fila virtual');
    }

    return this.prisma.appointment.create({
      data: { patientId, startsAt, endsAt, status: 'SCHEDULED' },
    });
  }

  async listMine(patientId: string) {
    return this.prisma.appointment.findMany({
      where: { patientId },
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

  private async cancelInternal(appointmentId: string, startsAt: Date, endsAt: Date) {
    const cancelled = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await this.waitlistService.assignNextForFreedSlot(startsAt, endsAt);

    return cancelled;
  }
}