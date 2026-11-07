import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EVENT_CATEGORIES, EVENT_TYPES, type EventCategory, type EventType } from '@meets/shared';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class EventReportDto {
  @IsIn(EVENT_CATEGORIES)
  category: EventCategory;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dateText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeText?: string;

  @IsString()
  @MaxLength(2000)
  officialUrl: string;
}

export class SegmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @Matches(TIME)
  startTime: string;

  @Matches(TIME)
  endTime: string;
}

export class EventDayDto {
  @Matches(DATE)
  date: string;

  @Matches(TIME)
  startTime: string;

  @Matches(TIME)
  endTime: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SegmentDto)
  segments: SegmentDto[];
}

export class MeetingSpotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @IsBoolean()
  isPublicPlace: boolean;
}

/** 운영자가 행사를 등록·수정할 때 보내는 값 */
export class EventInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsIn(EVENT_TYPES)
  type: EventType;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  venue: string;

  @IsString()
  @MaxLength(2000)
  officialUrl: string;

  @IsBoolean()
  ticketRequired: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => EventDayDto)
  days: EventDayDto[];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MeetingSpotDto)
  meetingSpots: MeetingSpotDto[];
}

export class EventUpdateDto extends EventInputDto {
  /** 일정이 바뀌는 수정은 확인 화면을 거친 뒤 true로 다시 보냅니다. */
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class ReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason: string;
}

export class AdminLoginDto {
  @IsString()
  @MaxLength(60)
  loginId: string;

  @IsString()
  @MaxLength(200)
  password: string;
}
