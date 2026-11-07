/** 지금 시각. 테스트에서 날짜를 고정할 수 있도록 따로 둡니다. */
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
