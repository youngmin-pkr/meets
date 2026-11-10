import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsUUID } from 'class-validator';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { ProposalsService } from './proposals.service';

export class SendProposalDto {
  @IsUUID()
  receiverId: string;

  @IsUUID()
  eventDayId: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  @Type(() => String)
  segmentIds: string[];

  @IsUUID()
  meetingSpotId: string;
}

export class SendInstantProposalDto {
  @IsUUID()
  receiverId: string;

  @IsUUID()
  meetingSpotId: string;

  @IsIn([30, 60])
  minutes: 30 | 60;
}

/** 사용자 앱: 제안과 약속 */
@Controller()
@UseGuards(AuthGuard)
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post('events/:eventId/proposals')
  send(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() body: SendProposalDto) {
    return this.proposals.send(userId, eventId, body);
  }

  /** 즉석 동행: 지금 만날 수 있는 후보에게 10분짜리 짧은 제안 */
  @Post('events/:eventId/instant/proposals')
  sendInstant(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() body: SendInstantProposalDto) {
    return this.proposals.sendInstant(userId, eventId, body);
  }

  @Get('me/proposals')
  list(@CurrentUserId() userId: string) {
    return this.proposals.list(userId);
  }

  @Post('proposals/:id/accept')
  @HttpCode(200)
  accept(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.proposals.accept(userId, id);
  }

  @Post('proposals/:id/reject')
  @HttpCode(200)
  reject(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.proposals.reject(userId, id);
  }

  @Post('proposals/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.proposals.cancel(userId, id);
  }
}
