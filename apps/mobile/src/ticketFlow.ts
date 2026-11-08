/**
 * 티켓 인증 화면에서 쓰는 계산 (화면 코드와 분리해서 테스트합니다)
 */
import type { MaskBox } from '@meets/shared';

/** 너무 작은 네모(실수로 톡 친 것)는 무시합니다. (화면 크기에 대한 비율) */
const MIN_SIDE = 0.02;

/** 끌기 시작점과 끝점(화면 좌표)을 이미지 크기에 대한 비율 네모로 바꿉니다. */
export function rectFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  size: { width: number; height: number },
): MaskBox | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x1 = clamp(Math.min(start.x, end.x) / size.width);
  const y1 = clamp(Math.min(start.y, end.y) / size.height);
  const x2 = clamp(Math.max(start.x, end.x) / size.width);
  const y2 = clamp(Math.max(start.y, end.y) / size.height);
  if (x2 - x1 < MIN_SIDE || y2 - y1 < MIN_SIDE) return null;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return { x: round(x1), y: round(y1), w: round(x2 - x1), h: round(y2 - y1) };
}

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  base64: string;
  mimeType: string;
}

/** 사진 고르기 결과에서 base64와 형식을 꺼냅니다. 웹에서는 uri가 data: 주소로 옵니다. */
export function toPickedImage(asset: {
  uri: string;
  width: number;
  height: number;
  base64?: string | null;
  mimeType?: string | null;
}): PickedImage | null {
  let base64 = asset.base64 ?? '';
  let mimeType = asset.mimeType ?? '';
  const m = /^data:([^;]+);base64,(.*)$/.exec(asset.uri);
  if (m) {
    mimeType = mimeType || m[1];
    base64 = base64 || m[2];
  }
  if (!base64) return null;
  if (!mimeType) mimeType = 'image/jpeg';
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  return { uri: asset.uri, width: asset.width, height: asset.height, base64, mimeType };
}
