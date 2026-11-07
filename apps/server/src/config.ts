/**
 * 서버 설정 (환경 변수에서 읽음)
 * 정책 값(숫자 규칙)은 여기가 아니라 PolicyService에서 읽습니다.
 */
export interface ServerConfig {
  databaseUrl: string;
  ciHashSecret: string;
  identityProvider: 'fake';
  isProduction: boolean;
}

export const SERVER_CONFIG = Symbol('SERVER_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const databaseUrl = env.DATABASE_URL;
  const ciHashSecret = env.CI_HASH_SECRET;
  const identityProvider = env.IDENTITY_PROVIDER ?? 'fake';
  const isProduction = env.NODE_ENV === 'production';

  if (!databaseUrl) throw new Error('DATABASE_URL 환경 변수가 필요합니다.');
  if (!ciHashSecret) throw new Error('CI_HASH_SECRET 환경 변수가 필요합니다.');
  if (identityProvider !== 'fake') {
    throw new Error(`알 수 없는 본인 확인 방식입니다: ${identityProvider}`);
  }
  if (isProduction && identityProvider === 'fake') {
    // 테스트용 가짜 본인 확인으로는 누구나 아무 나이로 가입할 수 있으므로 실제 서비스에서는 막습니다.
    throw new Error('실제 서비스(production)에서는 테스트용 본인 확인(fake)을 쓸 수 없습니다.');
  }
  return { databaseUrl, ciHashSecret, identityProvider, isProduction };
}
