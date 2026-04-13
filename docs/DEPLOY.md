# 배포 (Vite + Vercel)

## 빌드

- 로컬: `npm run build` → 산출물은 `dist/`.
- Vercel은 저장소 연결 시 Vite를 자동 감지하는 경우가 많습니다. 출력 디렉터리가 `dist`인지 프로젝트 설정에서 확인하세요.

## SPA 라우팅

- 루트 `vercel.json`의 `rewrites`는 `/api/*`를 제외한 요청을 `index.html`로 넘깁니다. API 라우트(`api/` 폴더의 서버리스 함수)는 그대로 `/api/...`에서 동작합니다.
- `vercel.json`의 `headers`에서 보안 헤더를 함께 설정합니다.
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`

## 시세·KRX 프록시

- 한국 시세: `api/kr-quote.js` → 클라이언트는 기본적으로 `/api/kr-quote`로 요청합니다.
- KRX 종목 메타: `api/krx-kind.js` → `/api/krx-kind`.
- 두 라우트 모두 `api/_rateLimit.js`의 IP 기반 고정 윈도우 레이트리밋을 적용합니다.
  - `kr-quote`: 1분당 60회
  - `krx-kind`: 10분당 20회
- 프로덕션에서 다른 호스트로내려면 환경 변수로 베이스 URL만 바꿉니다(비밀 아님).
  - `VITE_KR_QUOTE_BASE`
  - `VITE_KRX_PROXY_BASE`

## Firebase(선택)

앱은 해당 문서에 JSON 문자열 필드 `body`와 `updatedAt`을 저장합니다 (`src/lib/cloudPortfolio.ts`).  
클라이언트에 넣는 `apiKey` 등은 웹에 노출되는 것이 정상입니다(서버 비밀키가 아님). 그래도 `.env`는 Git에 올리지 마세요.

### 처음 연결할 때(콘솔에서 할 일 — 대신할 수 없음)

1. **[Firestore]** 이미 `데이터베이스 만들기`와 **규칙 게시**(`firestore.rules`)까지 끝났다고 가정합니다.
2. **[Authentication]** 콘솔 왼쪽 **빌드 → Authentication → 시작하기** → **로그인 방법** 탭 → **Google** → 사용 설정 → 프로젝트 지원 이메일 확인 후 저장.
3. **[웹 앱 등록]** 톱니바퀴 **프로젝트 설정 → 일반 → 내 앱**에서 **웹** `</>` 아이콘 → 앱 닉네임 입력 → **앱 등록**.
4. 등록 직후 코드 블록에 `firebaseConfig` 객체가 보입니다. 값 4개를 복사합니다: `apiKey`, `authDomain`, `projectId`, `appId`.  
   (나중에 다시 보려면: 프로젝트 설정 → 일반 → 내 앱에서 해당 웹 앱 선택 → **구성** 스니펫.)
5. (권장) Firebase 콘솔 → **App Check**에서 웹 앱을 등록하고 **reCAPTCHA v3 site key**를 발급합니다.

### 로컬에서 할 일(저장소 루트)

1. `.env.example`을 참고해 프로젝트 루트에 **`.env`** 파일을 만듭니다.
2. 아래처럼 채웁니다(`firebaseConfig`와 1:1 대응).

| 콘솔 `firebaseConfig` | `.env` 변수 |
|------------------------|-------------|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |
| App Check site key (선택·권장) | `VITE_FIREBASE_APP_CHECK_SITE_KEY` |

3. 저장 후 **개발 서버를 완전히 끄고** 다시 `npm run dev`를 실행합니다. (Vite는 기동 시에만 `import.meta.env`를 읽습니다.)
4. 브라우저에서 앱 → **설정** → **Google로 로그인** → 필요 시 **지금 클라우드에 저장** 또는 데이터 수정 후 자동 동기화.
5. 콘솔 **Firestore → 데이터**에서 `users` → `(본인 uid)` → `traderos` → `v1` 문서가 생겼는지 확인합니다.

### 자주 나는 문제

- **설정에 클라우드 섹션이 없음:** `.env` 없음·변수名 오타·서버 재시작 안 함. `VITE_FIREBASE_API_KEY`와 `VITE_FIREBASE_PROJECT_ID` 둘 다 있어야 섹션이 보입니다 (`src/lib/firebase/client.ts`).
- **App Check 관련 경고/실패:** `VITE_FIREBASE_APP_CHECK_SITE_KEY`를 비웠다면 무시됩니다(no-op). 보안을 강화하려면 콘솔 App Check 등록 후 site key를 환경 변수에 넣고 재배포하세요.
- **`auth/unauthorized-domain`:** Authentication → **설정** → **승인된 도메인**에 `localhost`가 있는지 확인(로컬은 보통 기본 포함).
- **`Permission denied`:** Firestore 규칙 미게시 또는 다른 프로젝트의 `.env`를 쓰는 경우.
- **`auth/api-key-not-valid` / `API_KEY_INVALID`:** 브라우저·Vite가 아니라 **Google 쪽이 해당 API 키를 Identity Toolkit(로그인)에 쓸 수 없다**고 거부하는 상태입니다. 아래를 순서대로 점검하세요.
  1. **Firebase 콘솔**과 **Google Cloud 콘솔** 상단의 **프로젝트가 동일**한지 (`my-trading-f14ae` 등).
  2. [API 라이브러리](https://console.cloud.google.com/apis/library)에서 **Identity Toolkit API** 검색 → **사용**(Enabled). **Token Service API**도 사용 설정.
  3. **Firebase** → **프로젝트 설정**(톱니) → **일반** → **내 앱** → 해당 **웹 앱** 선택 → 표시되는 **`firebaseConfig`를 전부 다시 복사**해 `.env` 네 변수를 **한 번에 갱신**(예전 스크린샷·옛날 키를 쓰면 안 됨).
  4. Google Cloud → **사용자 인증 정보** → **Browser key (auto created by Firebase)** → **API 제한사항**에 **Identity Toolkit API** 등이 포함돼 있는지(또는 테스트로 **제한 없음**).
  5. 그래도 같으면 Firebase에서 **웹 앱을 하나 더 추가**해 나온 **새 `firebaseConfig`로 `.env` 전체 교체** 후 `npm run dev` 재시작.

### 규칙 파일 배포(참고)

- 저장소 루트의 `firestore.rules`가 이 앱과 동일한 제약을 씁니다.
  - **콘솔**: Firestore → 규칙 탭에 붙여 넣어 게시.
  - **CLI**: `firebase login` → `firebase use --add` → `npm run deploy:firestore-rules` (또는 `npx firebase deploy --only firestore:rules --project <프로젝트ID>`)
- 규칙 요약: 경로는 `users/{로그인한 uid}/traderos/v1`만 허용, 필드는 `body`(문자열, 길이 상한)와 `updatedAt`(timestamp)만 허용, `list`·`delete`는 거부.
