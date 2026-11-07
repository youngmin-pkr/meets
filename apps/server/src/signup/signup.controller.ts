import { Body, Controller, Get, HttpCode, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import {
  IdentityRequestDto,
  NotificationChoiceDto,
  SetFandomsDto,
  UpdateProfileDto,
} from './signup.dto';
import { SignupService } from './signup.service';

@Controller()
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  /** 가입 화면에 필요한 값 (약관, 별명 글자 수, 팬덤 최대 개수 등) */
  @Get('signup/config')
  getConfig() {
    return this.signup.getConfig();
  }

  /** 휴대폰 본인 확인 결과로 가입 또는 다시 로그인 */
  @Post('auth/identity')
  @HttpCode(200)
  verifyIdentity(@Body() body: IdentityRequestDto) {
    return this.signup.verifyIdentity(body.verificationToken, body.agreedTerms ?? []);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUserId() userId: string) {
    return this.signup.getMe(userId);
  }

  @Put('me/profile')
  @UseGuards(AuthGuard)
  updateProfile(@CurrentUserId() userId: string, @Body() body: UpdateProfileDto) {
    return this.signup.updateProfile(userId, body.nickname, body.avatarColor);
  }

  @Put('me/fandoms')
  @UseGuards(AuthGuard)
  setFandoms(@CurrentUserId() userId: string, @Body() body: SetFandomsDto) {
    return this.signup.setFandoms(userId, body.fandomIds, body.isPublic);
  }

  @Post('me/notification-choice')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  setNotificationChoice(@CurrentUserId() userId: string, @Body() body: NotificationChoiceDto) {
    return this.signup.setNotificationChoice(userId, body.granted);
  }

  @Get('fandoms')
  @UseGuards(AuthGuard)
  searchFandoms(@Query('q') q?: string) {
    return this.signup.searchFandoms(typeof q === 'string' ? q : '');
  }
}
