import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminEventsService } from '../events/admin-events.service';
import { AdminLoginDto, EventInputDto, EventUpdateDto, ReasonDto } from '../events/events.dto';
import type { EventStatus } from '../generated/prisma/client';
import { EVENT_STATUS_STATES } from '../events/event-transitions';
import { AdminAuthService, AdminGuard, CurrentAdmin, RequirePermission, type AdminPrincipal } from './admin-auth';
import { AdminTicketsService } from '../tickets/admin-tickets.service';
import { RejectTicketDto, ReverifyDto, ViewImageQuery } from '../tickets/tickets.dto';

/**
 * 운영 콘솔용 서버 주소. 모든 주소는 서버에서 로그인과 권한표를 검사합니다.
 * (운영 콘솔 화면은 나중에 만듭니다.)
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly events: AdminEventsService,
    private readonly tickets: AdminTicketsService,
  ) {}

  // ───── 인증 검수 ─────

  @Get('ticket-reviews')
  @UseGuards(AdminGuard)
  @RequirePermission('REVIEW_TICKET', 'USE')
  ticketQueue(@CurrentAdmin() admin: AdminPrincipal) {
    return this.tickets.queue(admin.id);
  }

  /** 가린 이미지: 권한표상 검수자만 (관리자도 불가) */
  @Get('ticket-reviews/:id/image')
  @UseGuards(AdminGuard)
  @RequirePermission('VIEW_TICKET_IMAGE', 'USE')
  ticketImage(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query() q: ViewImageQuery) {
    return this.tickets.viewImage(admin.id, id, q.reason);
  }

  @Post('ticket-reviews/:id/approve')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @RequirePermission('REVIEW_TICKET', 'USE')
  approveTicket(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.approve(admin.id, id);
  }

  @Post('ticket-reviews/:id/reject')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @RequirePermission('REVIEW_TICKET', 'USE')
  rejectTicket(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() body: RejectTicketDto) {
    return this.tickets.reject(admin.id, id, body.reason);
  }

  @Post('ticket-reviews/:id/hold')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @RequirePermission('REVIEW_TICKET', 'USE')
  holdTicket(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.hold(admin.id, id);
  }

  /** 신고로 재검증 요청 (신고 처리 권한) */
  @Post('tickets/:id/reverify')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @RequirePermission('HANDLE_REPORT', 'USE')
  reverify(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReverifyDto) {
    return this.tickets.requestReverify(admin.id, id, body.reason);
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: AdminLoginDto) {
    return this.auth.login(body.loginId, body.password);
  }

  @Get('events')
  @UseGuards(AdminGuard)
  @RequirePermission('MANAGE_EVENT', 'USE')
  listEvents(@CurrentAdmin() admin: AdminPrincipal, @Query('status') status?: string) {
    const s = EVENT_STATUS_STATES.includes(status as EventStatus) ? (status as EventStatus) : undefined;
    return this.events.list(admin.id, s);
  }

  @Get('events/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('MANAGE_EVENT', 'USE')
  getEvent(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.get(admin.id, id);
  }

  @Post('events')
  @UseGuards(AdminGuard)
  @RequirePermission('MANAGE_EVENT', 'USE')
  createEvent(@CurrentAdmin() admin: AdminPrincipal, @Body() body: EventInputDto) {
    return this.events.create(admin.id, body);
  }

  @Put('events/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('MANAGE_EVENT', 'USE')
  updateEvent(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EventUpdateDto,
  ) {
    const { confirmed, ...input } = body;
    return this.events.update(admin.id, id, input as EventInputDto, confirmed === true);
  }

  @Post('events/:id/review')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @RequirePermission('MANAGE_EVENT', 'USE')
  startReview(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.startReview(admin.id, id);
  }

  @Post('events/:id/approve')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @RequirePermission('MANAGE_EVENT', 'USE')
  approve(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.approve(admin.id, id);
  }

  @Post('events/:id/reject')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @RequirePermission('MANAGE_EVENT', 'USE')
  reject(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto) {
    return this.events.reject(admin.id, id, body.reason);
  }

  @Post('events/:id/cancel-proposals')
  @UseGuards(AdminGuard)
  @RequirePermission('CANCEL_EVENT', 'PROPOSE')
  proposeCancel(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
  ) {
    return this.events.proposeCancel(admin.id, id, body.reason);
  }

  @Post('event-cancellations/:approvalId/confirm')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @RequirePermission('CANCEL_EVENT', 'CONFIRM')
  confirmCancel(@CurrentAdmin() admin: AdminPrincipal, @Param('approvalId', ParseUUIDPipe) approvalId: string) {
    return this.events.confirmCancel(admin.id, approvalId);
  }
}
