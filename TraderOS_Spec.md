# TraderOS — Portfolio Visual (MVP v1)
> **Version:** 1.0  
> **Status:** Draft / Ready for Development  
> **Last Updated:** 2026-04-08

---

## 1. PRD (Product Requirements Document)

### 1.1 배경 및 목적
개별 증권사 앱의 복잡한 UI에서 벗어나, 투자자가 자신의 **자산 배분 상태(Sector/Stock Weight)**를 직관적으로 파악하고 리스크를 관리할 수 있는 대시보드를 구축한다.

### 1.2 핵심 목표 (KPI)
- **5초 이내 파악:** 총 자산 상태 및 수익률 확인.
- **리스크 감지:** 특정 섹터/종목 쏠림(40% 이상) 시 시각적 경고 제공.
- **데이터 일치:** 하단 테이블의 합계와 상단 요약 카드의 수치 일치.

### 1.3 기능 명세 (Scope)
- **[Core] Dashboard:** 3~4개의 요약 카드 (총 투자/평가/손익/수익률).
- **[Visual] Charts:** - 섹터별 비중 (Donut Chart)
  - 종목별 비중 (Horizontal Bar Chart, Top 10 + Others)
- **[Data] Holdings Table:** 필터링 기능이 포함된 종목 리스트.
- **[Input] Manual Update:** v1에서는 '현재가 편집' 모달을 통해 수동으로 시세 업데이트.

### 1.4 집중도(Concentration Risk) — 판정 규칙 (확정)
비중은 **전체 포트폴리오 평가액 대비**로 계산한 퍼센트(§3.1)를 사용한다. 아래 **어느 한쪽이라도** 만족하면 집중도 경고(`warning` 토큰)를 적용한다.
- **섹터:** 해당 섹터에 속한 모든 종목의 평가액 합/전체 평가액 × 100 **≥ 40%**
- **종목:** 단일 종목 평가액/전체 평가액 × 100 **≥ 40%**

두 조건은 독립적이다(섹터만 초과·종목만 초과·둘 다 가능).

---

## 2. 디자인 시스템 (Design System)

### 2.1 Visual Style
- **Theme:** Dark Mode Only (Deep Charcoal / Navy Base)
- **Density:** High (정보 밀도가 높되 여백을 활용해 가독성 확보)

### 2.2 Color Palette (Tailwind CSS Extend)
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `--bg` | `#0F1115` | 전체 배경 |
| `--surface` | `#171A21` | 카드 및 섹션 배경 |
| `--border` | `#262B36` | 카드 테두리, 구분선 |
| `--text-main` | `#E8EAED` | 주요 텍스트 (금액, 종목명) |
| `--text-muted` | `#A0A3BD` | 캡션, 보조 설명 |
| `--positive` | `#14C784` | 수익, 상승 부호 |
| `--negative` | `#FF4D4F` | 손실, 하락 부호 |
| `--accent` | `#4C7DFF` | 버튼, 강조 요소, 인터랙션 |
| `--warning` | `#FF9F1C` | 집중 과다 경고 (Concentration Risk) |

### 2.3 Typography (Pretendard / Inter)
- **Display (Data-L):** 24px / Bold / Tabular Numbers (숫자 너비 고정)
- **Label (Body):** 14px / Medium
- **Caption (Small):** 12px / Regular

### 2.6 폰트 로딩 (확정)
- **우선순위:** `Pretendard` → `Inter` → 시스템 sans. 한국어 가독성을 위해 Pretendard를 먼저 둔다.
- **로딩:** Pretendard는 CDN 정적 CSS `@font-face`로 로드한다(예: jsDelivr `pretendard` 패키지). Inter는 기존처럼 Google Fonts에서 로드한다.

### 2.4 Tailwind 설정 예시 (`tailwind.config.js`)
```js
// tailwind.config.js
theme: {
  extend: {
    colors: {
      background: '#0F1115',
      surface: '#171A21',
      border: '#262B36',
      textMain: '#E8EAED',
      textMuted: '#A0A3BD',
      positive: '#14C784',
      negative: '#FF4D4F',
      accent: '#4C7DFF',
      warning: '#FF9F1C',
    },
    fontFamily: {
      sans: ['Pretendard', 'Inter', 'system-ui', 'sans-serif'],
    }
  }
}
```

### 2.5 컬러 코드 문서화 (Token Mapping)
| Design Token | Tailwind Key | Hex | 예시 클래스 |
| :--- | :--- | :--- | :--- |
| `--bg` | `background` | `#0F1115` | `bg-background` |
| `--surface` | `surface` | `#171A21` | `bg-surface` |
| `--border` | `border` | `#262B36` | `border-border` |
| `--text-main` | `textMain` | `#E8EAED` | `text-textMain` |
| `--text-muted` | `textMuted` | `#A0A3BD` | `text-textMuted` |
| `--positive` | `positive` | `#14C784` | `text-positive` |
| `--negative` | `negative` | `#FF4D4F` | `text-negative` |
| `--accent` | `accent` | `#4C7DFF` | `bg-accent` |
| `--warning` | `warning` | `#FF9F1C` | `text-warning` |

---

## 3. 계산 로직 및 데이터 구조

### 3.1 계산 공식
- **P&L (손익):** `(Current Price - Avg Price) * Quantity`
- **Weight (비중):** `(Stock Market Value / Total Portfolio Market Value) * 100`
- **Rounding:** 모든 통화 계산은 소수점 0자리(KRW) 혹은 2자리(USD)에서 반올림 처리.

### 3.2 다통화 정책 — MVP v1 (확정)
- **단일 스냅샷 원칙:** 한 번에 불러온 `positions` 배열에는 **동일한 `currency`만** 있어야 한다. 이 경우에만 상단 요약·비중·테이블 합계가 **수학적으로 정합**하다고 본다.
- **혼합 불가(MVP):** `KRW`와 `USD` 등 서로 다른 `currency`가 섞이면 v1은 **지원 범위 밖**이다. 앱은 혼합을 감지하면 **경고 배너**를 띄우고, 데이터를 한 통화로 맞추거나 향후 환율 기능을 쓰라고 안내한다(이때 숫자는 참고용이며 KPI ‘데이터 일치’를 보장하지 않는다).
- **이후 버전:** 기준 통화(display currency)와 환율(고정 입력 또는 API)으로 전 종목을 동일 단위로 환산한 뒤 비중·합계를 계산한다.

### 3.3 Mock Data Schema (`/data/mock.json`)
각 포지션은 **표시·반올림 단위**를 나타내는 `currency`(`KRW` | `USD`)를 포함한다. **§3.1 Rounding**은 해당 필드에 맞춘다. **§3.2**를 만족하도록 샘플 데이터를 구성한다.

```json
{
  "positions": [
    {
      "id": "u1",
      "ticker": "AAPL",
      "name": "애플",
      "sector": "Information Technology",
      "quantity": 10,
      "avg_price": 175.5,
      "current_price": 182.3,
      "currency": "USD"
    }
  ]
}
```

---

## 4. 후속 할 일 (Backlog)

### 4.1 종목 상세 새창
- 보유종목의 `종목` 클릭 시 상세 새창(모달) 제공
- 포함 정보: 현재 보유현황, 매매현황, To-do, 종목 메모

### 4.2 뉴스 연동 (추후)
- 종목 상세 새창에 관련 뉴스 피드 연동
- 기본 우선순위: 공시/실적/급등락 뉴스
- 필터: 최근 24시간, 최근 7일, 키워드(실적/가이던스/규제 등)
