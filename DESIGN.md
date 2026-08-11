# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-11
- Primary product surfaces: 관리자 대시보드, QR 관리, 교인별 출석 관리, 모바일 QR 출석 확인
- Evidence reviewed: `README.md`, `docs/operations.md`, `docs/future-work.md`, `src/App.tsx`, `src/styles.css`, `src/admin/AdminShell.tsx`, `src/admin/AdminDashboard.tsx`, `src/admin/QRGeneration.tsx`, `src/admin/AttendanceManagement.tsx`, `src/admin/adminShell.css`, 기존 사용자 제공 화면 캡처

## Brand
- Personality: 차분하고 친절하며 신뢰할 수 있는 교회 운영 도구. 토스 계열의 명확한 정보 위계와 부드러운 상호작용을 참고한다.
- Trust signals: 실제 집계값, 명확한 날짜와 예배 구분, 예측 가능한 선택 상태, 오류와 미확인의 정직한 표시.
- Avoid: 과도한 장식, 강한 테두리의 반복, 여러 색의 무분별한 사용, 영문 보조 제목, 관리 기능보다 앞서는 브랜딩, 실제 데이터처럼 보이는 개인정보.

## Product goals
- Goals: 관리자가 출석 현황을 빠르게 비교하고, 일요일별 QR을 쉽게 찾고, 특정 교인의 출석 이력을 바로 확인한다.
- Non-goals: 교회 홈페이지 브랜딩, 소셜 기능, 복잡한 분석 도구, 현재 범위를 벗어난 관리자 권한 설계.
- Success signals: 핵심 수치와 선택 상태를 한눈에 구분하고, 데스크톱과 모바일에서 수평 스크롤이나 오조작 없이 주요 작업을 완료한다.

## Personas and jobs
- Primary personas: 교회 출석 담당 관리자, QR로 출석하는 교인.
- User jobs: 주차별 출석 변화 파악, 예배부별 인원 비교, 출석 기록 검색·내보내기, 예배일 QR 확인·복사, 본인 이름 검색 후 출석 확인.
- Key contexts of use: 관리자 데스크톱, 예배 전후 태블릿/노트북, 교인의 휴대전화 브라우저.

## Information architecture
- Primary navigation: 대시보드, QR 관리, 출석 관리의 3개 고정 항목.
- Core routes/screens: `/admin`, `/admin?view=qr-generation`, `/admin?view=attendance-management`, `/attend`.
- Content hierarchy: 화면 제목을 반복하지 않고 카드 제목 → 필터/기간 → 핵심 시각화 또는 표 → 상세 모달 순서로 읽힌다.

## Design principles
- 한눈에 먼저: 자주 확인하는 수치와 선택 상태는 설명보다 먼저 보인다.
- 조용한 표면, 선명한 행동: 대부분의 표면은 중립색으로 두고 현재 선택과 주요 행동에만 파란색을 쓴다.
- 데이터는 왜곡하지 않는다: 그래프 축 생략은 비교를 돕되 실제 값은 라벨과 툴팁에 그대로 표시한다.
- 반복을 줄인다: 날짜는 일요일만, QR은 선택 즉시, 출석은 이름 검색과 기간 선택 중심으로 단순화한다.
- Tradeoffs: 고밀도 관리 화면의 정보량을 유지하되 카드 수와 테두리 강도를 줄여 시각 피로를 낮춘다.

## Visual language
- Color: 기본 텍스트 `#191f28`, 보조 `#4e5968`, 배경 `#f4f7fb`, 표면 흰색, 핵심 파랑 `#3182f6`. 파랑-하늘색 그라데이션은 주요 버튼·선택 카드·차트에만 사용한다.
- Typography: 시스템 한글 산세리프, 제목 20~22px/800, 본문 13~15px/500~700, 숫자는 tabular numeral.
- Spacing/layout rhythm: 4px 기반, 카드 내부 24~30px, 카드 간 20~24px, 페이지 최대 폭 1480px.
- Shape/radius/elevation: 큰 카드 20px, 컨트롤 12px, 칩 999px. 테두리는 아주 옅게, 그림자는 넓고 낮은 대비로 사용한다.
- Motion: 140~200ms ease-out. 선택·호버의 이동은 1~2px 이하, `prefers-reduced-motion`에서 제거한다.
- Imagery/iconography: 사진 없음. 내비게이션에 단순한 선형 아이콘만 사용하며 아이콘 없이도 텍스트로 의미가 완결된다.

