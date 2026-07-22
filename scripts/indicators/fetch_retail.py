"""
fetch_retail.py — 유통채널 데이터 수집
────────────────────────────────────────────
수집 지표:
  · 백화점 매출증감률    — KOSIS orgId=115, DT_115023_200
  · 대형마트 매출증감률  — KOSIS orgId=115, DT_115023_100
  · 편의점 매출증감률    — KOSIS orgId=115, DT_115023_300
  · 소매판매지수         — ECOS 월별

저장 구조 (data.json):
  "dept"              : 합계 시계열 [{"ym","val"}, ...]
  "dept_items"        : 품목별  {"잡화": [...], "식품": [...], ...}
  "mart" / "mart_items"
  "convenience" / "convenience_items"

환경변수:
  ECOS_KEY     한국은행 ECOS API 인증키
  KOSIS_KEY    KOSIS API 인증키
  KOSIS_PROXY  Cloudflare Worker 프록시 URL (선택)
"""

import sys, os, json, urllib.request, urllib.parse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from utils import (
    load_existing, save_data, upsert,
    get_fetch_start, today_str, ecos_fetch
)

ECOS_KEY    = os.environ["ECOS_KEY"]
KOSIS_KEY   = os.environ["KOSIS_KEY"]
KOSIS_PROXY = os.environ.get("KOSIS_PROXY", "")
KOSIS_BASE  = "https://kosis.kr/openapi/Param/statisticsParameterData.do"

CHANNELS = {
    "dept":        {"org": "115", "tbl": "DT_115023_200", "label": "백화점"},
    "mart":        {"org": "115", "tbl": "DT_115023_100", "label": "대형마트"},
    "convenience": {"org": "115", "tbl": "DT_115023_300", "label": "편의점"},
}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def fetch_channel(org_id: str, tbl_id: str, start_prd: str, end_prd: str):
    """
    KOSIS 유통채널 전년동월비(T002) 품목별 수집.
    outputFields 미지정 → C1/C1_NM 자동 포함.
    각 월의 마지막 행 = 합계.

    반환: (total_series, items_dict)
      total_series : [{"ym": "202503", "val": -2.1}, ...]
      items_dict   : {"잡화": [...], "식품": [...], ...}
    """
    params = urllib.parse.urlencode({
        "method":      "getList",
        "apiKey":      KOSIS_KEY,
        "format":      "json",
        "jsonVD":      "Y",
        "orgId":       org_id,
        "tblId":       tbl_id,
        "objL1":       "ALL",
        "itmId":       "T002",
        "prdSe":       "M",
        "startPrdDe":  start_prd,
        "endPrdDe":    end_prd,
        "prdInterval": "1",
    })

    urls = []
    if KOSIS_PROXY:
        urls.append(f"{KOSIS_PROXY}?{params}")
    urls.append(f"{KOSIS_BASE}?{params}")

    rows = None
    for url in urls:
        try:
            req = urllib.request.Request(url, headers=_HEADERS)
            with urllib.request.urlopen(req, timeout=20) as res:
                data = json.loads(res.read().decode("utf-8"))
                if isinstance(data, list) and data:
                    rows = data
                    break
        except Exception as e:
            print(f"  [KOSIS 오류] {tbl_id}: {e}")

    if not rows:
        return [], {}

    prd_last: dict[str, float] = {}   # ym → 마지막 DT (합계)
    items:    dict[str, list]  = {}   # C1_NM → [{"ym", "val"}]

    for r in rows:
        ym  = r.get("PRD_DE", "")
        val = r.get("DT", "")
        nm  = r.get("C1_NM", "")
        if not (ym and val):
            continue
        try:
            v = float(str(val).replace(",", ""))
        except ValueError:
            continue

        prd_last[ym] = v          # 덮어쓰기 → 각 월 마지막 행 = 합계

        if nm:
            if nm not in items:
                items[nm] = []
            items[nm].append({"ym": ym, "val": v})

    total = [{"ym": ym, "val": v} for ym, v in sorted(prd_last.items())]
    return total, items


def run(data: dict) -> dict:
    """data.json dict를 받아 유통채널 지표를 갱신 후 반환"""
    today = today_str()

    # ── 유통 3채널 (KOSIS) ─────────────────────────────────────────
    for key_name, cfg in CHANNELS.items():
        print(f"\n[유통채널] {cfg['label']} 매출증감률 (품목별)")
        series = data.get(key_name, [])
        start  = get_fetch_start(series)

        total, items = fetch_channel(cfg["org"], cfg["tbl"], start, today[:6])

        if not total:
            print("  → 데이터 없음, 기존 유지")
            continue

        # 합계 시계열 upsert
        for entry in total:
            series = upsert(series, entry["ym"], entry["val"])
        data[key_name] = sorted(series, key=lambda x: x["ym"])[-30:]
        print(f"  → 합계 {len(data[key_name])}개월, 최신: {data[key_name][-1]}")

        # 품목별 시계열 upsert
        items_key = f"{key_name}_items"
        existing  = data.get(items_key, {})
        for nm, nm_series in items.items():
            if nm not in existing:
                existing[nm] = []
            for entry in nm_series:
                existing[nm] = upsert(existing[nm], entry["ym"], entry["val"])
            existing[nm] = sorted(existing[nm], key=lambda x: x["ym"])[-30:]
        data[items_key] = existing
        print(f"  → 품목 {len(existing)}종 저장")

    # ── 소매판매지수 (ECOS) ────────────────────────────────────────
    print("\n[유통채널] 소매판매지수")
    series = data.get("retail", [])
    rows = ecos_fetch(
        "901Y098", "I74B", "M",
        get_fetch_start(series), today[:6], ECOS_KEY
    )
    if rows:
        for r in rows:
            series = upsert(series, r["ym"], r["val"])
        data["retail"] = sorted(series, key=lambda x: x["ym"])[-30:]
        print(f"  → {len(data['retail'])}개월, 최신: {data['retail'][-1]}")
    else:
        print("  → 데이터 없음, 기존 유지")

    return data


def main():
    data = load_existing()
    data = run(data)
    save_data(data)
    print("\n✅ fetch_retail.py 완료")


if __name__ == "__main__":
    main()
