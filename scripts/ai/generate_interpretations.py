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

# ── 지표별 중점 고려사항: js/ai.js의 AI_SYSTEM_PROMPT(교차분석)
#    [각 지표별 분석 참고사항]과 동일한 내용을 단일 지표 해석용으로 사용 ──
INDICATOR_NOTES = {
    "csi": (
        "소비심리지수는 실물 경제에 선행하는 심리 지표이므로, 1년 전과의 단순 비교(YoY)보다는 "
        "전월·전전월 등 최근 3~6개월간의 단기적 흐름(MoM 추세)과 기준값(100) 상회 여부를 더 중요하게 봅니다. "
        "전년 대비 높더라도 최근 몇 개월 연속 하락 중이라면 그 둔화·위축 추세를 우선해서 짚어주세요. "
        "전월 대비 변화는 신장률(%)이 아닌 지수 자체의 절대 수치와 단순 증감(p, 포인트)으로 표기합니다."
    ),
    "cpi": (
        "소비자물가지수는 지수 자체의 절대 수치나 전월 대비 증감(MoM)보다는 "
        "'전년 동월 대비 신장률(%, 인플레이션율)'이 최근 몇 개월간 확대되고 있는지 둔화되고 있는지를 중심으로 봅니다. "
        "예를 들어 상승률이 3.0%에서 2.8%로 낮아졌다면 물가 상승세는 지속되더라도 상승폭이 둔화되고 있다는 점을 짚어주세요. "
        "지수의 단순 증감(p)보다 전년 동월 대비 신장률(%)을 중심으로 표기하고, "
        "이 수치가 고객의 실질 구매력(장바구니 물가 부담)에 미치는 누적 영향을 함께 짚어줍니다."
    ),
    "rate": (
        "기준금리는 전년 동월 대비 신장률(%)보다는 현재의 절대 수치(%)와 최근 몇 개월간의 방향성"
        "(연속 인상·동결·인하 등 기조)을 중심으로 봅니다. '10% 가까이 신장했다' 같은 신장률 표현은 쓰지 말고, "
        "'연속 인상되며 긴축 기조가 강해졌다(0.25%p 상승)'처럼 절대 수치(%)와 증감(%p)으로 표기하세요. "
        "특정 금리 수준이 얼마나 오래 지속(동결)되고 있는지도 실물 경제(이자 부담)에 미치는 영향이 크므로 함께 고려합니다."
    ),
    "fx": (
        "환율은 전년 동월 대비보다는 최근 3~6개월간의 단기적 흐름(MoM)과 특정 심리적 저항선"
        "(예: 1,300원, 1,400원) 돌파 여부를 더 중요하게 봅니다. 신장률(%)보다는 절대 금액(원)과 증감액(원)으로 "
        "표기하는 것이 직관적이며, '환율 하락 = 원화 강세 = 외국인의 원화 체감 물가 상승(구매력 감소)'의 "
        "메커니즘을 반영해서 해석해주세요."
    ),
    "kospi": (
        "코스피는 변동성이 큰 선행 지표이므로 전년 대비 단순 비교보다는 최근 몇 주~몇 개월간의 "
        "추세(박스권, 급락, 랠리 등)와 고점 대비 하락폭을 중요하게 봅니다. 지수(pt) 자체의 움직임을 "
        "박스권 횡보·급락·랠리 등으로 표현하고, 이 흐름이 내국인 VIP·일반 고객의 소비 심리(자산 효과)에 "
        "미치는 영향으로 연결해서 해석해주세요."
    ),
    "tourist": (
        "외국인 관광객 수는 전년 동월 대비 신장률(YoY %)로 구조적 회복·성장세를 판단하되, "
        "최근 유입 속도 변화를 보여주는 전월 대비(MoM) 단기 추이도 함께 봅니다. 방한 비중이 높은 "
        "중국(춘절, 노동절, 국경절)과 일본(골든위크, 오본, 연말연시)의 주요 연휴가 해당 월이나 인접 월에 "
        "포함되는지 감안해 기저효과와 일시적 급증·급감을 구분해주세요. 단순 증감(명)보다는 절대 수치(만 명 등)와 "
        "신장률(%) 중심으로 표기합니다."
    ),
    "retail": (
        "유통업 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 "
        "함께 살피고, 최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석해주세요."
    ),
    "dept": (
        "백화점 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 "
        "함께 살피고, 최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석해주세요."
    ),
    "mart": (
        "마트 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 "
        "함께 살피고, 최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석해주세요."
    ),
    "convenience": (
        "편의점 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 "
        "함께 살피고, 최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석해주세요."
    ),
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

    note = INDICATOR_NOTES.get(key, "")
    note_line = (f"\n[지표별 중점 고려사항]\n{note}\n") if note else ""

    return (
        f"[{title}]\n"
        f"최신값: {cur}{unit} · 전월비: {mom} · 전년비: {yoy} · 6개월 평균: {avg6}\n"
        f"{recent_line}"
        f"{note_line}"
        "\n위 수치는 최근 실제 데이터입니다. "
        "반드시 제공된 수치만을 근거로 분석하고, 데이터에 없는 수치는 절대 추측하거나 임의 생성하지 마세요. "
        '날짜나 시점을 언급할 때는 반드시 "OO년 O월"(예: 26년 7월) 형식으로만 표기하고, "26.07" 같은 표기는 쓰지 마세요. '
        '단순히 최근 하루이틀·한두 구간의 반등만으로 "추세 전환"이라고 성급히 단정하지 마세요. '
        "최근 수개월간의 고점·저점 대비 현재 위치가 어디인지 먼저 짚고, 그 다음 가장 최근 구간에서 "
        "일시적 반등인지 아니면 방향 자체가 바뀌는 신호인지 구분해서 설명해주세요. "
        "위 [지표별 중점 고려사항]에 제시된 지표 특성(절대 수치 vs 신장률, 포인트 vs %p 등 표기 기준 포함)을 "
        "반드시 반영해서 해석하세요.\n"
        "이 지표가 현대백화점 매출과 고객 소비 심리에 미치는 영향을 3~4문장으로 해석해주세요.\n"
        "\n[표기 규칙]\n"
        "- 모든 답변은 존대어(~입니다 등) 형태로 작성하세요.\n"
        "- 숫자 표기 시 단위까지 표기하고, 소수점이 있는 경우 첫째자리까지 표기하세요.\n"
        "- 반드시 한국어 평서문으로만 작성하세요.\n"
        "\n[출력 형식 — 반드시 지켜주세요]\n"
        '- 제목이나 소제목을 달지 마세요 (예: "○○ 영향 해석" 같은 줄 금지).\n'
        "- 글머리표(*, -, •)나 번호 매기기를 쓰지 말고, 문장과 문장이 자연스럽게 이어지는 하나의 문단(또는 이어지는 여러 문단)으로 작성하세요.\n"
        "- 구분선(---, ***, 밑줄 등)을 절대 넣지 마세요.\n"
        "- 마크다운 서식(굵게, 기울임, 표 등) 없이 순수한 문장으로만 답하세요."
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
