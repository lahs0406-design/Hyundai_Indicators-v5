"""
scripts/ai/generate_interpretations.py — 지표별 AI 해석 배치 생성
─────────────────────────────────────────────────────────────
summary.json(지표별 kpi/series12)을 읽어 각 지표에 대한 AI 해석을
1회 생성하고 ai_interpretations.json으로 저장합니다.

기존에는 사용자가 좌측 사이드바에서 지표를 클릭할 때마다
(js/ai.js의 runIndicatorAI → askGemini)를 호출했지만,
이 스크립트로 하루 1회(GitHub Actions 스케줄) 미리 생성해두고
프론트엔드는 생성된 결과만 읽어 표시합니다.

환경변수:
  GEMINI_API_KEY   Google AI Studio에서 발급한 Gemini API 키
                   (없으면 이 단계는 조용히 skip — 나머지 파이프라인에는 영향 없음)

※ INDICATOR_META의 title/unit은 js/config.js의 CD 정의(각 지표 제목·단위)와
  반드시 맞춰서 한 번 확인해 주세요. summary.json 쪽 키(csi/cpi/rate/...)는
  js/ai.js의 CHK_TO_KEY 매핑과 동일한 값을 사용합니다.
"""

import os
import json
import time
import datetime
import urllib.request

ROOT         = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SUMMARY_PATH = os.path.join(ROOT, "summary.json")
OUTPUT_PATH  = os.path.join(ROOT, "ai_interpretations.json")

GEMINI_KEY   = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-3.5-flash"   # js/ai.js의 askGemini()와 동일한 모델
GEMINI_URL   = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# js/ai.js의 AI_SYSTEM_PROMPT와 동일
AI_SYSTEM_PROMPT = "\n".join([
    '당신은 현대백화점 상품본부 전략 분석가입니다.',
    '아래 최근 경제 지표 실수치 데이터를 분석하여, 현대백화점 관점의 실전 인사이트를 작성해주세요.',
    '',
    '[분석 조건 설정]',
    '- 경제 지표 : 소비심리지수 / 소비자물가 / 기준금리 / 환율 / 코스피 / 외국인관광객 / 날씨(기온/강수)',
    '- 상품군 : 패션 / 명품 / 하이주얼리 / 장신구·잡화 / 뷰티 / 리빙 / 가전 / 유·아동 / F&B / 식품관 / SPA / 스포츠·아웃도어',
    '- 고객군 : 내국인 VIP고객 / 내국인 일반고객 / 외국인 관광객',
    '',
    '[분석 내용 가이드]',
    '① 지표 추이 요약',
    '- 각 지표의 최근 방향성(상승/하락/보합)과 변화 폭을 수치와 함께 2~3줄로 요약',
    '',
    '② 소비자 및 백화점 업계 영향',
    '- 현재 지표 조합이 내·외국인 소비 심리에 미치는 복합적 영향',
    '- 백화점 방문 빈도 및 객단가 관점에서 서술',
    '',
    '③ 상품 카테고리별 기회·리스크',
    '- 상품군 / 기회요인 / 리스크요인 / 지표에 대한 수치적 근거 순으로 작성',
    '',
    '④ 단기(1~3개월) MD 대응 전략 제언',
    '- 각 상품군별 구체적인 행동 방향 (프로모션 타이밍, 재고 전략, 외국인 타겟 마케팅 등)',
    '- 수치 근거를 바탕으로 우선순위 제시',
    '',
    '[인사이트 작성시 유의사항]',
    '※ 지표 간 상관관계를 반드시 포함할 것',
    '   Ex) 환율 상승 → 외국인 구매력 증가 → 명품 수요 확대',
    '※ 단순 현황 나열이 아닌, 수치 기반 판단 근거를 포함할 것',
    '※ 긍정/부정 양면을 균형 있게 서술할 것',
    '※ 아래 제공되는 [경제 지표 실수치]는 실제 API에서 수집된 데이터로,',
    '   반드시 제공된 수치만을 근거로 분석하고, 데이터에 없는 수치는 절대 추측하거나 임의 생성 금지. 반드시 한글로만 작성할것.',
])

# ── 지표별 제목·단위 : js/config.js의 CD 정의와 대조해서 확인/수정하세요 ──
INDICATOR_META = {
    "csi":         {"title": "소비심리지수",   "unit": ""},
    "cpi":         {"title": "소비자물가지수", "unit": ""},
    "rate":        {"title": "기준금리",       "unit": "%"},
    "fx":          {"title": "원/달러 환율",   "unit": "원"},
    "kospi":       {"title": "코스피",         "unit": ""},
    "tourist":     {"title": "외국인 관광객수", "unit": "명"},
    "retail":      {"title": "유통업 매출",     "unit": ""},
    "dept":        {"title": "백화점 매출",     "unit": ""},
    "mart":        {"title": "마트 매출",       "unit": ""},
    "convenience": {"title": "편의점 매출",     "unit": ""},
}


