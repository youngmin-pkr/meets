/**
 * 연락처·SNS 감지기
 *
 * 별명과 (다음 단계의) 채팅 메시지에서 전화번호, 이메일, SNS 아이디, 링크,
 * 메신저 이름을 찾아냅니다. 감지 결과에는 어떤 종류인지만 담고,
 * 찾아낸 원문은 담지 않습니다. (로그에 연락처가 남지 않도록)
 */

export type ContactKind = 'PHONE' | 'EMAIL' | 'SNS_HANDLE' | 'URL' | 'MESSENGER';

export interface ContactDetection {
  detected: boolean;
  kinds: ContactKind[];
}

/** 숫자로 읽을 수 있는 한글 (예: 공일공 → 010) */
const KOREAN_DIGITS: Record<string, string> = {
  공: '0',
  영: '0',
  일: '1',
  이: '2',
  삼: '3',
  사: '4',
  오: '5',
  육: '6',
  륙: '6',
  칠: '7',
  팔: '8',
  구: '9',
};

/** 이만큼 이상 숫자가 이어지면 전화번호로 봅니다. */
const PHONE_DIGIT_RUN = 7;

/** 메신저·SNS 이름. 소문자, 띄어쓰기 없이 비교합니다. */
const MESSENGER_WORDS = [
  '카톡',
  '카카오',
  '오픈채팅',
  '오픈톡',
  '오카방',
  'kakao',
  'katalk',
  '인스타',
  'instagram',
  '텔레그램',
  'telegram',
  '라인아이디',
  'lineid',
  '트위터',
  'twitter',
  '디엠',
  '디스코드',
  'discord',
  '페이스북',
  'facebook',
  '틱톡',
  'tiktok',
  '스레드',
  'threads',
  '위챗',
  'wechat',
  '전화번호',
  '폰번호',
  '번호줘',
  '번호알려',
];

function normalize(text: string): string {
  // NFKC: 전각 숫자·문자(０１０, ＠)를 보통 문자로 바꿉니다.
  return text.normalize('NFKC').toLowerCase();
}

/** 숫자와 '숫자로 읽히는 한글'을 숫자로 바꾸고, 그 사이의 띄어쓰기·하이픈·점은 지웁니다. */
function toDigitSkeleton(text: string): string {
  let out = '';
  for (const ch of text) {
    if (/[0-9]/.test(ch)) out += ch;
    else if (KOREAN_DIGITS[ch] !== undefined) out += KOREAN_DIGITS[ch];
    else if (/[\s\-._·)(]/.test(ch)) continue; // 구분 기호는 건너뜀
    else out += '|'; // 다른 글자가 나오면 숫자 이어짐이 끊김
  }
  return out;
}

function hasPhone(text: string): boolean {
  const skeleton = toDigitSkeleton(text);
  const runs = skeleton.split('|');
  if (runs.some((run) => run.length >= PHONE_DIGIT_RUN)) return true;
  // 휴대폰 번호 앞자리(010 등)는 짧아도 감지
  return runs.some((run) => /^01[016789]/.test(run) && run.length >= 3);
}

export function detectContact(input: string): ContactDetection {
  const text = normalize(input);
  const compact = text.replace(/\s+/g, '');
  const kinds = new Set<ContactKind>();

  if (hasPhone(text)) kinds.add('PHONE');
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(compact)) kinds.add('EMAIL');
  else if (/@[a-z0-9_.]{2,}/.test(compact)) kinds.add('SNS_HANDLE');
  if (
    /https?:\/\//.test(compact) ||
    /www\./.test(compact) ||
    /[a-z0-9-]+\.(com|net|kr|co|me|io|ly|gg|link)\b/.test(compact) ||
    /(open\.kakao|t\.me|instagram\.com|x\.com)/.test(compact)
  ) {
    kinds.add('URL');
  }
  if (MESSENGER_WORDS.some((word) => compact.includes(word))) kinds.add('MESSENGER');

  return { detected: kinds.size > 0, kinds: [...kinds] };
}
