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
    "outbound":    {"title": "내국인 출국자수", "unit": "명"},
    "retail":      {"title": "유통업 매출",     "unit": ""},
    "dept":        {"title": "백화점 매출",     "unit": ""},
    "mart":        {"title": "마트 매출",       "unit": ""},
    "convenience": {"title": "편의점 매출",     "unit": ""},
}

# ── 지표별 "★ 특성 반영" 블록 (2026-09 고도화 프롬프트) ──────────────
# csi/cpi/rate/fx/kospi/tourist 6개는 상품본부에서 받은 원문 그대로.
# retail/dept/mart/convenience는 기존 INDICATOR_NOTES 문구를 새 틀에 맞춰 옮김.
# outbound는 참고할 기존 문구가 없어 관광객 항목 톤에 맞춰 새로 작성 — 검토 필요.
INDICATOR_ANALYSIS_NOTES = {
    "csi": (
        "★ 소비심리지수(CSI) 특성 반영 :\n"
        "소비심리지수는 실물 경제에 선행하는 심리 지표이므로, 1년 전과의 단순 비교(YoY)보다는 전월, 전전월 등 "
        "최근 3~6개월간의 단기적 흐름(MoM 추세)과 기준값(100) 상회 여부를 더 중요시해서 분석 필요\n"
        '예를 들어 당월 수치가 105이고 전년 동월이 99이더라도, 전전월이 120, 전월이 118의 흐름을 보였다면 '
        '"전년 대비 상승했다"라고 긍정적으로 평가하기보다, "기준값(100)을 상회해 낙관론은 유지되고 있으나, '
        '최근 3개월 연속 하락하며 소비 심리가 빠르게 둔화(위축)되는 추세다"라는 관점에서 해석하는 것이 맞음\n'
        "분석 시 전월 대비 신장률(%)보다는 지수 자체의 절대 수치와 단순 증감(p, 포인트)으로 표기할 것"
    ),
    "cpi": (
        "★ 소비자물가지수(CPI) 특성 반영 :\n"
        "물가지수는 지수 자체의 절대 수치나 전월 대비 증감(MoM)보다는 '전년 동월 대비 신장률(%, 인플레이션율)'이 "
        "최근 몇 개월간 어떤 방향성(확대/둔화)을 보이는지를 더 중요시해서 분석 필요\n"
        "예를 들어 당월 지수가 120(전년 동월 대비 +2.8%)이고, 전월 지수가 119(전년 동월 대비 +3.0%)라면 지수 자체는 "
        '전월보다 높아졌지만 "물가가 전월 대비 더 올랐다"고 단편적으로 보기보다는, "물가 상승세는 지속되고 있으나, '
        '전년 동월 대비 상승률이 3.0%에서 2.8%로 낮아지며 인플레이션 압력이 다소 둔화되고 있다"라고 해석하는 것이 맞음\n'
        "분석 시 지수의 단순 증감(p)보다는 전년 동월 대비 신장률(%)을 중심으로 표기하며, 이 수치가 고객의 실질 구매력"
        "(장바구니 물가 부담)에 미치는 누적된 영향을 짚어줄 것"
    ),
    "rate": (
        "★ 기준금리 특성 반영 :\n"
        "기준금리는 전년 동월 대비 신장률(%)보다는 '현재의 절대적인 수치(%)'와 최근 몇 개월간의 '방향성(연속 인상, "
        "동결, 인하 등 기조)'을 중심으로 분석 필요\n"
        '예를 들어 당월이 3.0%이고 전월이 2.75%, 전전월이 2.5%라면, "금리가 10% 가까이 신장했다"라고 표현하는 것은 '
        '틀린 방식이며, "최근 연속 인상되며 긴축 기조가 강해졌다(0.25%p 상승)"라고 해석하는 것이 맞음\n'
        "또한 금리는 수치의 등락 자체보다는 특정 수준(예: 3%대 고금리)이 '얼마나 오래 지속(동결)되고 있는지'가 실물 "
        "경제(이자 부담)에 미치는 영향이 크므로 이를 고려해야 함\n"
        "분석 시 신장률(%)이 아닌 절대 수치(%)와 증감(%p)으로 표기할 것"
    ),
    "kospi": (
        "★ 코스피(KOSPI) 특성 반영 :\n"
        "코스피는 변동성이 매우 큰 선행 지표이므로, 1년 전과의 단순 비교(YoY)보다는 최근 몇 주~몇 개월간의 '추세"
        "(박스권, 급락, 랠리 등)'와 '고점 대비 하락폭'을 중요시해서 분석 필요\n"
        '예를 들어 당월이 2,600pt이고 전년 동월이 2,400pt이더라도, 전월이 2,800pt였다면 "전년 대비 올랐다"가 아니라 '
        '"최근 급격한 조정(하락) 국면에 진입해 자산 효과가 축소되었다"라고 보는 것이 맞음\n'
        "분석 시 지수(pt) 자체의 움직임을 중심으로 표기 (박스권 횡보, 급락, 랠리 등 표현 사용)하며, 주식 시장의 "
        "흐름이 내국인 VIP 및 일반 고객의 '소비 심리(자산 효과)'에 즉각적인 영향을 미친다는 관점으로 해석할 것"
    ),
    "fx": (
        "★ 환율(원/달러) 특성 반영 :\n"
        "환율은 전년 동월 대비보다는 최근 3~6개월간의 단기적 흐름(MoM)과 '특정 심리적 저항선(예: 1,300원, 1,400원)' "
        "돌파 여부를 더 중요시해서 분석 필요\n"
        '예를 들어 당월이 1,350원이고 전년 동월이 1,300원인데, 직전 3개월이 1,400원 -> 1,380원 -> 1,350원으로 흐르고 '
        '있다면 "전년 대비 올랐다"기 보다는 "최근 환율 하락세(원화 강세)가 이어지고 있다"라고 방향성을 짚어주는 것이 맞음\n'
        "분석 시 신장률(%)보다는 절대 금액(원)과 증감액(원)으로 보는 것이 더 직관적이며, '환율 하락 = 달러 가치 하락 "
        "= 외국인의 원화 체감 물가 상승(구매력 감소)'의 메커니즘을 반드시 반영할 것"
    ),
    "tourist": (
        "★ 외국인 관광객 특성 반영 :\n"
        "관광객 수는 전년 동월 대비 신장률(YoY %)을 통해 '구조적 회복 및 성장세'를 파악하는 것이 기본이나, 최근 유입 "
        "속도의 변화를 보여주는 전월 대비(MoM) 단기 추이 역시 매우 중요하게 복합적으로 분석해야 함.\n"
        "특히 외국인 방문은 계절성 및 주변국의 대형 연휴 이벤트에 크게 좌우되므로, 방한 비중이 높은 중국의 주요 연휴"
        "(1~2월 춘절, 5월 노동절, 10월 국경절)와 일본의 주요 연휴(4월 말~5월 초 골든위크, 8월 중순 오본, 12~1월 "
        "연말연시)가 당월 또는 직전·직후 월에 포함되어 있는지 반드시 감안하여 기저효과나 일시적 급증/급감 여부를 "
        "판단할 것.\n"
        '예를 들어 당월이 150만 명이고 전월이 180만 명인데, 전년 동월이 120만 명이라면 "전월 대비 감소했다(부정적)"'
        '라고 단순 해석하기보다, "중국 국경절 등 대형 이벤트가 집중되었던 전월 대비로는 단기적으로 둔화되었으나, '
        '전년 대비로는 25% 신장하며 계절적 비수기에도 구조적 성장세를 단단하게 유지하고 있다"라고 입체적으로 보는 '
        "것이 맞음.\n"
        "분석 시 단순 증감(명) 보다는 절대 수치(만 명 등)와 신장률(%) 중심으로 표기할 것."
    ),
    "outbound": (
        "★ 내국인 출국자수 특성 반영 :\n"
        "내국인 출국자수는 전년 동월 대비 신장률(YoY %)로 해외여행 수요의 구조적 회복·성장 추세를 먼저 보되, 최근 "
        "몇 개월간의 전월 대비(MoM) 변화로 단기 모멘텀도 함께 짚을 것.\n"
        "설/추석 연휴, 여름 휴가철(7~8월), 겨울방학·연말연시(12~2월) 등 내국인 해외여행 성수기가 당월 또는 인접 "
        "월에 포함되는지를 감안해 일시적 급증/급감과 구조적 추세를 구분할 것.\n"
        "출국자수 증가는 국내 소비 여력이 해외로 분산될 가능성을 시사하므로, 국내 백화점 소비와의 '대체·유출 관계' "
        "관점에서 해석하고, 단순 증감(명)보다는 절대 수치(만 명 등)와 신장률(%) 중심으로 표기할 것."
    ),
    "retail": (
        "★ 소매판매지수 특성 반영 :\n"
        "유통업 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 함께 살피고, "
        "최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석할 것."
    ),
    "dept": (
        "★ 백화점 매출증감률 특성 반영 :\n"
        "백화점 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 함께 살피고, "
        "최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석할 것."
    ),
    "mart": (
        "★ 대형마트 매출증감률 특성 반영 :\n"
        "마트 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 함께 살피고, "
        "최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석할 것."
    ),
    "convenience": (
        "★ 편의점 매출증감률 특성 반영 :\n"
        "편의점 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 함께 살피고, "
        "최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석할 것."
    ),
}

