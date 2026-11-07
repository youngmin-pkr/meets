import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  AVATAR_COLOR_KEYS,
  AVATAR_COLORS,
  avatarInitial,
  checkNickname,
  decideSignupAgeOutcome,
  hasAgreedToRequiredTerms,
  manAge,
  nextSignupStep,
  NICKNAME_PROBLEM_MESSAGES,
  TERMS,
  todayInSeoul,
  type AgreedTerm,
  type AvatarColor,
  type IdentityResult,
  type SignupStep,
} from '@meets/shared';
import { AccountStateService } from '../account-state/account-state.service';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { SERVER_CONFIG, type ServerConfig } from '../config';
import { IDENTITY_PROVIDER, type IdentityProvider } from '../identity/identity-provider';
import { PolicyService } from '../policy/policy.service';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';

interface ProgressFields {
  profileCompletedAt: Date | null;
  fandomStepCompletedAt: Date | null;
  signupCompletedAt: Date | null;
}

function stepOf(user: ProgressFields): SignupStep {
  return nextSignupStep({
    profileCompleted: user.profileCompletedAt !== null,
    fandomStepCompleted: user.fandomStepCompletedAt !== null,
    signupCompleted: user.signupCompletedAt !== null,
  });
}

@Injectable()
export class SignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly sessions: SessionService,
    private readonly accountState: AccountStateService,
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 앱이 가입 화면을 그릴 때 필요한 값 */
  async getConfig() {
    const p = await this.policy.getNumbers([
      'NICKNAME_MIN_LENGTH',
      'NICKNAME_MAX_LENGTH',
      'FANDOM_MAX_COUNT',
      'SIGNUP_MIN_AGE',
    ]);
    return {
      identityProvider: this.identityProvider.name,
      terms: TERMS,
      nicknameMinLength: p.NICKNAME_MIN_LENGTH,
      nicknameMaxLength: p.NICKNAME_MAX_LENGTH,
      fandomMaxCount: p.FANDOM_MAX_COUNT,
      signupMinAge: p.SIGNUP_MIN_AGE,
      avatarColors: AVATAR_COLORS,
    };
  }

  private hashCi(ci: string): string {
    return createHmac('sha256', this.config.ciHashSecret).update(ci).digest('hex');
  }

  /**
   * 본인 확인 결과로 가입하거나 다시 로그인합니다.
   * 성인이 아니면 아무것도 저장하지 않습니다.
   */
  async verifyIdentity(verificationToken: string, agreedTerms: AgreedTerm[]): Promise<IdentityResult> {
    const identity = await this.identityProvider.verify(verificationToken);
    if (!identity) throw new AppError('INVALID_VERIFICATION', '본인 확인을 다시 해 주세요.');

    const limits = await this.policy.getNumbers(['ADULT_MIN_AGE', 'SIGNUP_MIN_AGE']);
    const age = manAge(identity.birthDate, todayInSeoul(this.clock.now()));
    const outcome = decideSignupAgeOutcome(age, {
      adultMinAge: limits.ADULT_MIN_AGE,
      signupMinAge: limits.SIGNUP_MIN_AGE,
    });
    // 청소년 모드는 법률 검토 전까지 만들지 않으므로 계정을 만들지 않습니다. (CLAUDE.md 규칙 10)
    if (outcome !== 'ADULT') return { outcome };

    const ciHash = this.hashCi(identity.ci);
    const existing = await this.loginExisting(ciHash);
    if (existing) return existing;

    if (!hasAgreedToRequiredTerms(agreedTerms)) {
      throw new AppError('TERMS_REQUIRED', '필수 약관에 동의해 주세요.');
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await this.accountState.createVerifiedAdult(tx);
        await tx.identityVerification.create({
          data: { userId: created.id, ciHash, provider: this.identityProvider.name },
        });
        await tx.termsConsent.createMany({
          data: TERMS.map((t) => ({ userId: created.id, termCode: t.code, termVersion: t.version })),
        });
        return created;
      });
      const sessionToken = await this.sessions.create(user.id);
      return { outcome: 'SIGNED_UP', sessionToken, nextStep: stepOf(user) };
    } catch (error) {
      // 같은 사람이 동시에 두 번 가입을 누른 경우: 먼저 만들어진 계정으로 로그인
      if (isUniqueViolation(error, 'ciHash')) {
        const again = await this.loginExisting(ciHash);
        if (again) return again;
      }
      throw error;
    }
  }

  private async loginExisting(ciHash: string): Promise<IdentityResult | null> {
    const found = await this.prisma.identityVerification.findUnique({
      where: { ciHash },
      include: { user: true },
    });
    if (!found) return null;
    if (found.user.status !== 'ACTIVE') return { outcome: 'ACCOUNT_UNAVAILABLE' };
    const sessionToken = await this.sessions.create(found.userId);
    return { outcome: 'LOGGED_IN', sessionToken, nextStep: stepOf(found.user) };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { fandoms: { include: { fandom: true }, orderBy: { createdAt: 'asc' } } },
    });
    return {
      nickname: user.nickname,
      avatarInitial: user.avatarInitial,
      avatarColor: user.avatarColor,
      fandomPublic: user.fandomPublic,
      fandoms: user.fandoms.map((f) => ({ id: f.fandom.id, name: f.fandom.name })),
      notificationChoice: user.notificationChoice,
      nextStep: stepOf(user),
    };
  }

  async updateProfile(userId: string, rawNickname: string, avatarColor: string) {
    if (!AVATAR_COLOR_KEYS.includes(avatarColor as AvatarColor)) {
      throw new AppError('INVALID_AVATAR_COLOR', '색을 다시 골라 주세요.');
    }
    const limits = await this.policy.getNumbers(['NICKNAME_MIN_LENGTH', 'NICKNAME_MAX_LENGTH']);
    const check = checkNickname(rawNickname, {
      minLength: limits.NICKNAME_MIN_LENGTH,
      maxLength: limits.NICKNAME_MAX_LENGTH,
    });
    if (!check.ok) {
      throw new AppError('NICKNAME_INVALID', NICKNAME_PROBLEM_MESSAGES[check.problem], {
        problem: check.problem,
        minLength: limits.NICKNAME_MIN_LENGTH,
        maxLength: limits.NICKNAME_MAX_LENGTH,
      });
    }

    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          nickname: check.nickname,
          nicknameKey: check.key,
          avatarInitial: avatarInitial(check.nickname),
          avatarColor,
          profileCompletedAt: current.profileCompletedAt ?? this.clock.now(),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'nicknameKey')) {
        throw new AppError('NICKNAME_TAKEN', NICKNAME_PROBLEM_MESSAGES.TAKEN);
      }
      throw error;
    }
    return this.getMe(userId);
  }

  /** 팬덤 고르기. 빈 목록이면 '건너뛰기'입니다. */
  async setFandoms(userId: string, fandomIds: string[], isPublic = false) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.profileCompletedAt) {
      throw new AppError('STEP_ORDER', '별명을 먼저 정해 주세요.');
    }
    const ids = [...new Set(fandomIds)];
    const max = await this.policy.getNumber('FANDOM_MAX_COUNT');
    if (ids.length > max) {
      throw new AppError('FANDOM_LIMIT', `팬덤은 최대 ${max}개까지 고를 수 있어요.`, { max });
    }
    const found = await this.prisma.fandom.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new AppError('FANDOM_NOT_FOUND', '고른 팬덤을 찾을 수 없어요.');
    }

    await this.prisma.$transaction([
      this.prisma.userFandom.deleteMany({ where: { userId } }),
      this.prisma.userFandom.createMany({ data: ids.map((fandomId) => ({ userId, fandomId })) }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          fandomPublic: isPublic,
          fandomStepCompletedAt: user.fandomStepCompletedAt ?? this.clock.now(),
        },
      }),
    ]);
    return this.getMe(userId);
  }

  /** 준비 완료 화면의 알림 권한 선택. 한 번만 묻습니다. */
  async setNotificationChoice(userId: string, granted: boolean) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.profileCompletedAt || !user.fandomStepCompletedAt) {
      throw new AppError('STEP_ORDER', '앞 단계를 먼저 마쳐 주세요.');
    }
    // 동시에 두 번 눌러도 한 번만 기록되도록, 아직 고르지 않은 경우에만 바꿉니다.
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, notificationChoice: null },
      data: {
        notificationChoice: granted ? 'ALLOWED' : 'DENIED',
        signupCompletedAt: user.signupCompletedAt ?? this.clock.now(),
      },
    });
    if (updated.count === 0) {
      throw new AppError('NOTIFICATION_ALREADY_ASKED', '알림 설정은 이미 골랐어요.');
    }
    return this.getMe(userId);
  }

  async searchFandoms(query: string) {
    const q = query.trim().slice(0, 50);
    return this.prisma.fandom.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      take: 20,
      select: { id: true, name: true },
    });
  }
}
