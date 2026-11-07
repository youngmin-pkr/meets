/**
 * 앱이 이해하는 오류. code로 화면에서 어떤 안내를 보일지 정합니다.
 * message에는 사용자가 입력한 값(별명, 연락처 등)을 넣지 마세요.
 */
export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_VERIFICATION'
  | 'TERMS_REQUIRED'
  | 'NICKNAME_INVALID'
  | 'NICKNAME_TAKEN'
  | 'INVALID_AVATAR_COLOR'
  | 'FANDOM_LIMIT'
  | 'FANDOM_NOT_FOUND'
  | 'STEP_ORDER'
  | 'NOTIFICATION_ALREADY_ASKED'
  | 'INVALID_TRANSITION';

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  INVALID_VERIFICATION: 400,
  TERMS_REQUIRED: 400,
  NICKNAME_INVALID: 400,
  NICKNAME_TAKEN: 409,
  INVALID_AVATAR_COLOR: 400,
  FANDOM_LIMIT: 400,
  FANDOM_NOT_FOUND: 400,
  STEP_ORDER: 409,
  NOTIFICATION_ALREADY_ASKED: 409,
  INVALID_TRANSITION: 409,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly detail?: Record<string, string | number>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
}
