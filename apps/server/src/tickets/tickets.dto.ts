import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { TicketFailReason, TicketKind } from '@meets/shared';

export class StartTicketDto {
  @IsIn(['TICKET', 'RESERVATION'])
  kind: TicketKind;
}

export class MaskBoxDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  w: number;

  @IsNumber()
  h: number;
}

/** 가릴 영역과 함께 올리는 캡처. 원본은 서버에 저장하지 않습니다. */
export class UploadTicketImageDto {
  @IsString()
  // 정책 값(최대 MB)으로 다시 검사합니다. 이건 너무 큰 요청만 먼저 막는 안전장치입니다.
  @MaxLength(15_000_000)
  imageBase64: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MaskBoxDto)
  masks: MaskBoxDto[];
}

/** 인식 결과 확인: 예매번호와 입장할 수 있는 날 */
export class ConfirmTicketDto {
  @IsString()
  @MaxLength(60)
  reservationNumber: string;

  @IsArray()
  @ArrayMaxSize(31)
  @IsUUID('all', { each: true })
  admissibleDayIds: string[];
}

export class RejectTicketDto {
  @IsIn(['UNREADABLE', 'WRONG_EVENT', 'DUPLICATE', 'OTHER'])
  reason: TicketFailReason;
}

export class ReverifyDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}

export class ViewImageQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
