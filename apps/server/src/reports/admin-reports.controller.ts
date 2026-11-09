import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { REPORT_RESOLVE_ACTION_CODES, REPORT_STATUSES, type ReportResolveAction, type ReportStatus } from '@meets/shared';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { AdminGuard, CurrentAdmin, RequirePermission, type AdminPrincipal } from '../admin/admin-auth';
import { ReasonDto } from '../events/events.dto';
import { AdminReportsService } from './admin-reports.service';

export class ResolveReportDto {
  @IsIn(REPORT_RESOLVE_ACTION_CODES)
  action: ReportResolveAction;

  /** 최소 글자 수는 정책 값이라 서비스에서 검사합니다 */
  @IsString()
  @MaxLength(300)
  reason: string;
}

/**
 * 운영 콘솔용 서버 주소: 신고 처리. 모든 주소는 서버에서 로그인과 권한표를 검사합니다.
 * (운영 콘솔 화면은 나중에 만듭니다.)
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get('reports')
  @RequirePermission('HANDLE_REPORT', 'USE')
  queue(@CurrentAdmin() admin: AdminPrincipal, @Query('status') status?: string) {
    return this.reports.queue(admin.id, REPORT_STATUSES.includes(status as ReportStatus) ? (status as ReportStatus) : undefined);
  }

  @Get('reports/:id')
  @RequirePermission('HANDLE_REPORT', 'USE')
  detail(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.detail(admin.id, id);
  }

  @Post('reports/:id/claim')
  @HttpCode(200)
  @RequirePermission('HANDLE_REPORT', 'USE')
  claim(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.claim(admin.id, id);
  }

  /** 대화 기록 열람: 권한표상 신고 담당만 (관리자도 불가). 사유를 적어야 하고 열 때마다 기록됩니다. */
  @Post('reports/:id/chat')
  @HttpCode(200)
  @RequirePermission('VIEW_REPORT_CHAT', 'USE')
  chat(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto) {
    return this.reports.viewChat(admin.id, id, body.reason);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  @RequirePermission('HANDLE_REPORT', 'USE')
  resolve(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() body: ResolveReportDto) {
    return this.reports.resolve(admin.id, id, body.action, body.reason);
  }

  @Post('reports/:id/suspension-proposals')
  @HttpCode(201)
  @RequirePermission('SUSPEND_USER', 'PROPOSE')
  proposeSuspension(@CurrentAdmin() admin: AdminPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto) {
    return this.reports.proposeSuspension(admin.id, id, body.reason);
  }

  @Post('user-suspensions/:approvalId/confirm')
  @HttpCode(200)
  @RequirePermission('SUSPEND_USER', 'CONFIRM')
  confirmSuspension(@CurrentAdmin() admin: AdminPrincipal, @Param('approvalId', ParseUUIDPipe) approvalId: string) {
    return this.reports.confirmSuspension(admin.id, approvalId);
  }

  @Post('user-suspensions/:approvalId/decline')
  @HttpCode(200)
  @RequirePermission('SUSPEND_USER', 'CONFIRM')
  declineSuspension(@CurrentAdmin() admin: AdminPrincipal, @Param('approvalId', ParseUUIDPipe) approvalId: string, @Body() body: ReasonDto) {
    return this.reports.declineSuspension(admin.id, approvalId, body.reason);
  }
}
