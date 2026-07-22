# Hyundai Indicators v2

한국/글로벌 지표를 보여주는 단일 페이지 대시보드입니다.

## 구조

- `index.html`: 화면 레이아웃과 섹션 배치
- `assets/styles.css`: 모든 스타일
- `assets/app.js`: 차트 렌더링, 데이터 로딩, 상호작용 로직
- `assets/config.local.js`: 로컬 전용 API 키 설정 파일
- `assets/config.example.js`: 로컬 설정 파일 예시
- `data.json`: 지표 시계열 캐시
- `news.json`: 뉴스 캐시
- `reports.json`: 보고서 캐시
- `scripts/`: 데이터 수집 스크립트

## 비밀값 관리

- ECOS, KOSIS, Anthropic 같은 키는 `assets/config.local.js`에만 둡니다.
- 이 파일은 `.gitignore`에 들어가 있어서 GitHub로 올라가지 않습니다.
- 실제 키를 입력한 뒤에는 커밋하기 전에 `git status`로 한 번만 확인하면 됩니다.

## 유지보수 포인트

- UI 스타일은 `assets/styles.css`에서 수정
- 기능 변경은 `assets/app.js`에서 수정
- 데이터 구조를 바꿀 때는 `data.json`, `news.json`, `reports.json`과 연동 코드를 함께 확인
