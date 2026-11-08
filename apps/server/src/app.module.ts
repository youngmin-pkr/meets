import { DynamicModule, Module } from '@nestjs/common';
import { AccountStateService } from './account-state/account-state.service';
import { AdminAuthService, AdminGuard } from './admin/admin-auth';
import { AdminController } from './admin/admin.controller';
import { AuditService } from './admin/audit.service';
import { AdminEventsService } from './events/admin-events.service';
import { EventStateService } from './events/event-state.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { MatchingController } from './matching/matching.controller';
import { MatchingService } from './matching/matching.service';
import { AdminTicketsService } from './tickets/admin-tickets.service';
import { ManualEntryRecognizer, RANDOM, TICKET_RECOGNIZER, type RandomSource } from './tickets/ticket-recognizer';
import { TicketStateService } from './tickets/ticket-state.service';
import { TicketsController } from './tickets/tickets.controller';
import { TicketsService } from './tickets/tickets.service';
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
  static register(config: ServerConfig, clock: Clock = systemClock, random: RandomSource = Math.random): DynamicModule {
    return {
      module: AppModule,
      controllers: [SignupController, EventsController, AdminController, MatchingController, TicketsController],
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
        AuditService,
        AdminAuthService,
        AdminGuard,
        EventStateService,
        EventsService,
        AdminEventsService,
        MatchingService,
        // 업체가 정해지면 OCR 인식기로 바꿉니다. 지금은 사용자가 직접 입력한 값을 씁니다.
        { provide: TICKET_RECOGNIZER, useClass: ManualEntryRecognizer },
        { provide: RANDOM, useValue: random },
        TicketStateService,
        TicketsService,
        AdminTicketsService,
      ],
    };
  }
}
