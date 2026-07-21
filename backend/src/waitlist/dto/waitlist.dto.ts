import { IsBoolean } from 'class-validator';

export class RespondOfferDto {
  @IsBoolean()
  accept: boolean;
}
