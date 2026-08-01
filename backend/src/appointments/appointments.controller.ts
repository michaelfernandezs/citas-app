import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import { BookAppointmentDto } from './dto/appointments.dto';

@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private appointmentsService: AppointmentsService) {}

  // ----- Paciente -----

  @Post('book')
  book(@CurrentUser() user: CurrentUserPayload, @Body() dto: BookAppointmentDto) {
    return this.appointmentsService.book(user.userId, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.appointmentsService.listMine(user.userId);
  }

  @Get('booked')
  listBooked(@CurrentUser() user: CurrentUserPayload, @Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) {
      throw new BadRequestException('Debes indicar from y to');
    }
    return this.appointmentsService.listBookedForWatching(user.userId, new Date(from), new Date(to));
  }

  @Delete(':id')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.appointmentsService.cancelAsPatient(user.userId, id);
  }

  // ----- Admin -----

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('admin/all')
  listAllForAdmin() {
    return this.appointmentsService.listAllForAdmin();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('admin/:id')
  cancelAsAdmin(@Param('id') id: string) {
    return this.appointmentsService.cancelAsAdmin(id);
  }
}
