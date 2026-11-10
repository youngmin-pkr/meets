import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { SafetyService } from './safety.service';

export class SafetySettingsDto {
  @IsOptional() @IsBoolean() checkEnabled?: boolean;
  @IsOptional() @IsBoolean() alertTrusted?: boolean;
}

export class CreateShareLinkDto {
  @IsBoolean() showStatus!: boolean;
}

export class AnswerSafetyCheckDto {
  @IsIn(['OK', 'HELP']) answer!: 'OK' | 'HELP';
}

/** 사용자 앱: 만남 중 안전 (설정, 도움 요청, 안전 확인 답, 믿는 사람 링크) */
@Controller()
@UseGuards(AuthGuard)
export class SafetyController {
  constructor(
    private readonly safety: SafetyService,
    private readonly appointments: AppointmentsService,
  ) {}

  @Get('me/safety-settings')
  getSettings(@CurrentUserId() userId: string) {
    return this.safety.getSettings(userId);
  }

  @Put('me/safety-settings')
  updateSettings(@CurrentUserId() userId: string, @Body() body: SafetySettingsDto) {
    return this.safety.updateSettings(userId, body);
  }

  @Post('appointments/:id/help')
  @HttpCode(200)
  help(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.requestHelp(userId, id);
  }

  @Post('appointments/:id/safety-checks/:checkId/answer')
  @HttpCode(200)
  answer(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checkId', ParseUUIDPipe) checkId: string,
    @Body() body: AnswerSafetyCheckDto,
  ) {
    return this.appointments.answerSafetyCheck(userId, id, checkId, body.answer);
  }

  @Get('appointments/:id/share-links')
  list(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.safety.listLinks(userId, id);
  }

  @Post('appointments/:id/share-links')
  create(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: CreateShareLinkDto) {
    return this.safety.createLink(userId, id, body.showStatus);
  }

  @Delete('share-links/:linkId')
  revoke(@CurrentUserId() userId: string, @Param('linkId', ParseUUIDPipe) linkId: string) {
    return this.safety.revokeLink(userId, linkId);
  }
}

/** 받는 사람이 여는 화면. 로그인이 없고, 서명이 맞는 링크만 열립니다. */
@Controller()
export class SharedLinkController {
  constructor(private readonly safety: SafetyService) {}

  @Get('share/:token')
  open(@Param('token') token: string) {
    return this.safety.openShared(token.slice(0, 200));
  }
}
