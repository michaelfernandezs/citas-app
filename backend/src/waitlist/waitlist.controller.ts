import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { WaitlistService } from './waitlist.service';
import { RespondOfferDto, JoinWaitlistDto } from './dto/waitlist.dto';

@UseGuards(JwtAuthGuard)
@Controller('waitlist')
export class WaitlistController {
  constructor(private waitlistService: WaitlistService) {}

  @Post('join')
  join(@CurrentUser() user: CurrentUserPayload, @Body() dto: JoinWaitlistDto) {
    return this.waitlistService.join(user.userId, dto);
  }

  @Delete(':entryId')
  leave(@CurrentUser() user: CurrentUserPayload, @Param('entryId') entryId: string) {
    return this.waitlistService.leave(user.userId, entryId);
  }

  @Get('me')
  myStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.waitlistService.myStatus(user.userId);
  }

  @Post(':entryId/respond')
  respond(
    @CurrentUser() user: CurrentUserPayload,
    @Param('entryId') entryId: string,
    @Body() dto: RespondOfferDto,
  ) {
    return this.waitlistService.respondToOffer(user.userId, entryId, dto.accept);
  }
}
