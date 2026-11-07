import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from './app-error';

/**
 * 모든 오류를 여기서 응답으로 바꿉니다.
 *
 * 개인정보 보호(CLAUDE.md 규칙 11): 로그에는 오류 종류와 주소만 남기고,
 * 요청 내용이나 오류 원문 메시지는 남기지 않습니다.
 */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const route = `${req.method} ${req.route?.path ?? req.path}`;

    if (exception instanceof AppError) {
      this.logger.warn(`${route} -> ${exception.status} ${exception.code}`);
      res.status(exception.status).json({
        code: exception.code,
        message: exception.message,
        ...(exception.detail ? { detail: exception.detail } : {}),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.logger.warn(`${route} -> ${status} ${exception.name}`);
      // 입력 형식 오류(ValidationPipe)는 어떤 칸이 틀렸는지만 알려 줍니다.
      res.status(status).json({ code: 'BAD_REQUEST', message: '요청 형식이 올바르지 않아요.' });
      return;
    }

    const name = exception instanceof Error ? exception.name : 'Unknown';
    const prismaCode = (exception as { code?: unknown })?.code;
    this.logger.error(
      `${route} -> 500 ${name}${typeof prismaCode === 'string' ? ` ${prismaCode}` : ''}`,
    );
    res.status(500).json({ code: 'INTERNAL', message: '잠시 후 다시 시도해 주세요.' });
  }
}
