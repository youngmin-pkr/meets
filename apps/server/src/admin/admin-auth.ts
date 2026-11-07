/**
 * 운영자 로그인과 권한 확인
 */
import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { verifyPassword } from './password';
import { isAllowed, type AdminAction, type AdminFunction, type AdminRoleName } from './permissions';

const HOUR_MS = 60 * 60 * 1000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface AdminPrincipal {
  id: string;
  role: AdminRoleName;
}

type AdminRequest = Request & { admin?: AdminPrincipal };

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async login(loginId: string, password: string): Promise<{ token: string; role: AdminRoleName }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { loginId } });
    // 아이디가 없을 때와 비밀번호가 틀릴 때 같은 안내를 보여 줍니다. (어느 쪽이 틀렸는지 알려 주지 않음)
    const ok = admin ? await verifyPassword(password, admin.passwordHash) : false;
    if (!admin || !ok || !admin.active) {
      throw new AppError('ADMIN_LOGIN_FAILED', '아이디 또는 비밀번호가 틀렸어요.');
    }
    const token = randomBytes(32).toString('base64url');
    const hours = await this.policy.getNumber('ADMIN_SESSION_TTL_HOURS');
    await this.prisma.adminSession.create({
      data: {
        adminId: admin.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(this.clock.now().getTime() + hours * HOUR_MS),
      },
    });
    await this.audit.record({ actorId: admin.id, action: 'ADMIN_LOGIN', targetType: 'AdminUser', targetId: admin.id });
    return { token, role: admin.role };
  }

  async resolve(token: string): Promise<AdminPrincipal | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { admin: true },
    });
    if (!session || session.expiresAt <= this.clock.now() || !session.admin.active) return null;
    return { id: session.admin.id, role: session.admin.role };
  }
}

const PERMISSION_KEY = 'adminPermission';

/** 이 주소를 쓰려면 어떤 권한이 필요한지 표시합니다. 예) @RequirePermission('MANAGE_EVENT', 'USE') */
export const RequirePermission = (fn: AdminFunction, action: AdminAction) =>
  SetMetadata(PERMISSION_KEY, { fn, action });

/** 운영자 로그인과 권한표 검사 (화면에서 숨기는 것과 상관없이 서버에서 막습니다) */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const admin = token ? await this.auth.resolve(token) : null;
    if (!admin) throw new AppError('UNAUTHORIZED', '운영자 로그인이 필요해요.');

    const need = this.reflector.get<{ fn: AdminFunction; action: AdminAction } | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!need) {
      // 권한 표시를 빠뜨린 주소는 열지 않습니다.
      throw new AppError('FORBIDDEN', '권한이 없어요.');
    }
    if (!isAllowed(admin.role, need.fn, need.action)) {
      throw new AppError('FORBIDDEN', '권한이 없어요.');
    }
    req.admin = admin;
    return true;
  }
}

export const CurrentAdmin = createParamDecorator((_: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AdminRequest>().admin as AdminPrincipal;
});
