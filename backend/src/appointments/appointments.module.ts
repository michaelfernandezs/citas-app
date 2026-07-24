import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { ClinicScheduleModule } from '../schedule/shedule.module';

@Module({
  imports: [WaitlistModule, ClinicScheduleModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}