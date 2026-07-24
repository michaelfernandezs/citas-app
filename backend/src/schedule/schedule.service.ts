import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExceptionDto, CreateWorkingHoursDto, UpdateConfigDto } from './schedule.dto';

export interface FreeSlot {
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class ScheduleService {
  constructor(private prisma: PrismaService) {}

  listWorkingHours() {
    return this.prisma.workingHours.findMany({ orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] });
  }

  async createWorkingHours(dto: CreateWorkingHoursDto) {
    const startMinute = toMinutes(dto.startTime);
    const endMinute = toMinutes(dto.endTime);
    if (startMinute >= endMinute) {
      throw new BadRequestException('startTime debe ser antes que endTime');
    }
    return this.prisma.workingHours.create({ data: { weekday: dto.weekday, startMinute, endMinute } });
  }

  async deleteWorkingHours(id: string) {
    const existing = await this.prisma.workingHours.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('No existe ese horario');
    return this.prisma.workingHours.delete({ where: { id } });
  }

  listExceptions() {
    return this.prisma.scheduleException.findMany({ orderBy: { date: 'asc' } });
  }

  async upsertException(dto: CreateExceptionDto) {
    const date = normalizeDate(new Date(dto.date));

    if (!dto.isClosed && (!dto.startTime || !dto.endTime)) {
      throw new BadRequestException('Si el día no está cerrado, indica startTime y endTime');
    }

    const startMinute = dto.startTime ? toMinutes(dto.startTime) : null;
    const endMinute = dto.endTime ? toMinutes(dto.endTime) : null;

    return this.prisma.scheduleException.upsert({
      where: { date },
      create: { date, isClosed: dto.isClosed, startMinute, endMinute },
      update: { isClosed: dto.isClosed, startMinute, endMinute },
    });
  }

  async deleteException(id: string) {
    const existing = await this.prisma.scheduleException.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('No existe esa excepción');
    return this.prisma.scheduleException.delete({ where: { id } });
  }

  async getConfig() {
    const existing = await this.prisma.scheduleConfig.findUnique({ where: { id: 'singleton' } });
    if (existing) return existing;
    return this.prisma.scheduleConfig.create({ data: { id: 'singleton' } });
  }

  async updateConfig(dto: UpdateConfigDto) {
    await this.getConfig();
    return this.prisma.scheduleConfig.update({ where: { id: 'singleton' }, data: dto });
  }

  async computeAvailability(from: Date, to: Date): Promise<FreeSlot[]> {
    const config = await this.getConfig();

    const now = new Date();
    const earliestAllowed = new Date(now.getTime() + config.minNoticeHours * 60 * 60 * 1000);
    const latestAllowed = new Date(now.getTime() + config.maxAdvanceDays * 24 * 60 * 60 * 1000);

    const rangeStart = from > now ? from : now;
    const rangeEnd = to < latestAllowed ? to : latestAllowed;
    if (rangeStart > rangeEnd) return [];

    const [workingHours, exceptions, existingAppointments] = await Promise.all([
      this.prisma.workingHours.findMany(),
      this.prisma.scheduleException.findMany({
        where: { date: { gte: normalizeDate(rangeStart), lte: normalizeDate(rangeEnd) } },
      }),
      this.prisma.appointment.findMany({
        where: { status: 'SCHEDULED', startsAt: { gte: rangeStart, lte: rangeEnd } },
      }),
    ]);

    const workingHoursByWeekday = new Map<number, { startMinute: number; endMinute: number }[]>();
    for (const wh of workingHours) {
      const list = workingHoursByWeekday.get(wh.weekday) ?? [];
      list.push({ startMinute: wh.startMinute, endMinute: wh.endMinute });
      workingHoursByWeekday.set(wh.weekday, list);
    }

    const exceptionByDateKey = new Map(exceptions.map((e) => [dateKey(e.date), e]));

    const slots: FreeSlot[] = [];
    const stepMinutes = config.slotDurationMinutes + config.bufferMinutes;

    for (const day = new Date(normalizeDate(rangeStart)); day <= rangeEnd; day.setDate(day.getDate() + 1)) {
      const exception = exceptionByDateKey.get(dateKey(day));

      let ranges: { startMinute: number; endMinute: number }[];
      if (exception) {
        if (exception.isClosed) continue;
        ranges = [{ startMinute: exception.startMinute!, endMinute: exception.endMinute! }];
      } else {
        ranges = workingHoursByWeekday.get(day.getDay()) ?? [];
      }

      for (const range of ranges) {
        for (let minute = range.startMinute; minute + config.slotDurationMinutes <= range.endMinute; minute += stepMinutes) {
          const startsAt = new Date(day);
          startsAt.setHours(0, minute, 0, 0);
          const endsAt = new Date(startsAt.getTime() + config.slotDurationMinutes * 60 * 1000);

          if (startsAt < earliestAllowed) continue;
          if (startsAt < rangeStart || startsAt > rangeEnd) continue;

          const overlaps = existingAppointments.some((a) => startsAt < a.endsAt && endsAt > a.startsAt);
          if (overlaps) continue;

          slots.push({ startsAt, endsAt });
        }
      }
    }

    return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function normalizeDate(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dateKey(d: Date): string {
  return normalizeDate(d).toISOString().slice(0, 10);
}