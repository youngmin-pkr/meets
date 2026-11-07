import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../common/clock';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 로그인 유지 토큰. 토큰 원문은 앱만 갖고, 서버는 해시만 저장합니다. */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ttlDays = await this.policy.getNumber('SESSION_TTL_DAYS');
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(this.clock.now().getTime() + ttlDays * DAY_MS),
      },
    });
    return token;
  }

  /** 유효한 토큰이고 이용 중인 계정이면 사용자 id를 돌려줍니다. */
  async resolve(token: string): Promise<string | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { status: true } } },
    });
    if (!session) return null;
    if (session.expiresAt <= this.clock.now()) return null;
    if (session.user.status !== 'ACTIVE') return null;
    return session.userId;
  }
}
