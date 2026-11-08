import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MUST_AGE_LABELS,
  MUST_GENDER_LABELS,
  PROMISE_CODES,
  type AnswerValue,
  type MustAge,
  type MustGender,
  type PromiseCode,
} from '@meets/shared';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DayPlanDto {
  @IsUUID()
  eventDayId: string;

  @Matches(TIME)
  arriveTime: string;

  @Matches(TIME)
  leaveTime: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  togetherSegmentIds: string[];
}

export class MustDto {
  @IsIn(Object.keys(MUST_GENDER_LABELS))
  gender: MustGender;

  @IsIn(Object.keys(MUST_AGE_LABELS))
  age: MustAge;

  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(PROMISE_CODES, { each: true })
  promises: PromiseCode[];
}

/** 입력 흐름 저장 */
export class PreferenceDto {
  @IsArray()
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => DayPlanDto)
  days: DayPlanDto[];

  @IsArray()
  @ArrayMaxSize(3)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(3, { each: true })
  tempoAnswers: AnswerValue[];

  /** 행사 종류에 맞는 질문 2개의 답 */
  @IsArray()
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(3, { each: true })
  immersionAnswers: AnswerValue[];

  @ValidateNested()
  @Type(() => MustDto)
  must: MustDto;
}

export class WaitRegistrationDto {
  @IsOptional()
  @IsBoolean()
  includeImmersionPlus?: boolean;
}

export class CandidatesQuery {
  @IsOptional()
  @IsString()
  dayId?: string;

  @IsOptional()
  @IsIn(['RECOMMENDED', 'OVERLAP'])
  sort?: 'RECOMMENDED' | 'OVERLAP';

  @IsOptional()
  @IsIn(['true', 'false'])
  shortTime?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  immersionPlus?: string;
}
