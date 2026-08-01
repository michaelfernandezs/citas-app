import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ScheduleService } from './schedule.service';
import { CreateExceptionDto, CreateWorkingHoursDto, UpdateConfigDto } from './dto/schedule.dto';

@UseGuards(JwtAuthGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private scheduleService: ScheduleService) {}

  // ----- Disponibilidad calculada (cualquier usuario logueado) -----

  @Get('availability')
  async availability(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) {
      throw new BadRequestException('Debes indicar from y to (ej. ?from=2026-08-01&to=2026-08-07)');
    }
    return this.scheduleService.computeAvailability(new Date(from), new Date(to));
  }

  // ----- Horario recurrente (admin) -----

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('working-hours')
  listWorkingHours() {
    return this.scheduleService.listWorkingHours();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('working-hours')
  createWorkingHours(@Body() dto: CreateWorkingHoursDto) {
    return this.scheduleService.createWorkingHours(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('working-hours/:id')
  deleteWorkingHours(@Param('id') id: string) {
    return this.scheduleService.deleteWorkingHours(id);
  }

  // ----- Excepciones (admin) -----

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('exceptions')
  listExceptions() {
    return this.scheduleService.listExceptions();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('exceptions')
  upsertException(@Body() dto: CreateExceptionDto) {
    return this.scheduleService.upsertException(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('exceptions/:id')
  deleteException(@Param('id') id: string) {
    return this.scheduleService.deleteException(id);
  }

  // ----- Configuración (admin) -----

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('config')
  getConfig() {
    return this.scheduleService.getConfig();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('config')
  updateConfig(@Body() dto: UpdateConfigDto) {
    return this.scheduleService.updateConfig(dto);
  }
}