# ── 모든 지표에 공통으로 붙는 고정 블록 (2026-09 고도화 프롬프트) ──────
COMMON_PERSONA = (
    "당신은 현대백화점 상품본부의 데이터 전략 분석가입니다.\n"
    "제공된 [경제 지표 데이터]를 바탕으로, 각 지표별로 아래의 [분석 지침]과 [출력 템플릿]을 엄격하게 준수하여 "
    "심층 분석 단락을 작성해 주세요."
)

COMMON_GUIDELINES = """[분석 지침]

1. 데이터 팩트 추출 (정량적 분석)
   - 최근 6~12개월 사이의 '고점(최고치)' 및 '저점(최저치)'의 발생 시점(YY년 MM월)과 수치를 명시할 것.
   - 최근 3개월간의 추이(상승/하락/반등 등)를 요약할 것.
   - 최근 월의 수치를 기준으로 다음 3가지 비교 데이터를 반드시 계산해서 참고할것:
     ① 최근 6개월 평균 수치와의 비교
     ② 전월 대비 증감 폭 (MoM)
     ③ 전년 동월 대비 증감 폭 (YoY)

2. 거시 경제적 의미 도출 (정성적 해석)
   - 위에서 계산된 수치(특히 MoM과 YoY의 차이, 평균과의 차이)를 바탕으로 현재의 상황이 일시적 현상인지, 추세적 흐름인지 해석할 것. (예: 인플레이션 압력 지속, 회복세 지연 등)

3. 백화점 고객군별 세분화된 영향
   - 도출된 경제적 상황이 다음 3가지 타겟 고객군에 미치는 영향을 분리하여 서술할 것:
     ① 내국인 일반 고객 (가격 민감도 높음, 이자 부담 등 체감)
     ② 내국인 VIP 고객 (자산가, 금리/물가 영향 상대적으로 적음)
     ③ 외국인 관광객 (환율 영향 큼, 국내 금리/물가 직접 영향 적음)

4. 유통업 실전 지표 및 마케팅 전략 연계
   - 백화점 핵심 지표인 '방문 빈도(트래픽)'와 '객단가(ATV)' 관점에서 향후 매출 영향을 예측할 것.
   - 이를 바탕으로 백화점의 프로모션, 신규 마케팅, MD 전개 등에 대해 어떤 스탠스(보수적 접근, 공격적 마케팅, 선택적 집중 등)를 취해야 하는지 결론지을 것."""

