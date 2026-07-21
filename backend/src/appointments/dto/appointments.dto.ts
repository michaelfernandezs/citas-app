import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateSlotDto {
  @IsDateString()
  startsAt: string;

  @IsInt()
  @Min(5)
  durationMinutes: number;
}

export class CreateRecurringSlotsDto {
  @IsDateString()
  fromDate: string; // día inicial, ej "2026-07-10"

  @IsDateString()
  toDate: string; // día final, ej "2026-07-15"

  @IsInt()
  startHour: number; // ej 9 (9am)

  @IsInt()
  endHour: number; // ej 17 (5pm)

  @IsInt()
  @Min(5)
  durationMinutes: number;

  @IsOptional()
  @IsInt({ each: true })
  excludeWeekdays?: number[]; // 0=domingo ... 6=sabado, ej [0,6] para excluir fin de semana
}
