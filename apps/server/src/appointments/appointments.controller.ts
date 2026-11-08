import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CANCEL_REASON_CODES, type CancelReason } from '@meets/shared';
import { IsIn, IsOptional } from 'class-validator';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

export class CancelAppointmentDto {
  @IsOptional()
  @IsIn(CANCEL_REASON_CODES)
  reason?: CancelReason;
}

/** 사용자 앱: 약속, 알림함, 홈 요약 */
@Controller()
@UseGuards(AuthGuard)
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me/appointments')
  list(@CurrentUserId() userId: string) {
    return this.appointments.list(userId);
  }

  @Get('appointments/:id')
  get(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.get(userId, id);
  }

  @Post('appointments/:id/confirm')
  @HttpCode(200)
  confirm(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.confirm(userId, id);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: CancelAppointmentDto) {
    return this.appointments.cancel(userId, id, body.reason);
  }

  @Post('appointments/:id/arrive')
  @HttpCode(200)
  arrive(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.arrive(userId, id);
  }

  @Post('appointments/:id/no-show')
  @HttpCode(200)
  noShow(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.reportNoShow(userId, id);
  }

  @Get('me/notifications')
  async listNotifications(@CurrentUserId() userId: string) {
    await this.appointments.settleForUser(userId);
    return this.notifications.list(userId);
  }

  @Post('me/notifications/read')
  @HttpCode(200)
  readNotifications(@CurrentUserId() userId: string) {
    return this.notifications.markAllRead(userId);
  }

  /** 홈 화면 요약: 읽지 않은 알림 수, 티켓 인증을 한 행사가 있는지 */
  @Get('me/home')
  async home(@CurrentUserId() userId: string) {
    await this.appointments.settleForUser(userId);
    const [unreadNotifications, verified] = await Promise.all([
      this.notifications.unreadCount(userId),
      this.prisma.ticketVerification.count({ where: { userId, status: { in: ['VERIFIED'] } } }),
    ]);
    return { unreadNotifications, hasVerifiedTicket: verified > 0 };
  }
}
