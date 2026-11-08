/**
 * 티켓 캡처 처리: 가릴 영역을 검게 칠하고, 사진 속 숨은 정보(위치·기기 정보 등)를 지운 JPEG로 바꿉니다.
 * 원본은 메모리에서만 다루고 저장하지 않습니다.
 */
import sharp from 'sharp';
import { isValidMask, TICKET_LIMITS, type MaskBox } from '@meets/shared';
import { AppError } from '../common/app-error';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export async function maskTicketImage(
  base64: string,
  mimeType: string,
  masks: MaskBox[],
  maxBytes: number,
): Promise<Buffer> {
  if (!ALLOWED.includes(mimeType)) throw new AppError('IMAGE_INVALID', 'JPG, PNG, WEBP 이미지만 올릴 수 있어요.');
  if (masks.length > TICKET_LIMITS.maxMasks || !masks.every(isValidMask)) {
    throw new AppError('IMAGE_INVALID', '가린 영역을 다시 확인해 주세요.');
  }
  const original = Buffer.from(base64, 'base64');
  if (original.length === 0) throw new AppError('IMAGE_INVALID', '이미지를 다시 골라 주세요.');
  if (original.length > maxBytes) {
    throw new AppError('IMAGE_TOO_LARGE', `이미지는 ${Math.round(maxBytes / 1024 / 1024)}MB까지 올릴 수 있어요.`);
  }

  let rotated: { data: Buffer; info: { width: number; height: number } };
  try {
    // rotate(): 사진의 회전 정보를 적용한 뒤 그 정보를 지웁니다.
    rotated = await sharp(original).rotate().toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError('IMAGE_INVALID', '이미지를 읽지 못했어요. 다른 사진을 골라 주세요.');
  }
  const { width, height } = rotated.info;

  const overlays = masks.map((m) => {
    const left = Math.min(width - 1, Math.max(0, Math.floor(m.x * width)));
    const top = Math.min(height - 1, Math.max(0, Math.floor(m.y * height)));
    const w = Math.max(1, Math.min(width - left, Math.ceil(m.w * width)));
    const h = Math.max(1, Math.min(height - top, Math.ceil(m.h * height)));
    return {
      input: { create: { width: w, height: h, channels: 3 as const, background: { r: 0, g: 0, b: 0 } } },
      left,
      top,
    };
  });
  // withMetadata()를 쓰지 않으면 EXIF(위치·기기 정보)가 모두 빠집니다.
  return sharp(rotated.data).composite(overlays).jpeg({ quality: 85 }).toBuffer();
}