def format_korean_ym(ym) -> str:
    s = str(ym)
    if len(s) >= 8:
        return f"{s[2:4]}년 {int(s[4:6])}월 {int(s[6:8])}일"
    if len(s) == 6:
        return f"{s[2:4]}년 {int(s[4:6])}월"
    return s


def build_prompt(key: str, entry: dict) -> str:
    """js/ai.js의 buildIndicatorPrompt()와 동일한 구조로 프롬프트를 만든다.
    (다만 일별 지표의 90거래일 샘플링 대신, summary.json의 series12를
     그대로 사용하는 단순화된 버전입니다.)"""
    meta  = INDICATOR_META.get(key, {"title": key, "unit": ""})
    title = meta["title"]
    unit  = meta["unit"]

    kpi  = entry.get("kpi", {}) or {}
    cur  = kpi.get("cur", "")
    mom  = kpi.get("mom", "")
    yoy  = kpi.get("yoy", "")
    avg6 = kpi.get("avg6", "")

    series = entry.get("series12", []) or []
    pairs  = [f"{format_korean_ym(r.get('ym'))}:{r.get('val')}" for r in series]
    recent_line = ("최근 추이(오래된 순 → 최신순): " + " → ".join(pairs) + "\n") if pairs else ""

    return (
        f"[{title}]\n"
        f"최신값: {cur}{unit} · 전월비: {mom} · 전년비: {yoy} · 6개월 평균: {avg6}\n"
        f"{recent_line}"
        "\n위 수치는 최근 실제 데이터입니다. "
        '날짜나 시점을 언급할 때는 반드시 "OO년 O월"(예: 26년 7월) 형식으로만 표기하고, "26.07" 같은 표기는 쓰지 마세요. '
        '단순히 최근 하루이틀·한두 구간의 반등만으로 "추세 전환"이라고 성급히 단정하지 마세요. '
        "최근 수개월간의 고점·저점 대비 현재 위치가 어디인지 먼저 짚고, 그 다음 가장 최근 구간에서 "
        "일시적 반등인지 아니면 방향 자체가 바뀌는 신호인지 구분해서 설명해주세요.\n"
        "이 지표가 현대백화점 매출과 고객 소비 심리에 미치는 영향을 3~4문장으로, 한국어로 해석해주세요."
    )


def ask_gemini(prompt: str) -> str:
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": AI_SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": prompt}]}],
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{GEMINI_URL}?key={GEMINI_KEY}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.loads(res.read().decode("utf-8"))
    return data["candidates"][0]["content"]["parts"][0]["text"]


def main():
    print("=" * 55)
    print("generate_interpretations.py 시작")
    print("=" * 55)

    if not GEMINI_KEY:
        print("[AI 해석] skip (GEMINI_API_KEY 없음)")
        return

    if not os.path.exists(SUMMARY_PATH):
        print("[AI 해석] summary.json이 없어 건너뜁니다. (fetch_data.py를 먼저 실행하세요)")
        return

    with open(SUMMARY_PATH, "r", encoding="utf-8") as f:
        summary = json.load(f)

    # 기존 결과가 있으면 실패한 지표만 이전 값으로라도 남겨둘 수 있도록 로드
    prev_items = {}
    if os.path.exists(OUTPUT_PATH):
        try:
            with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
                prev_items = (json.load(f) or {}).get("items", {})
        except Exception:
            prev_items = {}

    items = {}
    for key, entry in summary.items():
        if not isinstance(entry, dict) or "kpi" not in entry:
            continue
        print(f"  [{key}] 해석 생성 중...")
        try:
            prompt = build_prompt(key, entry)
            text = ask_gemini(prompt)
            items[key] = {"text": text}
        except Exception as e:
            print(f"  [{key}] 오류: {e}")
            if key in prev_items:
                print(f"  [{key}] 이전 해석을 유지합니다.")
                items[key] = prev_items[key]
        time.sleep(1)  # 무료 티어 rate limit 여유

    now_kst = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    output = {
        "generated_at": now_kst.strftime("%Y-%m-%d %H:%M KST"),
        "items": items,
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ ai_interpretations.json 저장 완료 ({len(items)}개 지표, {now_kst.strftime('%Y.%m.%d %H:%M KST')})")
    print("=" * 55)


if __name__ == "__main__":
    main()
