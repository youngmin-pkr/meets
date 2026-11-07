/**
 * 나이 구분(ageClass)은 상태 전이 모듈에서만 쓴다 (CLAUDE.md 규칙 2, 8)
 * 다른 파일에서 ageClass나 status를 직접 저장하려 하면 이 테스트가 실패합니다.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(__dirname, '..', 'src');
const ALLOWED_DIR = path.join(SRC, 'account-state');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

test('ageClass·status 값을 쓰는 코드는 account-state 폴더에만 있다', () => {
  const offenders = sourceFiles(SRC)
    .filter((file) => !file.startsWith(ALLOWED_DIR))
    .filter((file) => /\b(ageClass|status)\s*:\s*['"]/.test(fs.readFileSync(file, 'utf8')));
  expect(offenders).toEqual([]);
});
