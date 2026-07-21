import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { WaitlistController } from './waitlist.controller';
import { WaitlistCron } from './waitlist.cron';

@Module({
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistCron],
  exports: [WaitlistService],
})
export class WaitlistModule {}
