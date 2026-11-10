import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { CandidatesQuery } from '../matching/matching.dto';
import { SendProposalDto } from '../proposals/proposals.controller';
import { PartyProposalsService } from './party-proposals.service';
import { PartiesService } from './parties.service';

/** 사용자 앱: 일행 만들기·초대·합류·빠지기·후보 */
@Controller()
@UseGuards(AuthGuard)
export class PartiesController {
  constructor(
    private readonly parties: PartiesService,
    private readonly partyProposals: PartyProposalsService,
  ) {}

  @Post('events/:eventId/party')
  create(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.parties.create(userId, eventId);
  }

  @Get('events/:eventId/party')
  forEvent(@CurrentUserId() userId: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.parties.forEvent(userId, eventId);
  }

  @Get('me/parties')
  list(@CurrentUserId() userId: string) {
    return this.parties.list(userId);
  }

  @Get('parties/:id')
  get(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.parties.get(userId, id);
  }

  @Post('parties/:id/leave')
  @HttpCode(200)
  leave(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.parties.leave(userId, id);
  }

  @Post('parties/:id/disband')
  @HttpCode(200)
  disband(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.parties.disband(userId, id);
  }

  @Post('parties/:id/proceed')
  @HttpCode(200)
  proceed(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.parties.proceedWithout(userId, id);
  }

  @Get('parties/:id/candidates')
  candidates(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Query() q: CandidatesQuery) {
    return this.parties.candidates(userId, id, {
      dayId: q.dayId || undefined,
      sort: q.sort,
      shortTime: q.shortTime === 'true',
      immersionPlus: q.immersionPlus === 'true',
    });
  }

  @Get('parties/:id/candidates/:candidateId')
  candidate(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Param('candidateId', ParseUUIDPipe) candidateId: string) {
    return this.parties.candidateDetail(userId, id, candidateId);
  }

  /** 일행 제안 초안 만들기 (나머지 일행원이 모두 동의해야 제안이 나감) */
  @Post('parties/:id/proposals')
  createProposal(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: SendProposalDto) {
    return this.partyProposals.create(userId, id, body);
  }

  @Post('proposals/:id/agree')
  @HttpCode(200)
  agree(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.partyProposals.agree(userId, id);
  }

  @Post('proposals/:id/decline')
  @HttpCode(200)
  decline(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.partyProposals.decline(userId, id);
  }

  @Get('party-invites/:token')
  preview(@CurrentUserId() userId: string, @Param('token') token: string) {
    return this.parties.preview(userId, token);
  }

  @Post('party-invites/:token/join')
  @HttpCode(200)
  join(@CurrentUserId() userId: string, @Param('token') token: string) {
    return this.parties.join(userId, token);
  }
}
