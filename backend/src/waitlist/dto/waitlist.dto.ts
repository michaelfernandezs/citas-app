import { IsBoolean, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class RespondOfferDto {
  @IsBoolean()
  accept: boolean;
}

export class JoinWaitlistDto {
  // 0=domingo ... 6=sábado. Si se omite, el paciente acepta cualquier día.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  preferredWeekday?: number;

  // Formato "HH:mm", ej "15:00". Si se manda uno, se debe mandar el otro también.
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'preferredStartTime debe tener formato HH:mm' })
  preferredStartTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'preferredEndTime debe tener formato HH:mm' })
  preferredEndTime?: string;
}
