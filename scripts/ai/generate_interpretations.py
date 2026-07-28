"""
scripts/ai/generate_interpretations.py — 지표별 AI 해석 배치 생성
─────────────────────────────────────────────────────────────
summary.json(지표별 kpi/series12)을 읽어 각 지표에 대한 AI 해석을
1회 생성하고 ai_interpretations.json으로 저장합니다.

기존에는 사용자가 좌측 사이드바에서 지표를 클릭할 때마다
(js/ai.js의 runIndicatorAI → askCopilotAgent, Direct Line)를 호출했지만,
이 스크립트로 하루 1회(GitHub Actions 스케줄) 미리 생성해두고
프론트엔드는 생성된 결과만 읽어 표시합니다.

Copilot Studio 에이전트 자체에 이미 시스템 지시사항(분석 조건/가이드)이
구성되어 있으므로, js/ai.js의 askCopilotAgent()와 동일하게 이 스크립트도
별도 system prompt 없이 지표 데이터(build_prompt 결과)만 메시지로 보냅니다.

환경변수:
  COPILOT_SECRET   Copilot Studio(Direct Line) 채널 시크릿.
                   웹페이지에서 입력하는 것과 동일한 값을
                   GitHub 저장소 Settings → Secrets and variables → Actions에
                   COPILOT_SECRET 이름으로 등록해야 합니다.
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
import urllib.error

ROOT         = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SUMMARY_PATH = os.path.join(ROOT, "summary.json")
OUTPUT_PATH  = os.path.join(ROOT, "ai_interpretations.json")

COPILOT_SECRET   = os.environ.get("COPILOT_SECRET", "")
DL_BASE          = "https://directline.botframework.com/v3/directline"
POLL_INTERVAL    = 1.0     # 초
RESPONSE_TIMEOUT = 120     # 초, 지표 1건당 응답 대기 한도

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


def _http(method: str, url: str, token: str = None, body: dict = None, timeout: int = 30) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read()
        return json.loads(raw.decode("utf-8")) if raw else {}


def ask_copilot(message: str) -> str:
    """js/ai.js의 askCopilotAgent()(Direct Line)와 동일한 흐름을
    폴링 방식으로 구현. (배치에서는 WebSocket 대신 폴링만 사용)"""
    if not COPILOT_SECRET:
        raise RuntimeError("COPILOT_SECRET이 설정되지 않았습니다.")

    # 1) 토큰 발급
    token_data = _http("POST", f"{DL_BASE}/tokens/generate", token=COPILOT_SECRET)
    token = token_data.get("token")
    if not token:
        raise RuntimeError("Direct Line 토큰 발급 실패")

    # 2) 대화 시작
    conv = _http("POST", f"{DL_BASE}/conversations", token=token)
    conv_id    = conv.get("conversationId")
    conv_token = conv.get("token", token)
    if not conv_id:
        raise RuntimeError("Direct Line 대화 시작 실패")
    act_url = f"{DL_BASE}/conversations/{conv_id}/activities"

    # 3) 메시지 전송
    _http("POST", act_url, token=conv_token, body={
        "type": "message",
        "from": {"id": "batch-job"},
        "text": message,
    })
    send_time = time.time()

    # 4) 응답 폴링
    watermark = None
    deadline  = send_time + RESPONSE_TIMEOUT
    while time.time() < deadline:
        time.sleep(POLL_INTERVAL)
        url = act_url + (f"?watermark={watermark}" if watermark else "")
        try:
            poll = _http("GET", url, token=conv_token)
        except urllib.error.URLError:
            continue
        watermark = poll.get("watermark", watermark)
        bot_msgs = [
            a.get("text", "")
            for a in poll.get("activities", [])
            if a.get("type") == "message"
            and (a.get("from") or {}).get("id") != "batch-job"
            and isinstance(a.get("text"), str) and a.get("text").strip()
        ]
        if bot_msgs:
            return "\n\n".join(bot_msgs)

    raise TimeoutError(f"응답 시간 초과 ({RESPONSE_TIMEOUT}초)")


def main():
    print("=" * 55)
    print("generate_interpretations.py 시작 (Copilot Studio / Direct Line)")
    print("=" * 55)

    if not COPILOT_SECRET:
        print("[AI 해석] skip (COPILOT_SECRET 없음)")
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
            text = ask_copilot(prompt)
            items[key] = {"text": text}
        except Exception as e:
            print(f"  [{key}] 오류: {e}")
            if key in prev_items:
                print(f"  [{key}] 이전 해석을 유지합니다.")
                items[key] = prev_items[key]
        time.sleep(1)

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
