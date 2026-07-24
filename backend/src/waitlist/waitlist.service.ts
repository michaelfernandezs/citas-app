import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JoinWaitlistDto } from './dto/waitlist.dto';

const OFFER_WINDOW_HOURS = 3;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private prisma: PrismaService) {}

  async join(patientId: string, dto: JoinWaitlistDto) {
    const active = await this.prisma.waitlistEntry.findFirst({
      where: { patientId, status: { in: ['WAITING', 'OFFERED'] } },
    });
    if (active) {
      throw new BadRequestException('Ya tienes un lugar activo en la fila');
    }

    const hasRange = dto.preferredStartTime || dto.preferredEndTime;
    if (hasRange && (!dto.preferredStartTime || !dto.preferredEndTime)) {
      throw new BadRequestException('Debes indicar hora de inicio y de fin juntas, o ninguna');
    }

    const preferredStartMinute = dto.preferredStartTime ? toMinutes(dto.preferredStartTime) : null;
    const preferredEndMinute = dto.preferredEndTime ? toMinutes(dto.preferredEndTime) : null;

    if (preferredStartMinute !== null && preferredEndMinute !== null && preferredStartMinute >= preferredEndMinute) {
      throw new BadRequestException('La hora de inicio debe ser antes que la hora de fin');
    }

    return this.prisma.waitlistEntry.create({
      data: {
        patientId,
        status: 'WAITING',
        preferredWeekday: dto.preferredWeekday ?? null,
        preferredStartMinute,
        preferredEndMinute,
      },
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
      include: { offer: true },
    });
    if (!entry) return { inQueue: false };

    if (entry.status === 'WAITING') {
      const position = await this.prisma.waitlistEntry.count({
        where: { status: 'WAITING', createdAt: { lt: entry.createdAt } },
      });
      return { inQueue: true, status: 'WAITING', position: position + 1, entry };
    }

    return { inQueue: true, status: 'OFFERED', entry, offer: entry.offer };
  }

  async assignNextForFreedSlot(startsAt: Date, endsAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      const slotWeekday = startsAt.getDay();
      const slotMinute = startsAt.getHours() * 60 + startsAt.getMinutes();

      const waitingEntries = await tx.waitlistEntry.findMany({
        where: { status: 'WAITING' },
        orderBy: { createdAt: 'asc' },
      });

      const nextCandidate = waitingEntries.find((entry) => matchesSlot(entry, slotWeekday, slotMinute));

      if (!nextCandidate) {
        this.logger.log(`Sin candidatos elegibles para el espacio ${startsAt.toISOString()}, queda libre`);
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
        `Espacio ${startsAt.toISOString()} ofrecido a paciente ${nextCandidate.patientId}, expira ${expiresAt.toISOString()}`,
      );

      return offer;
    });
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

        return tx.appointment.create({
          data: { patientId, startsAt, endsAt, status: 'SCHEDULED' },
        });
      }

      await tx.offer.update({ where: { id: entry.offer.id }, data: { status: 'REJECTED' } });
      await tx.waitlistEntry.update({ where: { id: entryId }, data: { status: 'REJECTED' } });

      return this.assignNextForFreedSlot(startsAt, endsAt);
    });
  }

  async expireOverdueOffers() {
    const expired = await this.prisma.offer.findMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    });

    for (const offer of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.offer.update({ where: { id: offer.id }, data: { status: 'EXPIRED' } });
        await tx.waitlistEntry.update({ where: { id: offer.waitlistEntryId }, data: { status: 'EXPIRED' } });
      });

      this.logger.log(`Oferta expirada para el espacio ${offer.startsAt.toISOString()}, reasignando`);
      await this.assignNextForFreedSlot(offer.startsAt, offer.endsAt);
    }

    return { expiredCount: expired.length };
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function matchesSlot(
  entry: { preferredWeekday: number | null; preferredStartMinute: number | null; preferredEndMinute: number | null },
  slotWeekday: number,
  slotMinute: number,
): boolean {
  if (entry.preferredWeekday !== null && entry.preferredWeekday !== slotWeekday) {
    return false;
  }
  if (entry.preferredStartMinute !== null && entry.preferredEndMinute !== null) {
    if (slotMinute < entry.preferredStartMinute || slotMinute >= entry.preferredEndMinute) {
      return false;
    }
  }
  return true;
}