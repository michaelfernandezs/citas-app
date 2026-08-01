import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { ClinicScheduleModule } from '../schedule/schedule.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [WaitlistModule, ClinicScheduleModule, RealtimeModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
