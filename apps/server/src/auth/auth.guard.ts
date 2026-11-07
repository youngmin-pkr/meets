import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/app-error';
import { SessionService } from './session.service';

type AuthedRequest = Request & { userId?: string };

/** 로그인한 사용자만 통과시킵니다. (권한 검사는 서버에서, CLAUDE.md 규칙 3) */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const userId = token ? await this.sessions.resolve(token) : null;
    if (!userId) throw new AppError('UNAUTHORIZED', '다시 로그인해 주세요.');
    req.userId = userId;
    return true;
  }
}

/** 로그인한 사용자의 id */
export const CurrentUserId = createParamDecorator((_: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AuthedRequest>().userId as string;
});
