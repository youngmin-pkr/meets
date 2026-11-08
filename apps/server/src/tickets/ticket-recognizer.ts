import { Injectable } from '@nestjs/common';

/**
 * 티켓 캡처 인식 연결부
 *
 * 지금은 업체가 없어서 사용자가 직접 적은 예매번호·날짜를 그대로 믿는 가짜 인식기를 씁니다.
 * (사용자 결정: 직접 입력 + 사람 검수 일부)
 * OCR 업체(구글, 네이버 CLOVA 등)를 쓰게 되면 이 인터페이스를 구현해서 바꿔 끼웁니다.
 * TODO(법률 검토): 외부 업체에 티켓 이미지를 보낼 경우 동의·국외 이전 검토가 필요합니다.
 */
export interface TicketRecognition {
  /** 글자를 읽을 수 있었는지 */
  readable: boolean;
  /** 고른 행사와 같아 보이는지 */
  sameEvent: boolean;
  /** 자신 있게 읽었는지. 낮으면 사람이 검수합니다. */
  confident: boolean;
}

export interface TicketRecognizer {
  readonly name: string;
  recognize(input: { image: Buffer; eventName: string; claimedNumber: string }): Promise<TicketRecognition>;
}

export const TICKET_RECOGNIZER = Symbol('TICKET_RECOGNIZER');

@Injectable()
export class ManualEntryRecognizer implements TicketRecognizer {
  readonly name = 'manual';

  async recognize(): Promise<TicketRecognition> {
    return { readable: true, sameEvent: true, confident: true };
  }
}

/** 무작위 점검을 고르는 주사위. 테스트에서 바꿔 끼울 수 있게 따로 둡니다. */
export const RANDOM = Symbol('RANDOM');
export type RandomSource = () => number;
