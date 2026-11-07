/**
 * 서버와 주고받는 부분
 *
 * - 보통: EXPO_PUBLIC_API_URL의 서버로 요청합니다. (예: http://192.168.0.10:3000)
 * - 데모 모드(EXPO_PUBLIC_DEMO_MODE=1): 서버 없이 브라우저 안의 가짜 서버(demoBackend)를 씁니다.
 *   GitHub Pages에 올리는 웹 버전용입니다.
 * 로그인 토큰은 지금은 앱이 켜져 있는 동안만 기억합니다.
 */
import type { AgreedTerm, EventDetail, EventReportResult, EventSummary, IdentityResult } from '@meets/shared';
import { ApiError, type Backend, type Me, type SignupConfig } from './apiTypes';
import { createDemoBackend } from './demoBackend';

export { ApiError, type Me, type SignupConfig } from './apiTypes';

export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

function createHttpBackend(baseUrl: string): Backend {
  let sessionToken: string | null = null;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
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

  return {
    setSessionToken: (token) => {
      sessionToken = token;
    },
    getConfig: () => call<SignupConfig>('GET', '/signup/config'),
    verifyIdentity: (verificationToken: string, agreedTerms: AgreedTerm[]) =>
      call<IdentityResult>('POST', '/auth/identity', { verificationToken, agreedTerms }),
    getMe: () => call<Me>('GET', '/me'),
    updateProfile: (nickname, avatarColor) => call<Me>('PUT', '/me/profile', { nickname, avatarColor }),
    searchFandoms: (q) =>
      call<Array<{ id: string; name: string }>>('GET', `/fandoms?q=${encodeURIComponent(q)}`),
    setFandoms: (fandomIds, isPublic) => call<Me>('PUT', '/me/fandoms', { fandomIds, isPublic }),
    setNotificationChoice: (granted) => call<Me>('POST', '/me/notification-choice', { granted }),
    listEvents: ({ q, category }) => {
      const parts = [q ? `q=${encodeURIComponent(q)}` : '', category ? `category=${category}` : ''].filter(Boolean);
      return call<EventSummary[]>('GET', `/events${parts.length ? `?${parts.join('&')}` : ''}`);
    },
    getEvent: (id) => call<EventDetail>('GET', `/events/${encodeURIComponent(id)}`),
    reportEvent: (input) => call<EventReportResult>('POST', '/event-reports', input),
  };
}

export const api: Backend = IS_DEMO
  ? createDemoBackend()
  : createHttpBackend(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000');

export function setSessionToken(token: string | null) {
  api.setSessionToken(token);
}
