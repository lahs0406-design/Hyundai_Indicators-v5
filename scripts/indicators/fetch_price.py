"""
fetch_price.py — 물가·금리 데이터 수집
────────────────────────────────────────────
수집 지표:
  · 소비자물가 상승률 (CPI) — ECOS 월별
  · 기준금리 — ECOS 일별 조회 후 월별 집계

환경변수:
  ECOS_KEY  한국은행 ECOS API 인증키
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from utils import (
    load_existing, save_data, upsert,
    get_fetch_start, today_str, ecos_fetch, months_ago
)

ECOS_KEY = os.environ["ECOS_KEY"]


def run(data: dict) -> dict:
    """data.json dict를 받아 물가·금리 지표를 갱신 후 반환"""
    today = today_str()

    # ── 소비자물가 (CPI)
    print("\n[물가금리] 소비자물가 상승률 (CPI)")
    series = data.get("cpi", [])
    rows = ecos_fetch("901Y009", "0", "M",
                      get_fetch_start(series), today[:6], ECOS_KEY)
    if rows:
        for r in rows:
            series = upsert(series, r["ym"], r["val"])
        data["cpi"] = sorted(series, key=lambda x: x["ym"])[-30:]
        print(f"  → {len(data['cpi'])}개월, 최신: {data['cpi'][-1]}")
    else:
        print("  → 데이터 없음, 기존 유지")

    # ── 기준금리 (일별 조회 후 월별 집계 — 금리 변경일이 월중 언제든 반영되도록)
    print("\n[물가금리] 기준금리")
    series = data.get("rate", [])
    start_date = months_ago(3) + "01"   # 일별 조회는 최근 3개월만 봐도 변경일 놓치지 않음 (ECOS 500행 한도 회피)
    rows = ecos_fetch("722Y001", "0101000", "D",
                      start_date, today, ECOS_KEY)
    if rows:
        monthly = {}
        for r in rows:
            monthly[r["ym"][:6]] = r["val"]
