import { createHmac, timingSafeEqual } from 'node:crypto';

/** 약속 번호나 일행 번호에 서명을 붙인 주소용 값. 서명이 틀리면 열리지 않습니다. (값을 DB에 따로 저장하지 않음) */
export function signToken(secret: string, scope: string, id: string): string {
  const sig = createHmac('sha256', secret).update(`${scope}:${id}`).digest('base64url').slice(0, 22);
  return `${id}.${sig}`;
}

/** 서명이 맞으면 id, 아니면 null */
export function verifyToken(secret: string, scope: string, token: string): string | null {
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const id = token.slice(0, i);
  const want = Buffer.from(signToken(secret, scope, id).slice(id.length + 1));
  const given = Buffer.from(token.slice(i + 1));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return id;
}
