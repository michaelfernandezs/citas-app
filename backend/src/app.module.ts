import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { ClinicScheduleModule } from './schedule/schedule.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // cron jobs (@nestjs/schedule)
    PrismaModule,
    AuthModule,
    AppointmentsModule,
    WaitlistModule,
    ClinicScheduleModule, // horario, excepciones, config y disponibilidad calculada
  ],
})
export class AppModule {}
