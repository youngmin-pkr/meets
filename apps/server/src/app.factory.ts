import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Clock } from './common/clock';
import { SafeExceptionFilter } from './common/safe-exception.filter';
import type { ServerConfig } from './config';
import type { RandomSource } from './tickets/ticket-recognizer';
import { json } from 'express';

/** 서버를 만듭니다. 실제 실행(main.ts)과 테스트가 같은 설정을 씁니다. */
export async function createApp(
  config: ServerConfig,
  options: { clock?: Clock; logger?: false; random?: RandomSource } = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(config, options.clock, options.random), {
    logger: options.logger,
    bodyParser: false,
  });
  // 티켓 캡처만 큰 요청을 받습니다. 실제 크기 제한은 정책 값(TICKET_IMAGE_MAX_MB)으로 다시 검사합니다.
  app.use('/tickets', json({ limit: '10mb' }));
  app.use(json({ limit: '100kb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // 정해진 칸 외의 값(예: ageClass)을 보내면 거절합니다. (CLAUDE.md 규칙 8)
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableCors();
  return app;
}
