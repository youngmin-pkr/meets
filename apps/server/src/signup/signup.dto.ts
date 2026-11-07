import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * 요청 형식. 여기에 없는 칸(예: ageClass)을 보내면 서버가 거절합니다.
 * (main.ts의 forbidNonWhitelisted)
 */

export class AgreedTermDto {
  @IsString()
  @MaxLength(40)
  code: string;

  @IsString()
  @MaxLength(40)
  version: string;
}

export class IdentityRequestDto {
  @IsString()
  @MaxLength(2000)
  verificationToken: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AgreedTermDto)
  agreedTerms?: AgreedTermDto[];
}

export class UpdateProfileDto {
  @IsString()
  @MaxLength(100)
  nickname: string;

  @IsString()
  @MaxLength(20)
  avatarColor: string;
}

export class SetFandomsDto {
  @IsArray()
  // 실제 최대 개수는 정책 값으로 검사합니다. 이건 너무 큰 요청만 막는 안전장치입니다.
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  fandomIds: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class NotificationChoiceDto {
  @IsBoolean()
  granted: boolean;
}
