/**
 * 상태 값은 각 상태 전이 모듈에서만 쓴다 (CLAUDE.md 규칙 2, 8)
 * - 계정(ageClass·status): src/account-state/
 * - 행사(status): src/events/event-state.service.ts
 * - 티켓 인증(status): src/tickets/ticket-state.service.ts
 * - 제안·약속(status): src/proposals/proposal-state.service.ts
 * 다른 파일에서 상태 값을 직접 저장하려 하면 이 테스트가 실패합니다.
 * 조회 조건은 { equals: 'ACTIVE' }, { in: [...] }처럼 써서 저장과 구별합니다.
 * 결과를 돌려주는 응답(예: return { status: 'VERIFIED' as const })은 저장이 아니라서 검사하지 않습니다.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(__dirname, '..', 'src');
const ALLOWED = [
  path.join(SRC, 'account-state'),
  path.join(SRC, 'events', 'event-state.service.ts'),
  path.join(SRC, 'tickets', 'ticket-state.service.ts'),
  path.join(SRC, 'proposals', 'proposal-state.service.ts'),
];

/** 계정·행사 상태 값을 직접 넣는 코드 (예: status: 'CANCELLED', ageClass: 'ADULT') */
const STATE_WRITE =
  /\bageClass\s*:\s*['"]|\bstatus\s*:\s*['"](ACTIVE|SUSPENDED|WITHDRAWN|REPORTED|REVIEWING|REGISTERED|REJECTED|CHANGED|CANCELLED|STARTED|UPLOADED|CONFIRMED|REVIEW_PENDING|VERIFIED|FAILED|REVERIFYING|SENT|ACCEPTED|EXPIRED|PENDING_CONFIRM|IN_PROGRESS|ENDED|ENDED_EARLY|RESCHEDULING|ON_HOLD|AUTO_ENDED)['"]/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

test('ageClass·status 값을 쓰는 코드는 상태 전이 모듈에만 있다', () => {
  const offenders = sourceFiles(SRC)
    .filter((file) => !ALLOWED.some((allowed) => file.startsWith(allowed)))
    .filter((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .some((line) => STATE_WRITE.test(line) && !line.includes('as const')),
    );
  expect(offenders).toEqual([]);
});
