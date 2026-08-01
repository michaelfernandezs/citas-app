import { IsBoolean, IsDateString, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_MSG = 'Debe tener formato HH:mm (ej. 09:00)';

export class CreateWorkingHoursDto {
  @IsInt({ message: 'El día debe ser un número' })
  @Min(0, { message: 'El día debe estar entre 0 (domingo) y 6 (sábado)' })
  @Max(6, { message: 'El día debe estar entre 0 (domingo) y 6 (sábado)' })
  weekday!: number;

  @Matches(TIME_REGEX, { message: `Hora de inicio: ${TIME_MSG}` })
  startTime!: string;

  @Matches(TIME_REGEX, { message: `Hora de fin: ${TIME_MSG}` })
  endTime!: string;
}

export class CreateExceptionDto {
  @IsDateString({}, { message: 'La fecha no es válida' })
  date!: string;

  @IsBoolean({ message: 'isClosed debe ser verdadero o falso' })
  isClosed!: boolean;

  @IsOptional()
  @Matches(TIME_REGEX, { message: `Hora de inicio: ${TIME_MSG}` })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: `Hora de fin: ${TIME_MSG}` })
  endTime?: string;
}

export class UpdateConfigDto {
  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número' })
  @Min(5, { message: 'La duración mínima es 5 minutos' })
  slotDurationMinutes?: number;

  @IsOptional()
  @IsInt({ message: 'El descanso debe ser un número' })
  @Min(0, { message: 'El descanso no puede ser negativo' })
  bufferMinutes?: number;

  @IsOptional()
  @IsInt({ message: 'La anticipación debe ser un número' })
  @Min(0, { message: 'La anticipación no puede ser negativa' })
  minNoticeHours?: number;

  @IsOptional()
  @IsInt({ message: 'El máximo de días debe ser un número' })
  @Min(1, { message: 'El máximo de días debe ser al menos 1' })
  maxAdvanceDays?: number;
}
