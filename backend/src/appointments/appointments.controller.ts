import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  @Post('book')
  book(@CurrentUser() user: CurrentUserPayload, @Body() dto: BookAppointmentDto) {
    return this.appointmentsService.book(user.userId, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.appointmentsService.listMine(user.userId);
  }

  @Delete(':id')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.appointmentsService.cancelAsPatient(user.userId, id);
  }

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