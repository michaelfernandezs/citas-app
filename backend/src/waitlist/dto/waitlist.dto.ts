import { IsBoolean, IsString } from 'class-validator';

export class RespondOfferDto {
  @IsBoolean({ message: 'accept debe ser verdadero o falso' })
  accept!: boolean;
}

export class JoinWaitlistDto {
  @IsString({ message: 'Debes indicar a qué cita quieres hacer fila' })
  appointmentId!: string;
}
