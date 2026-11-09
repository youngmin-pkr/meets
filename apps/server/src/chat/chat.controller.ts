import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { ChatService } from './chat.service';

export class SendChatDto {
  /** 글자 수 규칙(정책 값)은 서비스에서 검사합니다. 여기서는 터무니없이 긴 요청만 막습니다. */
  @IsString()
  @MaxLength(5000)
  body: string;

  /** 연락처 경고를 보고 '그래도 보낼게요'를 골랐는지 */
  @IsOptional()
  @IsBoolean()
  confirmContact?: boolean;
}

export class ChatQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after?: number;
}

/** 사용자 앱: 앱 안 채팅 (사진·위치 보내기는 없습니다) */
@Controller()
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('me/chats')
  list(@CurrentUserId() userId: string) {
    return this.chat.list(userId);
  }

  @Get('appointments/:id/chat')
  view(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Query() q: ChatQueryDto) {
    return this.chat.view(userId, id, q.after);
  }

  @Post('appointments/:id/chat')
  send(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: SendChatDto) {
    return this.chat.send(userId, id, body.body, body.confirmContact === true);
  }
}
