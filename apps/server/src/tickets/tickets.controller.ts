import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { ConfirmTicketDto, StartTicketDto, UploadTicketImageDto } from './tickets.dto';
import { TicketsService } from './tickets.service';

/** 사용자 앱: 티켓 인증과 '참석 예정' */
@Controller()
@UseGuards(AuthGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('events/:eventId/ticket')
  status(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.tickets.myStatus(userId, eventId);
  }

  @Post('events/:eventId/tickets')
  start(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() body: StartTicketDto) {
    return this.tickets.start(userId, eventId, body.kind);
  }

  @Post('events/:eventId/attendance-plan')
  @HttpCode(200)
  plan(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.tickets.planWithoutTicket(userId, eventId);
  }

  @Post('tickets/:id/image')
  @HttpCode(200)
  upload(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: UploadTicketImageDto) {
    return this.tickets.uploadImage(userId, id, body.imageBase64, body.mimeType, body.masks);
  }

  @Post('tickets/:id/confirm')
  @HttpCode(200)
  confirm(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: ConfirmTicketDto) {
    return this.tickets.confirm(userId, id, body.reservationNumber, body.admissibleDayIds);
  }
}