COMMON_ANSWER_TEMPLATE = """[답변 구성]

※ 아래 답변 예시를 참고하여 작성 (그치만 반드시 이 흐름일 필요은 없음)

[지표명]은(는) OO년 O월 OOO으로 고점(또는 저점)을 기록한 이후 OO년 O월 OOO까지 하락(또는 상승)했다가 최근 O개월간 반등(또는 하락)하여 OO년 O월 OOO을 기록하고 있습니다. 최근 수치는 6개월 평균(OOO)과 유사(또는 높음/낮음)하며, 전월 대비 소폭 상승/하락(O.O)했으나 전년 동월 대비로는 O.O 상승/하락해 [거시 경제적 의미: 예 - 여전히 인플레이션 압력을 시사합니다 / 회복세라 보기는 어렵습니다].
이러한 흐름은 현대백화점 고객의 [체감 물가/대출 이자/소비 심리] 부담을 높여, 내국인 일반 고객의 소비 심리와 객단가에 부정적(또는 긍정적) 영향을 줄 수 있으나, VIP 고객과 외국인 관광객의 경우 상대적으로 가격 민감도가 낮아(또는 환율 효과로 인해) 매출 영향이 제한적일(또는 긍정적일) 수 있습니다. 전반적으로 백화점 매출 측면에서는 방문 빈도와 객단가가 [어떻게 변화할 것인지 예측], 향후 프로모션이나 마케팅 전략에 대해서는 [어떤 스탠스로 접근해야 하는지 결론] 필요가 있습니다."""

