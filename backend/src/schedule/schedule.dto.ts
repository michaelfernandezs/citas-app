import { IsBoolean, IsDateString, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateWorkingHoursDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Matches(TIME_REGEX, { message: 'startTime debe tener formato HH:mm' })
  startTime!: string;

  @Matches(TIME_REGEX, { message: 'endTime debe tener formato HH:mm' })
  endTime!: string;
}

export class CreateExceptionDto {
  @IsDateString()
  date!: string;

  @IsBoolean()
  isClosed!: boolean;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'startTime debe tener formato HH:mm' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'endTime debe tener formato HH:mm' })
  endTime?: string;
}

export class UpdateConfigDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  slotDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minNoticeHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAdvanceDays?: number;
}