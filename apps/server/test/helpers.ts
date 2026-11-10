import type { INestApplication } from '@nestjs/common';
import { TERMS } from '@meets/shared';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import type { Clock } from '../src/common/clock';
import { loadConfig } from '../src/config';
import { PrismaService } from '../src/prisma/prisma.service';

/** 테스트 기준 날짜: 2026-11-07 정오(한국 시간) */
export const TEST_NOW = new Date('2026-11-07T03:00:00Z');

export class TestClock implements Clock {
  constructor(public current: Date = TEST_NOW) {}
  now() {
    return this.current;
  }
}

export const ALL_TERMS = TERMS.map((t) => ({ code: t.code, version: t.version }));

export async function startApp(clock: Clock = new TestClock(), logger?: false, random?: () => number) {
  const app = await createApp(loadConfig(), { clock, logger: logger ?? false, random });
  await app.init();
  return app;
}

export async function resetDb(app: INestApplication) {
  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ShareLink","SafetyCheck","PartyMember","Party","UserRestriction","TrustChange","Report","Block","Review","ChatRead","ChatMessage","Notification","AppointmentParticipant","Appointment","Proposal","TicketHash","TicketImage","TicketVerification","AttendancePlan","WaitRegistration","PreferenceDay","Preference","AdminApproval","AdminSession","AdminUser","EventReport","MeetingSpot","EventSegment","EventDay","Event","UserFandom","Fandom","Session","TermsConsent","IdentityVerification","User","PolicyValue","AuditLog" CASCADE',
  );
}

export function http(app: INestApplication) {
  return request(app.getHttpServer());
}

/** 테스트용 본인 확인 토큰 */
export const fakeToken = (person: string, birth: string, gender: 'M' | 'F' = 'F') => `fake:${person}:${birth}:${gender}`;

/** 성인으로 가입하고 로그인 토큰을 돌려줍니다. */
export async function signUpAdult(app: INestApplication, person = 'adult1') {
  const res = await http(app)
    .post('/auth/identity')
    .send({ verificationToken: fakeToken(person, '2000-01-01'), agreedTerms: ALL_TERMS })
    .expect(200);
  return res.body.sessionToken as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** 테스트용 운영자를 만들고 로그인 토큰을 돌려줍니다. */
export async function adminToken(app: INestApplication, role: 'REVIEWER' | 'REPORT_MANAGER' | 'EVENT_MANAGER' | 'ADMIN', loginId = role.toLowerCase()) {
  const { hashPassword } = await import('../src/admin/password');
  const prisma = app.get(PrismaService);
  await prisma.adminUser.create({ data: { loginId, role, passwordHash: await hashPassword('test-password-123') } });
  const res = await http(app).post('/admin/auth/login').send({ loginId, password: 'test-password-123' }).expect(200);
  return res.body.token as string;
}

/** 행사 입력 예시 (운영자가 등록할 때 보내는 값) */
export function eventInput(overrides: Record<string, unknown> = {}) {
  return {
    name: '테스트 밴드 콘서트',
    type: 'CONCERT',
    venue: '테스트홀',
    officialUrl: 'https://example.com/concert',
    ticketRequired: true,
    days: [
      {
        date: '2026-12-12',
        startTime: '15:00',
        endTime: '21:00',
        segments: [{ label: '공연', startTime: '18:00', endTime: '20:30' }],
      },
    ],
    meetingSpots: [
      { name: '정문 안내판 앞', isPublicPlace: true },
      { name: '관계자 통로', isPublicPlace: false },
    ],
    ...overrides,
  };
}
