/**
 * 상태 값은 각 상태 전이 모듈에서만 쓴다 (CLAUDE.md 규칙 2, 8)
 * - 계정(ageClass·status): src/account-state/
 * - 행사(status): src/events/event-state.service.ts
 * 다른 파일에서 상태 값을 직접 저장하려 하면 이 테스트가 실패합니다.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(__dirname, '..', 'src');
const ALLOWED = [path.join(SRC, 'account-state'), path.join(SRC, 'events', 'event-state.service.ts')];

/** 계정·행사 상태 값을 직접 넣는 코드 (예: status: 'CANCELLED', ageClass: 'ADULT') */
const STATE_WRITE =
  /\bageClass\s*:\s*['"]|\bstatus\s*:\s*['"](ACTIVE|SUSPENDED|WITHDRAWN|REPORTED|REVIEWING|REGISTERED|REJECTED|CHANGED|CANCELLED)['"]/;

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
    .filter((file) => STATE_WRITE.test(fs.readFileSync(file, 'utf8')));
  expect(offenders).toEqual([]);
});
