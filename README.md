# TraderOS 포트폴리오 (my_trading)

브라우저에서 매매일지·보유·실현손익을 관리하는 로컬 우선 앱입니다. 선택적으로 Firebase에 스냅샷을 올릴 수 있습니다.

## 1. 보안 (Firestore)

- **경로:** `users/{로그인 uid}/traderos/v1` 단일 문서만 사용합니다.
- **규칙 요약:** 인증된 **본인 uid**만 `get` 및 `create`/`update` 가능. 허용 필드는 `body`(문자열, 1byte 초과 ~ 1MB 이하), `updatedAt`(timestamp)만입니다. **삭제·컬렉션 목록(list)은 거부**합니다.
- **배포:** 프로젝트 루트에서 Firebase CLI로 로그인한 뒤:

```bash
npm run deploy:firestore-rules
```

규칙 파일은 루트의 `firestore.rules`입니다. 배포 전에 Git에 커밋된 내용과 콘솔에 올라간 규칙이 같은지 확인하세요.

## 2. 데이터 위치·백업

| 저장소 | 용도 |
|--------|------|
| **localStorage** | 기본 저장. 키: `traderos-portfolio-v2` |
| **JSON보내기** | 설정의 「백업 파일 보내기」로 전체 스냅샷 파일 다운로드 |
| **JSON 가져오기** | 「백업 파일 가져오기」(래퍼 `format: traderos-portfolio-export` 또는 로컬 저장과 동일 구조) |
| **Firebase** | 로그인 후 클라우드에 푸시 시 `body`에 동일 구조 JSON 문자열 저장 |

### 복구·유실 방지 체크리스트

1. **브라우저 데이터 삭제·기기 변경 전**에 반드시 백업 파일 보내기 또는 클라우드 저장을 실행합니다.
2. 클라우드를 쓰는 경우 **다른 기기에서 복구**할 때는 같은 Google 계정으로 로그인한 뒤 클라우드에서 불러오기 순서를 따릅니다.
3. `localStorage`는 용량 제한이 있어 실패할 수 있습니다. 저장 실패 배너가 나오면 보내기로 백업합니다.

### 오프라인

- 상단 **오프라인** 배너가 보이면 시세 갱신·KRX 동기화·클라우드 저장/로그인은 연결 후 다시 시도하세요.
- **로그아웃**은 오프라인이면 클라우드에 마지막 저장을 할 수 없어, 확인 창에서 로컬 데이터 삭제 위험을 안내합니다.

## 3. 숫자·장부 관련

- **장부(`computeLedger`)의 `realizedPnl`:** 매도 시 **(매도가 − 평단) × 수량**의 합으로, 한국 장 **증권거래세·수수료는 포함하지 않습니다** (세전 gross).
- **실현손익 패널·차트:** 한국 매도 건에 대해 세금·설정 수수료를 반영한 **net**을 별도 모듈에서 계산합니다. 동작 차이는 `src/lib/realizedPnl.ts` 및 `ledger.test.ts` / `realizedPnl.test.ts`를 참고하세요.

## 4. 개발 명령

```bash
npm ci
npm run dev      # 로컬 개발 서버
npm test         # Vitest
npm run build    # 타입체크 + 프로덕션 빌드
```

### Mac에서 `Cannot find module @rollup/rollup-darwin-x64` (또는 arm64)

npm이 Rollup **플랫폼용 선택 의존성**을 빠뜨릴 때 나는 오류입니다. 레포 루트 `package.json`에 Mac용 `@rollup/rollup-darwin-*`를 **optionalDependencies**로 명시해 두었으므로, 아래로 한 번 정리한 뒤 다시 설치하면 됩니다.

```bash
rm -rf node_modules
npm ci
npm run build
```

그래도 동일하면 `npm install` 한 번 더 실행해 보세요.

## 5. 링크로 공유 (배포)

친구에게 **URL만** 주려면 **시세·KRX 프록시**(`/api/kr-quote`, `/api/krx-kind`)까지 **같은 도메인**에서 열려야 합니다. 무료로 시작하려면 **Vercel**을 쓰는 편이 간단합니다. **Firebase Hosting + Cloud Functions**는 **Blaze(종량제)** 가 필요하므로, 트래픽·요구가 커졌을 때 옮기거나 병행하면 됩니다.

### 5-1. Vercel (Hobby · 무료, 권장 시작 경로)

- 루트 **`api/*.js`** 가 서버리스 함수로 배포되어, 프로덕션에서도 **`/api/kr-quote`**, **`/api/krx-kind`** 가 동작합니다.
- **`vercel.json`** 에서 Vite 빌드(`dist`)와 `/api` 제외 SPA 라우팅을 맞춰 두었습니다.

1. [Vercel](https://vercel.com/)에 로그인 후 **GitHub 레포를 Import**합니다.
2. Framework는 **Vite**로 자동 인식되는지 확인하고, **Build Command** `npm run build`, **Output** `dist` 로 두면 됩니다.
3. **환경 변수** (Google 로그인·Firestore를 쓸 때만): Vite는 빌드 시점에 주입하므로, Vercel 프로젝트 **Settings → Environment Variables**에 `.env.example`과 같은 **`VITE_FIREBASE_*`** 를 **Production**에 넣은 뒤 **Redeploy** 합니다.
4. **Firebase Auth** 를 쓰는 경우: Firebase 콘솔 → **Authentication → Settings → 승인된 도메인**에 배포 URL(예: `xxx.vercel.app`, 커스텀 도메인)을 추가합니다.
5. 배포가 끝나면 **`https://<프로젝트>.vercel.app`** 주소를 공유하면 됩니다.

**참고:** Vercel Hobby의 서버리스 함수는 **실행 시간 상한(기본 10초)** 이 있습니다. KRX 목록 동기화(`krx-kind`)가 타임아웃 나면 한 번 더 시도하거나, 나중에 Firebase Blaze·유료 플랜 등으로 옮기는 식으로 조정할 수 있습니다.

로컬에서 CLI로 올리려면: `npx vercel --prod` (Vercel 로그인 필요).

### 5-2. Firebase Hosting + Functions (Blaze 필요)

Firebase에 **프론트와 Functions를 한곳에** 두고 싶을 때 사용합니다. Cloud Functions를 쓰려면 프로젝트를 **Blaze** 로 올려야 합니다.

```bash
npm ci
cd functions && npm install && cd ..
firebase login
firebase use --add
npm run deploy:hosting
```

- Hosting 주소 예: `https://<프로젝트ID>.web.app`
- **`firebaserc.example`** 참고, 실제는 **`firebase use --add`** 로 만든 `.firebaserc` 를 사용합니다.

**Firebase만** 쓰는 경우(로그인·Firestore): 배포 호스트가 Vercel이든 Firebase든, 위 **`VITE_FIREBASE_*`** 와 **승인된 도메인** 설정은 동일합니다.
