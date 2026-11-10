import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, ValidateNested } from 'class-validator';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { InstantService } from './instant.service';

export class InstantStyleDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsIn([1, 2, 3], { each: true })
  tempoAnswers: Array<1 | 2 | 3>;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsIn([1, 2, 3], { each: true })
  immersionAnswers: Array<1 | 2 | 3>;
}

export class TurnOnDto {
  /** 저장된 입력이 없는 사람만 간단한 스타일 질문에 답합니다 */
  @IsOptional()
  @ValidateNested()
  @Type(() => InstantStyleDto)
  style?: InstantStyleDto;
}

/** 사용자 앱: 즉석 동행 (행사장에 있다고 알리기, 대기, 후보) */
@Controller()
@UseGuards(AuthGuard)
export class InstantController {
  constructor(private readonly instant: InstantService) {}

  @Get('me/instant-events')
  today(@CurrentUserId() userId: string) {
    return this.instant.todayEvents(userId);
  }

  @Get('events/:eventId/instant')
  status(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.instant.status(userId, eventId);
  }

  @Put('events/:eventId/instant')
  turnOn(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() body: TurnOnDto) {
    return this.instant.turnOn(userId, eventId, body.style);
  }

  @Delete('events/:eventId/instant')
  turnOff(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.instant.turnOff(userId, eventId);
  }

  @Get('events/:eventId/instant/candidates')
  candidates(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.instant.candidates(userId, eventId);
  }

  @Get('events/:eventId/instant/candidates/:candidateId')
  candidate(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string, @Param('candidateId', ParseUUIDPipe) candidateId: string) {
    return this.instant.candidateDetail(userId, eventId, candidateId);
  }
}
