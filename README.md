# 동행 플랫폼 (meets)

행사 동행 매칭 앱입니다. 규칙은 `docs/정리문서.md`, 작업 방식은 `CLAUDE.md`를 보세요.

## 폴더 구조

| 폴더 | 내용 |
| --- | --- |
| `packages/shared` | 앱과 서버가 함께 쓰는 규칙: 정책 값 기본값, 만 나이 계산, 별명 규칙, 연락처·SNS 감지 |
| `apps/server` | 서버 (NestJS + Prisma + PostgreSQL). 권한·상태 전이·나이 판정은 모두 여기서 합니다 |
| `apps/mobile` | 휴대폰 앱 (React Native + Expo) |

## 정해진 것

- 기술 스택: React Native·Expo / NestJS / PostgreSQL(Prisma) / FCM 푸시 / 직접 만드는 채팅
- 본인 확인: 업체가 정해지기 전까지 **테스트용 가짜 본인 확인**(`fake`)을 씁니다. 실제 서비스(`NODE_ENV=production`)에서는 서버가 시작하지 않습니다.
- 같은 별명은 쓸 수 없습니다 (영문 대소문자 구분 없음). 별명은 2~10자 (정책 값).
- '같은 팬을 먼저 보여 주세요'는 팬덤을 고르면 항상 켜진 것으로 봅니다.
- 생년월일·이름·전화번호는 저장하지 않습니다. 같은 사람 확인용으로 CI의 해시만 저장합니다.
- 청소년(만 14~17세)은 법률 검토가 끝날 때까지 가입하지 못하고 안내만 봅니다.

## 1단계에서 만든 것: 가입·본인 확인

시작 → 약관 동의 + 본인 확인 → (성인) 별명·색 → 팬덤(건너뛰기 가능) → 준비 완료(알림 권한 한 번만)

- 만 14세 미만, 청소년은 계정을 만들지 않고 안내 화면만 보여 줍니다.
- '이미 계정이 있어요'는 본인 확인을 다시 해서 같은 사람이면 기존 계정으로 들어갑니다.

| 주소 | 하는 일 |
| --- | --- |
| `GET /signup/config` | 약관, 별명 글자 수, 팬덤 최대 개수 등 |
| `POST /auth/identity` | 본인 확인 결과로 가입 또는 로그인 |
| `GET /me` | 내 정보와 다음 가입 화면 |
| `PUT /me/profile` | 별명과 색 |
| `GET /fandoms?q=` | 팬덤 검색 |
| `PUT /me/fandoms` | 팬덤 고르기 (빈 목록 = 건너뛰기) |
| `POST /me/notification-choice` | 알림 권한 선택 (한 번만) |

## 테스트 실행

PostgreSQL이 켜져 있어야 합니다. 테스트는 `meets_test` DB를 씁니다.

```bash
npm install
```

```bash
npm test
```

다른 DB 주소를 쓰려면 `TEST_DATABASE_URL`을 정하세요.

## 서버 실행 (개발용)

```bash
cp apps/server/.env.example apps/server/.env
```

```bash
cd apps/server && set -a && . ./.env && set +a && npx prisma migrate deploy && npm run db:seed && npm run build && npm start
```

## 앱 실행 (개발용)

휴대폰에 **Expo Go** 앱을 설치한 뒤, 같은 와이파이에서 다음을 실행하고 QR 코드를 찍습니다.
`EXPO_PUBLIC_API_URL`에는 서버를 켠 컴퓨터의 주소를 넣습니다.

```bash
cd apps/mobile && EXPO_PUBLIC_API_URL=http://<컴퓨터 IP>:3000 npx expo start
```

테스트용 본인 확인 칸에 아무 테스트 사용자 번호(예: `tester1`)와 생년월일(예: `2000-05-01`)을 넣으면 됩니다.
같은 번호를 다시 넣으면 같은 사람으로 봅니다.

## 메모

- `multer`는 서버 프레임워크가 쓰는 파일 업로드 도구입니다. 보안 문제가 있는 버전을 피하려고 2.5.0으로 고정했습니다 (`package.json`의 `overrides`).
- 코드에서 `TODO(법률 검토)`로 표시한 곳은 출시 전에 확인이 필요합니다.
