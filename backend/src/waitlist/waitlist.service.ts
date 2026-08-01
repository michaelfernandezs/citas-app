import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JoinWaitlistDto } from './dto/waitlist.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const OFFER_WINDOW_HOURS = 3;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
  ) {}

  /** El paciente pide que le avisen si una cita específica (ya ocupada) se libera. */
  async join(patientId: string, dto: JoinWaitlistDto) {
    const active = await this.prisma.waitlistEntry.findFirst({
      where: { patientId, status: { in: ['WAITING', 'OFFERED'] } },
    });
    if (active) {
      throw new BadRequestException('Ya tienes un lugar activo en la fila');
    }

    const appointment = await this.prisma.appointment.findUnique({ where: { id: dto.appointmentId } });
    if (!appointment) throw new NotFoundException('Esa cita no existe');
    if (appointment.status !== 'SCHEDULED') {
      throw new BadRequestException('Esa cita ya no está ocupada, puedes agendarla directo');
    }
    if (appointment.patientId === patientId) {
      throw new BadRequestException('No puedes hacer fila para tu propia cita');
    }

    return this.prisma.waitlistEntry.create({
      data: { patientId, status: 'WAITING', watchedAppointmentId: dto.appointmentId },
    });
  }

  async leave(patientId: string, entryId: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('No existe ese lugar en la fila');
    if (entry.patientId !== patientId) throw new ForbiddenException('No es tu lugar en la fila');
    if (entry.status !== 'WAITING') {
      throw new BadRequestException('Solo puedes salir mientras estás en espera (no con una oferta activa)');
    }

    return this.prisma.waitlistEntry.update({
      where: { id: entryId },
      data: { status: 'CANCELLED_BY_PATIENT' },
    });
  }

  async myStatus(patientId: string) {
    const entry = await this.prisma.waitlistEntry.findFirst({
      where: { patientId, status: { in: ['WAITING', 'OFFERED'] } },
      include: { offer: true, watchedAppointment: true },
    });
    if (!entry) return { inQueue: false };

    if (entry.status === 'WAITING') {
      // Posición entre quienes esperan esa MISMA cita (no la fila global)
      const position = await this.prisma.waitlistEntry.count({
        where: {
          status: 'WAITING',
          watchedAppointmentId: entry.watchedAppointmentId,
          createdAt: { lt: entry.createdAt },
        },
      });
      return { inQueue: true, status: 'WAITING', position: position + 1, entry };
    }

    return { inQueue: true, status: 'OFFERED', entry, offer: entry.offer };
  }

  /**
   * Se llama cuando una cita específica se cancela. Busca al siguiente
   * paciente que estaba esperando ESA cita en particular (FIFO) y le
   * crea una oferta.
   */
  async assignNextForCancelledAppointment(appointmentId: string, startsAt: Date, endsAt: Date) {
    const result = await this.prisma.$transaction(async (tx) => {
      const nextCandidate = await tx.waitlistEntry.findFirst({
        where: { status: 'WAITING', watchedAppointmentId: appointmentId },
        orderBy: { createdAt: 'asc' },
      });

      if (!nextCandidate) {
        this.logger.log(`Nadie esperaba la cita ${appointmentId}, queda libre para agendar directo`);
        return null;
      }

      const expiresAt = new Date(Date.now() + OFFER_WINDOW_HOURS * 60 * 60 * 1000);

      await tx.waitlistEntry.update({
        where: { id: nextCandidate.id },
        data: { status: 'OFFERED' },
      });

      const offer = await tx.offer.create({
        data: { waitlistEntryId: nextCandidate.id, startsAt, endsAt, expiresAt, status: 'PENDING' },
      });

      this.logger.log(
        `Cita ${appointmentId} ofrecida a paciente ${nextCandidate.patientId}, expira ${expiresAt.toISOString()}`,
      );

      return { offer, patientId: nextCandidate.patientId };
    });

    if (result) {
      this.realtimeGateway.notifyPatient(result.patientId);
    }

    return result?.offer ?? null;
  }

  async respondToOffer(patientId: string, entryId: string, accept: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.waitlistEntry.findUnique({
        where: { id: entryId },
        include: { offer: true },
      });
      if (!entry) throw new NotFoundException('No existe esa oferta');
      if (entry.patientId !== patientId) throw new ForbiddenException('No es tu oferta');
      if (entry.status !== 'OFFERED' || !entry.offer) {
        throw new BadRequestException('No tienes una oferta activa');
      }
      if (entry.offer.expiresAt < new Date()) {
        throw new BadRequestException('La oferta ya expiró');
      }

      const { startsAt, endsAt } = entry.offer;
      const watchedAppointmentId = entry.watchedAppointmentId;

      if (accept) {
        const conflict = await tx.appointment.findFirst({
          where: { status: 'SCHEDULED', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
        });
        if (conflict) {
          await tx.offer.update({ where: { id: entry.offer.id }, data: { status: 'EXPIRED' } });
          await tx.waitlistEntry.update({ where: { id: entryId }, data: { status: 'EXPIRED' } });
          throw new BadRequestException('Ese espacio ya fue tomado, tu oferta expiró');
        }

        await tx.offer.update({ where: { id: entry.offer.id }, data: { status: 'ACCEPTED' } });
        await tx.waitlistEntry.update({ where: { id: entryId }, data: { status: 'ACCEPTED' } });

        const newAppointment = await tx.appointment.create({
          data: { patientId, startsAt, endsAt, status: 'SCHEDULED' },
        });

        this.realtimeGateway.broadcastAvailabilityUpdate();
        return newAppointment;
      }

      await tx.offer.update({ where: { id: entry.offer.id }, data: { status: 'REJECTED' } });
      await tx.waitlistEntry.update({ where: { id: entryId }, data: { status: 'REJECTED' } });

      return this.assignNextForCancelledAppointment(watchedAppointmentId, startsAt, endsAt);
    });
  }

  /** Revisa ofertas vencidas, las libera, avisa a quien la perdió, y reasigna. */
  async expireOverdueOffers() {
    const expired = await this.prisma.offer.findMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      include: { waitlistEntry: true },
    });

    for (const offer of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.offer.update({ where: { id: offer.id }, data: { status: 'EXPIRED' } });
        await tx.waitlistEntry.update({ where: { id: offer.waitlistEntryId }, data: { status: 'EXPIRED' } });
      });

      this.realtimeGateway.notifyPatient(offer.waitlistEntry.patientId);

      this.logger.log(`Oferta expirada para la cita ${offer.waitlistEntry.watchedAppointmentId}, reasignando`);
      await this.assignNextForCancelledAppointment(
        offer.waitlistEntry.watchedAppointmentId,
        offer.startsAt,
        offer.endsAt,
      );
    }

    return { expiredCount: expired.length };
  }
}
