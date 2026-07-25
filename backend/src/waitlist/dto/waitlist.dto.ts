import { IsBoolean, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class RespondOfferDto {
  @IsBoolean({ message: 'accept debe ser verdadero o falso' })
  accept!: boolean;
}

export class JoinWaitlistDto {
  @IsOptional()
  @IsInt({ message: 'El día debe ser un número' })
  @Min(0, { message: 'El día debe estar entre 0 (domingo) y 6 (sábado)' })
  @Max(6, { message: 'El día debe estar entre 0 (domingo) y 6 (sábado)' })
  preferredWeekday?: number;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'La hora de inicio debe tener formato HH:mm (ej. 09:00)' })
  preferredStartTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'La hora de fin debe tener formato HH:mm (ej. 13:00)' })
  preferredEndTime?: string;
}