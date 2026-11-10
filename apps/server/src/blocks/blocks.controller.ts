import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { REPORT_CATEGORY_CODES, type ReportCategory } from '@meets/shared';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { ReportsService } from '../reports/reports.service';
import { TrustService } from '../trust/trust.service';
import { BlocksService } from './blocks.service';

export class BlockDto {
  @IsUUID()
  userId: string;
}

export class BlockCounterpartDto {
  @IsUUID()
  appointmentId: string;

  /** 여러 명이 만나는 약속에서 누구를 차단하는지 (1:1이면 비움) */
  @IsOptional()
  @IsUUID()
  targetId?: string;
}

export class ReportDto {
  @IsUUID()
  appointmentId: string;

  @IsIn(REPORT_CATEGORY_CODES)
  category: ReportCategory;

  /** 글자 수 규칙(정책 값)은 서비스에서 검사합니다. 여기서는 터무니없이 긴 요청만 막습니다. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  detail?: string;

  @IsBoolean()
  alsoBlock: boolean;

  /** 여러 명이 만난 약속에서 누구를 신고하는지 (1:1이면 비움) */
  @IsOptional()
  @IsUUID()
  targetId?: string;
}

/** 사용자 앱: 차단, 신고 접수, 내 신뢰 단계 */
@Controller()
@UseGuards(AuthGuard)
export class BlocksController {
  constructor(
    private readonly blocks: BlocksService,
    private readonly reports: ReportsService,
    private readonly trust: TrustService,
  ) {}

  @Get('me/blocks')
  list(@CurrentUserId() userId: string) {
    return this.blocks.list(userId);
  }

  @Post('blocks')
  @HttpCode(200)
  block(@CurrentUserId() userId: string, @Body() body: BlockDto) {
    return this.blocks.block(userId, body.userId, 'ME');
  }

  /** 약속 상대 차단 (채팅 규칙 화면). 상대의 사용자 번호를 앱이 알 필요가 없습니다. */
  @Post('blocks/from-chat')
  @HttpCode(200)
  blockFromChat(@CurrentUserId() userId: string, @Body() body: BlockCounterpartDto) {
    return this.blocks.blockCounterpart(userId, body.appointmentId, 'CHAT', body.targetId);
  }

  @Delete('blocks/:userId')
  unblock(@CurrentUserId() userId: string, @Param('userId', ParseUUIDPipe) targetId: string) {
    return this.blocks.unblock(userId, targetId);
  }

  @Post('reports')
  @HttpCode(201)
  report(@CurrentUserId() userId: string, @Body() body: ReportDto) {
    return this.reports.create(userId, body);
  }

  @Get('me/trust')
  myTrust(@CurrentUserId() userId: string) {
    return this.trust.view(userId);
  }
}
