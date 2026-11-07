import { Injectable } from '@nestjs/common';
import { parseCalendarDate, type CalendarDate } from '@meets/shared';

/**
 * 본인 확인 업체 연결부
 *
 * 업체가 정해지면 IdentityProvider를 구현한 클래스를 하나 더 만들고
 * identity.module.ts에서 바꿔 끼우면 됩니다. 나머지 코드는 바뀌지 않습니다.
 *
 * 업체는 이름·전화번호도 돌려주지만, 연결부에서 버리고
 * CI(사람마다 하나인 고유 번호)와 생년월일만 넘깁니다.
 */
export interface VerifiedIdentity {
  ci: string;
  birthDate: CalendarDate;
}

export interface IdentityProvider {
  readonly name: string;
  /** 앱이 받아 온 확인 결과 토큰을 검증합니다. 틀리면 null. */
  verify(verificationToken: string): Promise<VerifiedIdentity | null>;
}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

/**
 * 테스트용 가짜 본인 확인
 *
 * 토큰 형식: fake:<테스트 사용자 번호>:<생년월일 YYYY-MM-DD>
 * 예) fake:tester1:2000-05-01
 * 실제 서비스(production)에서는 config.ts가 막습니다.
 */
@Injectable()
export class FakeIdentityProvider implements IdentityProvider {
  readonly name = 'fake';

  async verify(verificationToken: string): Promise<VerifiedIdentity | null> {
    const m = /^fake:([A-Za-z0-9_-]{1,40}):(\d{4}-\d{2}-\d{2})$/.exec(verificationToken);
    if (!m) return null;
    const birthDate = parseCalendarDate(m[2]);
    if (!birthDate) return null;
    return { ci: `FAKE-CI-${m[1]}`, birthDate };
  }
}
