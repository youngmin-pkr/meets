import { DynamicModule, Module } from '@nestjs/common';
import { AccountStateService } from './account-state/account-state.service';
import { AuthGuard } from './auth/auth.guard';
import { SessionService } from './auth/session.service';
import { CLOCK, systemClock, type Clock } from './common/clock';
import { SERVER_CONFIG, type ServerConfig } from './config';
import { FakeIdentityProvider, IDENTITY_PROVIDER } from './identity/identity-provider';
import { PolicyService } from './policy/policy.service';
import { PrismaService } from './prisma/prisma.service';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';

@Module({})
export class AppModule {
  static register(config: ServerConfig, clock: Clock = systemClock): DynamicModule {
    return {
      module: AppModule,
      controllers: [SignupController],
      providers: [
        { provide: SERVER_CONFIG, useValue: config },
        { provide: CLOCK, useValue: clock },
        // 업체가 정해지면 여기서 FakeIdentityProvider를 실제 업체 연결부로 바꿉니다.
        { provide: IDENTITY_PROVIDER, useClass: FakeIdentityProvider },
        PrismaService,
        PolicyService,
        AccountStateService,
        SessionService,
        AuthGuard,
        SignupService,
      ],
    };
  }
}
