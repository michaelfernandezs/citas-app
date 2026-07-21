import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WaitlistService } from './waitlist.service';

@Injectable()
export class WaitlistCron {
  private readonly logger = new Logger(WaitlistCron.name);

  constructor(private waitlistService: WaitlistService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpirations() {
    const result = await this.waitlistService.expireOverdueOffers();
    if (result.expiredCount > 0) {
      this.logger.log(`${result.expiredCount} oferta(s) expirada(s) y reasignada(s)`);
    }
  }
}
