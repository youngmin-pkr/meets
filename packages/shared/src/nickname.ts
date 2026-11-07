/**
 * 별명 규칙
 *
 * - 글자 수는 정책 값(NICKNAME_MIN_LENGTH ~ NICKNAME_MAX_LENGTH)으로 정합니다.
 * - 한글 완성 글자, 영문, 숫자만 쓸 수 있습니다. (띄어쓰기·특수문자 불가)
 * - 연락처·SNS로 보이는 내용은 쓸 수 없습니다.
 * - 다른 사람과 같은 별명은 쓸 수 없습니다. (영문 대소문자는 같은 것으로 봅니다)
 */
import { detectContact } from './contact-detector';

export type NicknameProblem = 'TOO_SHORT' | 'TOO_LONG' | 'INVALID_CHARACTERS' | 'CONTAINS_CONTACT';

export interface NicknameLimits {
  minLength: number;
  maxLength: number;
}

export type NicknameCheck =
  | { ok: true; nickname: string; key: string }
  | { ok: false; problem: NicknameProblem };

const ALLOWED = /^[가-힣a-zA-Z0-9]+$/;

/** 같은 별명인지 비교할 때 쓰는 값 */
export function nicknameKey(nickname: string): string {
  return nickname.normalize('NFC').toLowerCase();
}

export function nicknameLength(nickname: string): number {
  return [...nickname.normalize('NFC')].length;
}

export function checkNickname(raw: string, limits: NicknameLimits): NicknameCheck {
  const nickname = raw.normalize('NFC').trim();
  const length = nicknameLength(nickname);
  if (length < limits.minLength) return { ok: false, problem: 'TOO_SHORT' };
  if (length > limits.maxLength) return { ok: false, problem: 'TOO_LONG' };
  if (!ALLOWED.test(nickname)) return { ok: false, problem: 'INVALID_CHARACTERS' };
  if (detectContact(nickname).detected) return { ok: false, problem: 'CONTAINS_CONTACT' };
  return { ok: true, nickname, key: nicknameKey(nickname) };
}

/** 사진 대신 보여 줄 첫 글자 */
export function avatarInitial(nickname: string): string {
  const first = [...nickname.normalize('NFC')][0] ?? '';
  return first.toUpperCase();
}

/** 첫 글자 뒤에 깔리는 색. 시안의 4가지 색입니다. */
export const AVATAR_COLORS = {
  ink: '#1B1A22',
  red: '#C93A22',
  gray: '#6A6670',
  green: '#4A7C59',
} as const;

export type AvatarColor = keyof typeof AVATAR_COLORS;

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS) as AvatarColor[];

/** 사용자에게 보여 줄 안내 문구 */
export const NICKNAME_PROBLEM_MESSAGES: Record<NicknameProblem | 'TAKEN', string> = {
  TOO_SHORT: '별명이 너무 짧아요.',
  TOO_LONG: '별명이 너무 길어요.',
  INVALID_CHARACTERS: '한글, 영문, 숫자만 쓸 수 있어요. 띄어쓰기와 특수문자는 안 돼요.',
  CONTAINS_CONTACT: '연락처나 SNS 아이디로 보이는 내용은 쓸 수 없어요.',
  TAKEN: '이미 다른 사람이 쓰고 있는 별명이에요.',
};