COMMON_OUTPUT_RULES = """[답변 구성 (세부)]

※ 날짜나 시점을 언급할 때는 반드시 "OO년 O월"(예: 26년 7월) 형식으로만 표기하고, "26.07" 같은 표기는 쓰지 마세요.
※ 단순히 최근 하루이틀·한두 구간의 반등만으로 "추세 전환"이라고 성급히 단정하지 마세요.
※ 최근 수개월간의 고점·저점 대비 현재 위치가 어디인지 먼저 짚고, 그 다음 가장 최근 구간에서 일시적 반등인지 아니면 방향 자체가 바뀌는 신호인지 구분해서 설명해주세요.
※ 이 지표가 현대백화점 매출과 고객 소비 심리에 미치는 영향을 3~4문장으로, 한국어로 해석해주세요.
※ 제목이나 소제목을 달지 마세요 (예: "○○ 영향 해석" 같은 줄 금지).
※ 글머리표(*, -, •)나 번호 매기기를 쓰지 말고, 문장과 문장이 자연스럽게 이어지는 하나의 문단(또는 이어지는 여러 문단)으로 작성하세요.
※ 구분선(---, ***, 밑줄 등)을 절대 넣지 마세요.
※ 마크다운 서식(굵게, 기울임, 표 등) 없이 순수한 문장으로만 답하세요.
※ 모든 답변은 '존대어(~입니다 등)' 형태로 작성
※ 숫자 표기시 단위까지 표기해주고, 소수점이 있는경우 첫째자리까지 표기
※ '쓰고 지우기' 같은 보기 어려운 형태의 답변 금지, 평서문 형태 (한국어) 로만 작성"""


def format_korean_ym(ym) -> str:
    s = str(ym)
    if len(s) >= 8:
        return f"{s[2:4]}년 {int(s[4:6])}월 {int(s[6:8])}일"
    if len(s) == 6:
        return f"{s[2:4]}년 {int(s[4:6])}월"
    return s


def build_prompt(key: str, entry: dict) -> str:
    """2026-09 고도화 프롬프트: 공통 페르소나/분석지침/답변템플릿/출력규칙 +
    지표별 '★ 특성 반영' 블록 + 실제 [경제 지표 데이터]를 하나로 합친다."""
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
    recent_line = ("최근 추이(오래된 순 → 최신순): " + " → ".join(pairs)) if pairs else ""

    data_block = (
        f"[{title}]\n"
        f"최신값: {cur}{unit} · 전월비: {mom} · 전년비: {yoy} · 6개월 평균: {avg6}"
        + (f"\n{recent_line}" if recent_line else "")
    )

    note = INDICATOR_ANALYSIS_NOTES.get(key, "")

    sections = [COMMON_PERSONA]
    if note:
        sections.append(note)
    sections += [COMMON_GUIDELINES, COMMON_ANSWER_TEMPLATE, COMMON_OUTPUT_RULES,
                 "[경제 지표 데이터]\n" + data_block]

    return "\n\n\n".join(sections)


def _http(method: str, url: str, token: str = None, body: dict = None, timeout: int = 30) -> dict:
    headers = {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as e:
        print(f"  [DEBUG] {url}")
        print(f"  [DEBUG] 응답코드: {e.code} / 응답본문: {e.read().decode('utf-8', errors='replace')}")
        raise


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
