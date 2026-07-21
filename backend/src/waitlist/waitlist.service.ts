import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const OFFER_WINDOW_HOURS = 3;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private prisma: PrismaService) {}

  /** El paciente se une a la fila. Falla si ya tiene una entrada activa. */
  async join(patientId: string) {
    const active = await this.prisma.waitlistEntry.findFirst({
      where: { patientId, status: { in: ['WAITING', 'OFFERED'] } },
    });
    if (active) {
      throw new BadRequestException('Ya tienes un lugar activo en la fila');
    }

    return this.prisma.waitlistEntry.create({
      data: { patientId, status: 'WAITING' },
    });
  }

  /** El paciente cancela su propio lugar en la fila (solo si sigue en WAITING). */
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

  /** Estado de la fila para un paciente: su entrada activa + posición (si aplica). */
  async myStatus(patientId: string) {
    const entry = await this.prisma.waitlistEntry.findFirst({
      where: { patientId, status: { in: ['WAITING', 'OFFERED'] } },
      include: { offeredAppointment: true },
    });
    if (!entry) return { inQueue: false };

    if (entry.status === 'WAITING') {
      const position = await this.prisma.waitlistEntry.count({
        where: { status: 'WAITING', createdAt: { lt: entry.createdAt } },
      });
      return { inQueue: true, status: 'WAITING', position: position + 1, entry };
    }

    return { inQueue: true, status: 'OFFERED', entry, offer: entry.offeredAppointment };
  }

  /**
   * Núcleo del sistema: busca al siguiente candidato FIFO en espera y le ofrece
   * el espacio liberado. Si nadie espera, el appointment se queda OPEN.
   */
  async assignNextForAppointment(appointmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appointment || appointment.status !== 'OPEN') {
        return null; // ya fue tomado o no existe
      }

      const nextCandidate = await tx.waitlistEntry.findFirst({
        where: { status: 'WAITING' },
        orderBy: { createdAt: 'asc' },
      });

      if (!nextCandidate) {
        this.logger.log(`Sin candidatos en fila para el appointment ${appointmentId}, queda abierto`);
        return null;
      }

      const offerExpiresAt = new Date(Date.now() + OFFER_WINDOW_HOURS * 60 * 60 * 1000);

      await tx.waitlistEntry.update({
        where: { id: nextCandidate.id },
        data: { status: 'OFFERED' },
      });

      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'OFFERED',
          offerExpiresAt,
          waitlistEntryId: nextCandidate.id,
        },
      });

      this.logger.log(
        `Espacio ${appointmentId} ofrecido a paciente ${nextCandidate.patientId}, expira ${offerExpiresAt.toISOString()}`,
      );

      // TODO: aquí se dispara el email de notificación al paciente
      return updatedAppointment;
    });
  }

  /** El paciente responde (acepta o rechaza) una oferta activa. */
  async respondToOffer(patientId: string, entryId: string, accept: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.waitlistEntry.findUnique({
        where: { id: entryId },
        include: { offeredAppointment: true },
      });
      if (!entry) throw new NotFoundException('No existe esa oferta');
      if (entry.patientId !== patientId) throw new ForbiddenException('No es tu oferta');
      if (entry.status !== 'OFFERED' || !entry.offeredAppointment) {
        throw new BadRequestException('No tienes una oferta activa');
      }
      if (entry.offeredAppointment.offerExpiresAt && entry.offeredAppointment.offerExpiresAt < new Date()) {
        throw new BadRequestException('La oferta ya expiró');
      }

      const appointmentId = entry.offeredAppointment.id;

      if (accept) {
        await tx.waitlistEntry.update({ where: { id: entryId }, data: { status: 'ACCEPTED' } });
        return tx.appointment.update({
          where: { id: appointmentId },
          data: {
            status: 'SCHEDULED',
            patientId,
            offerExpiresAt: null,
            waitlistEntryId: null,
          },
        });
      }

      await tx.waitlistEntry.update({ where: { id: entryId }, data: { status: 'REJECTED' } });
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'OPEN', offerExpiresAt: null, waitlistEntryId: null },
      });

      // vuelve a ofrecer el mismo espacio al siguiente en la fila
      return this.assignNextForAppointment(appointmentId);
    });
  }

  /** Revisa ofertas vencidas y las libera. Llamado por el cron cada minuto. */
  async expireOverdueOffers() {
    const expired = await this.prisma.appointment.findMany({
      where: { status: 'OFFERED', offerExpiresAt: { lt: new Date() } },
    });

    for (const appointment of expired) {
      await this.prisma.$transaction(async (tx) => {
        if (appointment.waitlistEntryId) {
          await tx.waitlistEntry.update({
            where: { id: appointment.waitlistEntryId },
            data: { status: 'EXPIRED' },
          });
        }
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: 'OPEN', offerExpiresAt: null, waitlistEntryId: null },
        });
      });

      this.logger.log(`Oferta expirada para appointment ${appointment.id}, reasignando`);
      await this.assignNextForAppointment(appointment.id);
    }

    return { expiredCount: expired.length };
  }
}
