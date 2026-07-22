"""
gen_summary.py — AI 분석용 요약 JSON 생성
───────────────────────────────────────────
data.json에서 AI가 필요한 데이터만 추출해 summary.json 생성.

포함:
  · 각 지표 최근 12개월 시계열
  · KPI 요약 (cur / mom / yoy / avg6)
  · 유통채널 품목별 최신월 값

제외:
  · weather (날씨 일별 캘린더 — 전체 용량의 ~80%)
  · holidays (공휴일 목록 — AI 불필요)
  · *_items 시계열 전체 (최신월만 포함)

실행: python scripts/gen_summary.py
"""

import os, json, datetime

DATA_PATH    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data.json")
SUMMARY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "summary.json")

# 요약 대상 지표 키 (weather, holidays, *_items 제외)
INDICATOR_KEYS = [
    "csi",          # 소비자심리지수
    "cpi",          # 소비자물가
    "rate",         # 기준금리
    "fx",           # 원/달러 환율
    "kospi",        # KOSPI
    "online",       # 온라인쇼핑
    "dept",         # 백화점 매출
    "mart",         # 대형마트 매출
    "convenience",  # 편의점 매출
    "retail",       # 소매판매지수
    "tourist",      # 방한 외국인
    "outbound",     # 내국인 출국
]

# 품목별 시계열이 있는 채널 (최신월만 추출)
RETAIL_ITEM_KEYS = {
    "dept":        "dept_items",
    "mart":        "mart_items",
    "convenience": "convenience_items",
}


def calc_kpi(series: list) -> dict:
    """시계열 → KPI 딕셔너리"""
    if not series:
        return {}
    vals = [r["val"] for r in series]
    cur  = vals[-1]
    kpi  = {"cur": cur}

    if len(vals) >= 2:
        kpi["mom"] = round(cur - vals[-2], 2)          # 전월비
    if len(vals) >= 13:
        kpi["yoy"] = round(cur - vals[-13], 2)         # 전년동월비
    if len(vals) >= 6:
        kpi["avg6"] = round(sum(vals[-6:]) / 6, 2)     # 최근 6개월 평균

    return kpi


def latest_items(items_dict: dict) -> dict:
    """품목별 시계열 → 최신월 값만 추출"""
    result = {}
    for nm, series in items_dict.items():
        if series:
            result[nm] = series[-1]["val"]
    return result


def run(data: dict) -> dict:
    now_kst = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    summary = {
        "generated":  now_kst.strftime("%Y%m"),
        "updated_at": now_kst.strftime("%Y-%m-%d %H:%M KST"),
    }

    for key in INDICATOR_KEYS:
        series = data.get(key, [])
        if not series:
            continue

        entry = {
            "kpi":      calc_kpi(series),
            "series12": series[-12:],          # 최근 12개월만
        }

        # 유통채널은 품목별 최신월도 추가
        items_key = RETAIL_ITEM_KEYS.get(key)
        if items_key and data.get(items_key):
            entry["items_latest"] = latest_items(data[items_key])

        summary[key] = entry

    return summary


def save_summary(summary: dict):
    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)


def main():
    try:
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"  [오류] data.json 읽기 실패: {e}")
        return

    summary = run(data)
    save_summary(summary)

    # 용량 비교 출력
    data_size    = os.path.getsize(DATA_PATH)
    summary_size = os.path.getsize(SUMMARY_PATH)
    print(f"  data.json    : {data_size/1024:.0f} KB")
    print(f"  summary.json : {summary_size/1024:.0f} KB  ({summary_size/data_size*100:.1f}%)")
    keys = [k for k in summary if k not in ("generated", "updated_at")]
    print(f"  포함 지표    : {len(keys)}개 ({', '.join(keys)})")


if __name__ == "__main__":
    main()
