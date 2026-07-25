import { IsDateString } from 'class-validator';

export class BookAppointmentDto {
  @IsDateString({}, { message: 'La fecha/hora no es válida' })
  startsAt!: string;
}