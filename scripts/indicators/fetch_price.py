"""
fetch_price.py — 물가·금리 데이터 수집
────────────────────────────────────────────
수집 지표:
  · 소비자물가 상승률 (CPI) — ECOS 월별
  · 기준금리 — ECOS 월별

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
    get_fetch_start, today_str, ecos_fetch
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

    # ── 기준금리
    print("\n[물가금리] 기준금리")
    series = data.get("rate", [])
    rows = ecos_fetch("722Y001", "0101000", "M",
                      get_fetch_start(series), today[:6], ECOS_KEY)
    if rows:
        for r in rows:
            series = upsert(series, r["ym"], r["val"])
        data["rate"] = sorted(series, key=lambda x: x["ym"])[-30:]
        print(f"  → {len(data['rate'])}개월, 최신: {data['rate'][-1]}")
    else:
        print("  → 데이터 없음, 기존 유지")

    return data


def main():
    data = load_existing()
    data = run(data)
    save_data(data)
    print("\n✅ fetch_price.py 완료")


if __name__ == "__main__":
    main()
