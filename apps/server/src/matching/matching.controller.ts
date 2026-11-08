import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { CandidatesQuery, PreferenceDto, WaitRegistrationDto } from './matching.dto';
import { MatchingService } from './matching.service';

/** 사용자 앱: 입력 흐름, 후보 목록·상세, 후보 없음 알림 신청 */
@Controller('events/:eventId')
@UseGuards(AuthGuard)
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get('preference')
  getPreference(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.matching.getPreference(userId, eventId).then((p) => ({ preference: p }));
  }

  @Put('preference')
  savePreference(
    @CurrentUserId() userId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: PreferenceDto,
  ) {
    return this.matching.savePreference(userId, eventId, body);
  }

  @Get('candidates')
  candidates(
    @CurrentUserId() userId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() q: CandidatesQuery,
  ) {
    return this.matching.candidates(userId, eventId, {
      dayId: q.dayId || undefined,
      sort: q.sort,
      shortTime: q.shortTime === 'true',
      immersionPlus: q.immersionPlus === 'true',
    });
  }

  @Get('candidates/:candidateId')
  candidate(
    @CurrentUserId() userId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
  ) {
    return this.matching.candidateDetail(userId, eventId, candidateId);
  }

  @Post('wait-registrations')
  @HttpCode(200)
  registerWait(
    @CurrentUserId() userId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: WaitRegistrationDto,
  ) {
    return this.matching.registerWait(userId, eventId, body.includeImmersionPlus === true);
  }
}
