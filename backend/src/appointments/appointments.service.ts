import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { CreateSlotDto, CreateRecurringSlotsDto } from './dto/appointments.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private waitlistService: WaitlistService,
  ) {}

  // ---------- ADMIN ----------

  async createSlot(dto: CreateSlotDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + dto.durationMinutes * 60 * 1000);
    return this.prisma.appointment.create({ data: { startsAt, endsAt, status: 'OPEN' } });
  }

  /** Genera slots recurrentes en un rango de fechas y horas, ej. lunes a viernes 9am-5pm. */
  async createRecurringSlots(dto: CreateRecurringSlotsDto) {
    const from = new Date(dto.fromDate);
    const to = new Date(dto.toDate);
    const exclude = new Set(dto.excludeWeekdays ?? []);
    const slots: { startsAt: Date; endsAt: Date; status: 'OPEN' }[] = [];

    for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
      if (exclude.has(day.getDay())) continue;

      for (let hour = dto.startHour; hour < dto.endHour; hour += dto.durationMinutes / 60) {
        const startsAt = new Date(day);
        startsAt.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
        const endsAt = new Date(startsAt.getTime() + dto.durationMinutes * 60 * 1000);
        slots.push({ startsAt, endsAt, status: 'OPEN' });
      }
    }

    await this.prisma.appointment.createMany({ data: slots });
    return { created: slots.length };
  }

  async listAllForAdmin() {
    return this.prisma.appointment.findMany({
      orderBy: { startsAt: 'asc' },
      include: { patient: { select: { id: true, name: true, email: true } } },
    });
  }

  async cancelAsAdmin(appointmentId: string) {
    return this.cancelInternal(appointmentId);
  }

  // ---------- PACIENTE ----------

  async listOpenSlots() {
    return this.prisma.appointment.findMany({
      where: { status: 'OPEN', startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
    });
  }

  async book(patientId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) throw new NotFoundException('El espacio no existe');
    if (appointment.status !== 'OPEN') {
      throw new BadRequestException('Ese espacio ya no está disponible, puedes unirte a la fila virtual');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'SCHEDULED', patientId },
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

    return this.cancelInternal(appointmentId);
  }

  // ---------- COMPARTIDO ----------

  /** Cancela la cita, la deja OPEN y dispara la asignación al siguiente en la fila. */
  private async cancelInternal(appointmentId: string) {
    const cancelled = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'OPEN',
        patientId: null,
        cancelledAt: new Date(),
        offerExpiresAt: null,
        waitlistEntryId: null,
      },
    });

    // Intenta ofrecer el espacio recién liberado al siguiente en la fila virtual
    await this.waitlistService.assignNextForAppointment(appointmentId);

    return cancelled;
  }
}
