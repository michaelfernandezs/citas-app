import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { WaitlistController } from './waitlist.controller';
import { WaitlistCron } from './waitlist.cron';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [RealtimeModule, EmailModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistCron],
  exports: [WaitlistService],
})
export class WaitlistModule {}