## Components
- Existing components to reuse: `AdminShell`, `WeeklyTrend`, `ServiceComparison`, QR 날짜 선택기/QR 카드, 출석 필터/표/상세 모달, 공용 `primary-button`/`secondary-button`/`notice`.
- New/changed components: 공통 패널 표면, 선택형 세그먼트, 일요일 선택 드롭다운, 내비게이션 아이콘, 그라데이션 주요 버튼과 차트 표면.
- Variants and states: default, hover, focus-visible, selected, disabled/past, loading, empty, error, copied/success.
- Token/component ownership: 관리자 토큰과 관리 화면 컴포넌트는 `src/admin/adminShell.css`, 교인 출석 화면은 `src/styles.css`에서 관리한다. 새로운 CSS 프레임워크는 도입하지 않는다.

## Accessibility
- Target standard: WCAG 2.1 AA 수준의 대비와 키보드 접근.
- Keyboard/focus behavior: 모든 링크·버튼·선택 컨트롤에 일관된 3px 포커스 링, 모달 포커스 복원 유지.
- Contrast/readability: 본문은 12px 미만을 피하고, 색만으로 상태를 구분하지 않으며 텍스트/기호를 함께 둔다.
- Screen-reader semantics: 기존 제목 연결, `aria-label`, 표 헤더, 라이브 오류/완료 메시지를 유지한다.
- Reduced motion and sensory considerations: 감소된 모션 환경에서는 애니메이션과 이동 효과를 끈다.

## Responsive behavior
- Supported breakpoints/devices: 1440px 데스크톱, 768~1180px 태블릿/소형 노트북, 360~767px 모바일.
- Layout adaptations: 데스크톱 2열 카드는 태블릿에서 1열, 사이드바는 모바일에서 상단 탭형 내비게이션, 표는 첫 열 고정 수평 스크롤.
- Touch/hover differences: 모바일 터치 대상 최소 44px, hover 전용 정보는 포커스/탭으로도 제공한다.

## Interaction states
- Loading: 레이아웃 이동을 최소화하고 짧고 명확한 상태 문구를 표시한다.
- Empty: 빈 카드 안에 원인과 다음 행동을 한 문장으로 안내한다.
- Error: 연한 빨강 표면과 구체적인 복구 문구를 사용한다.
- Success: 초록 계열 아이콘/문구와 완료 행동 하나만 보여준다.
- Disabled: 지난 QR 날짜는 대비를 낮추고 선택 불가 커서를 사용한다.
- Offline/slow network, if applicable: 현재 저장소 오류 문구를 유지하고 로딩 카드 높이를 고정해 흔들림을 줄인다.

## Content voice
- Tone: 짧고 직접적인 존댓말. 관리 화면 제목과 필터는 명사형.
- Terminology: `회원` 대신 `교인`, `QR 생성` 대신 `QR 관리`, 예배는 `1부·2부·3부`로 고정.
- Microcopy rules: 영문 보조 제목과 괄호 속 예시는 쓰지 않는다. 같은 정보의 반복 표기를 피한다.

## Implementation constraints
- Framework/styling system: React 19, TypeScript, Vite, 저장소 고유 CSS.
- Design-token constraints: 기존 `--admin-*` 토큰을 확장하며 별도 디자인 시스템 의존성을 추가하지 않는다.
- Performance constraints: 추가 이미지·폰트·대형 UI 패키지 없이 CSS와 작은 SVG만 사용한다.
- Compatibility constraints: 최신 Chrome/Safari 모바일과 데스크톱, Firebase Hosting SPA.
- Test/screenshot expectations: `npm run release:check` 통과, 1440px 관리자 화면과 390px 출석 화면 캡처로 레이아웃을 확인한다.

## Open questions
- [ ] 실제 운영 전 관리자 인증 이후 표시 가능한 개인정보 범위 / 운영 책임자 / 실제 데이터 전환에 영향
- [ ] 교회 고유 로고·브랜드 색상 제공 여부 / 교회 측 / 사이드바 브랜딩에 영향
