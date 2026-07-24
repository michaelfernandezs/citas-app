import { IsDateString } from 'class-validator';

export class BookAppointmentDto {
  @IsDateString()
  startsAt!: string;
}