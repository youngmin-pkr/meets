import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { REVIEW_AGAIN_CODES, REVIEW_OVERALL_CODES, type ReviewAgain, type ReviewBadTag, type ReviewGoodTag, type ReviewOverall } from '@meets/shared';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { ReviewsService } from './reviews.service';

export class ReviewDto {
  @IsIn(REVIEW_OVERALL_CODES)
  overall: ReviewOverall;

  /** 칩 이름은 공통 규칙(checkReviewInput)에서 다시 검사합니다 */
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  goodTags: ReviewGoodTag[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  badTags: ReviewBadTag[];

  @IsIn(REVIEW_AGAIN_CODES)
  again: ReviewAgain;

  @IsBoolean()
  hideTarget: boolean;

  /** 여러 명이 만난 약속에서 누구에 대한 후기인지 (1:1이면 비움) */
  @IsOptional()
  @IsUUID()
  targetId?: string;
}

/** 사용자 앱: 후기 남기기. 후기를 읽는 주소는 없습니다. (내용은 상대에게 보이지 않음) */
@Controller()
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('appointments/:id/review')
  @HttpCode(201)
  submit(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReviewDto) {
    return this.reviews.submit(userId, id, body);
  }
}
