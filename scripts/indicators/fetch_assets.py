"""
fetch_assets.py — 자산시장 데이터 수집
────────────────────────────────────────────
수집 지표:
  · KOSPI 지수 — ECOS 일별
  · 원/달러 환율 — ECOS 월별

환경변수:
  ECOS_KEY  한국은행 ECOS API 인증키
"""

import sys, os, datetime
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
    """data.json dict를 받아 자산시장 지표를 갱신 후 반환"""
    today = today_str()

    # ── KOSPI (일별)
    print("\n[자산시장] KOSPI 지수 (일별)")
    series = data.get("kospi", [])
    # 히스토리 부족 시 2년치, 충분하면 최근 10일
    if len(series) < 400:
        start_d = (datetime.date.today() - datetime.timedelta(days=730)).strftime("%Y%m%d")
        print("  → 히스토리 부족, 730일 전부터 수집")
    else:
        start_d = (datetime.date.today() - datetime.timedelta(days=10)).strftime("%Y%m%d")
    rows = ecos_fetch("802Y001", "0001000", "D", start_d, today, ECOS_KEY)
    if rows:
        for r in rows:
            series = upsert(series, r["ym"], r["val"])
        data["kospi"] = sorted(series, key=lambda x: x["ym"])[-600:]
        print(f"  → {len(data['kospi'])}거래일, 최신: {data['kospi'][-1]}")
    else:
        print("  → 데이터 없음, 기존 유지")

    # ── 환율 (월별)
    print("\n[자산시장] 원/달러 환율")
    series = data.get("fx", [])
    rows = ecos_fetch("731Y004", "0000001", "M",
                      get_fetch_start(series), today[:6], ECOS_KEY)
    if not rows:
        print("  → API 실패, 기존 값 유지")
    else:
        valid = [r for r in rows if 1000 <= r["val"] <= 2000]
        if valid:
            for r in valid:
                series = upsert(series, r["ym"], r["val"])
            data["fx"] = sorted(series, key=lambda x: x["ym"])[-30:]
            print(f"  → {len(data['fx'])}개월, 최신: {data['fx'][-1]}")
        else:
            print(f"  → 범위 오류 ({[r['val'] for r in rows]}), 기존 유지")

    return data


def main():
    data = load_existing()
    data = run(data)
    save_data(data)
    print("\n✅ fetch_assets.py 완료")


if __name__ == "__main__":
    main()
