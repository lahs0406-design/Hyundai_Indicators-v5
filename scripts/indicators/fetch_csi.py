"""
fetch_csi.py — 소비심리 데이터 수집
────────────────────────────────────────────
수집 지표:
  · 소비자심리지수 (CCSI) — ECOS 월별

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
    get_fetch_start, today_str, months_ago, ecos_fetch
)

ECOS_KEY = os.environ["ECOS_KEY"]


def run(data: dict) -> dict:
    """data.json dict를 받아 소비심리 지표를 갱신 후 반환"""
    today = today_str()
    print("\n[소비심리] 소비자심리지수 (CCSI)")

    series = data.get("csi", [])
    rows = ecos_fetch("511Y002", "FME", "M",
                      get_fetch_start(series), today[:6], ECOS_KEY)
    if rows:
        for r in rows:
            series = upsert(series, r["ym"], r["val"])
        data["csi"] = sorted(series, key=lambda x: x["ym"])[-30:]
        print(f"  → {len(data['csi'])}개월, 최신: {data['csi'][-1]}")
    else:
        print("  → 데이터 없음, 기존 유지")

    return data


def main():
    data = load_existing()
    data = run(data)
    save_data(data)
    print("\n✅ fetch_csi.py 완료")


if __name__ == "__main__":
    main()
