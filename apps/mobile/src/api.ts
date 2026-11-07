/**
 * 서버와 주고받는 부분
 *
 * 서버 주소는 EXPO_PUBLIC_API_URL 환경 변수로 정합니다. (예: http://192.168.0.10:3000)
 * 로그인 토큰은 지금은 앱이 켜져 있는 동안만 기억합니다.
 */
import type { AgreedTerm, IdentityResult, SignupStep } from '@meets/shared';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.code ?? 'UNKNOWN', data.message ?? '잠시 후 다시 시도해 주세요.', data.detail);
  }
  return data as T;
}

export interface SignupConfig {
  identityProvider: string;
  terms: Array<{ code: string; title: string; version: string; required: boolean }>;
  nicknameMinLength: number;
  nicknameMaxLength: number;
  fandomMaxCount: number;
  signupMinAge: number;
  avatarColors: Record<string, string>;
}

export interface Me {
  nickname: string | null;
  avatarInitial: string | null;
  avatarColor: string | null;
  fandomPublic: boolean;
  fandoms: Array<{ id: string; name: string }>;
  notificationChoice: 'ALLOWED' | 'DENIED' | null;
  nextStep: SignupStep;
}

export const api = {
  getConfig: () => call<SignupConfig>('GET', '/signup/config'),
  verifyIdentity: (verificationToken: string, agreedTerms: AgreedTerm[]) =>
    call<IdentityResult>('POST', '/auth/identity', { verificationToken, agreedTerms }),
  getMe: () => call<Me>('GET', '/me'),
  updateProfile: (nickname: string, avatarColor: string) =>
    call<Me>('PUT', '/me/profile', { nickname, avatarColor }),
  searchFandoms: (q: string) =>
    call<Array<{ id: string; name: string }>>('GET', `/fandoms?q=${encodeURIComponent(q)}`),
  setFandoms: (fandomIds: string[], isPublic: boolean) =>
    call<Me>('PUT', '/me/fandoms', { fandomIds, isPublic }),
  setNotificationChoice: (granted: boolean) =>
    call<Me>('POST', '/me/notification-choice', { granted }),
};
