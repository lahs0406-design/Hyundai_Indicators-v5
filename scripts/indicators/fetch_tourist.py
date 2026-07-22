"""
fetch_tourist.py — 관광객 데이터 수집
────────────────────────────────────────────
수집 지표:
  · 방한 외국인 관광객 수 — KOSIS 월별
  · 내국인 출국자 수 — KOSIS 월별
  · 주요 지역 외지인 방문자 — 한국관광공사 빅데이터 GW

환경변수:
  KOSIS_KEY    KOSIS API 인증키
  KOSIS_PROXY  Cloudflare Worker 프록시 URL (선택)
  TOURISM_KEY  한국관광공사 빅데이터 GW 인증키 (없으면 방문자 수집 skip)
"""

import sys, os, json, urllib.request, urllib.parse, datetime, time, calendar as _cal
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from utils import (
    load_existing, save_data, upsert,
    get_fetch_start, today_str, kosis_fetch
)

KOSIS_KEY   = os.environ["KOSIS_KEY"]
KOSIS_PROXY = os.environ.get("KOSIS_PROXY", "")
TOURISM_KEY = os.environ.get("TOURISM_KEY", "")

# 현대백화점 출점 광역시도
TOURISM_AREAS = {
    "서울특별시": "서울",
    "부산광역시": "부산",
    "대구광역시": "대구",
    "인천광역시": "인천",
    "광주광역시": "광주",
    "대전광역시": "대전",
    "울산광역시": "울산",
}


def _iter_yms(start_ym: str, count: int) -> list:
    """start_ym 부터 과거로 count개월 ym 리스트"""
    y, m = int(start_ym[:4]), int(start_ym[4:])
    result = []
    for _ in range(count):
        result.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return result


def _fetch_tourism_visitors(data: dict) -> dict:
    """한국관광공사 빅데이터: 지역별 외지인 방문자 수"""
    if not TOURISM_KEY:
        print("\n[관광객] 방문자 수집 skip (TOURISM_KEY 없음)")
        return data

    print("\n[관광객] 주요 지역 외지인 방문자 (관광공사 빅데이터)")
    tourism = data.get("tourism", {})
    base_ym = today_str()[:6]
    cur_yms  = _iter_yms(base_ym, 13)
    prev_yms = [f"{int(ym[:4])-1}{ym[4:]}" for ym in cur_yms]
    target_yms = sorted(set(cur_yms + prev_yms))
    print(f"  수집 범위: {target_yms[0]} ~ {target_yms[-1]} ({len(target_yms)}개월)")

    for ym in target_yms:
        is_current = (ym == base_ym)
        if not is_current and ym in tourism:
            print(f"  {ym} 캐시 사용")
            continue

        y, m   = int(ym[:4]), int(ym[4:])
        last_d = _cal.monthrange(y, m)[1]
        params = urllib.parse.urlencode({
            "serviceKey": TOURISM_KEY,
            "numOfRows":  "1000",
            "pageNo":     "1",
            "MobileOS":   "ETC",
            "MobileApp":  "HyundaiDashboard",
            "startYmd":   f"{ym}01",
            "endYmd":     f"{ym}{last_d:02d}",
        })
        url = (
            "https://apis.data.go.kr/B551011/DataLabService"
            f"/metcoRegnVisitrDDList?{params}"
        )
        try:
            with urllib.request.urlopen(url, timeout=15) as res:
                raw = res.read().decode("utf-8")
            import xml.etree.ElementTree as ET
            root  = ET.fromstring(raw)
            items = root.findall(".//item")
            month_data = {}
            for item in items:
                area_nm = (item.findtext("areaNm") or "").strip()
                tou_div = (item.findtext("touDivCd") or "").strip()
                ymd     = (item.findtext("baseYmd") or "").strip()
                raw_num = item.findtext("touNum") or "0"
                short_nm = TOURISM_AREAS.get(area_nm)
                if not short_nm or tou_div != "3" or not ymd:
                    continue
                try:
                    cnt = float(raw_num)
                except ValueError:
                    continue
                if short_nm not in month_data:
                    month_data[short_nm] = {}
                month_data[short_nm][ymd] = round(cnt)

            if month_data:
                if ym not in tourism:
                    tourism[ym] = {}
                for short_nm, day_dict in month_data.items():
                    tourism[ym][short_nm] = {
                        "total": sum(day_dict.values()),
                        "daily": day_dict,
                    }
                print(f"  {ym}: {list(tourism[ym].keys())} 수집완료")
            else:
                print(f"  {ym}: 데이터 없음 (응답 {len(items)}건)")
        except Exception as e:
            print(f"  [관광 오류] {ym}: {e}")
        time.sleep(0.3)

    data["tourism"] = tourism
    return data


def run(data: dict) -> dict:
    """data.json dict를 받아 관광객 지표를 갱신 후 반환"""
    today = today_str()

    # ── 방한 외국인 관광객
    print("\n[관광객] 방한 외국인 관광객 수")
    series = data.get("tourist", [])
    rows = kosis_fetch(
        "314", "DT_TRD_TGT_ENT_AGG_MONTH",
        "13103314422T01", "13102314422A.1+",
        get_fetch_start(series), today[:6],
        KOSIS_KEY, KOSIS_PROXY
    )
    if rows:
        for r in rows:
            series = upsert(series, r["ym"], r["val"])
        data["tourist"] = sorted(series, key=lambda x: x["ym"])[-30:]
        print(f"  → {len(data['tourist'])}개월, 최신: {data['tourist'][-1]}")
    else:
        print("  → 데이터 없음, 기존 유지")

    # ── 내국인 출국자
    print("\n[관광객] 내국인 출국자 수")
    series = data.get("outbound", [])
    rows = kosis_fetch(
        "314", "DT_NEW_AGE_DEP_AGG_MONTH",
        "13103836116T01", "13102836116A.01+",
        get_fetch_start(series), today[:6],
        KOSIS_KEY, KOSIS_PROXY
    )
    if rows:
        for r in rows:
            series = upsert(series, r["ym"], r["val"])
        data["outbound"] = sorted(series, key=lambda x: x["ym"])[-30:]
        print(f"  → {len(data['outbound'])}개월, 최신: {data['outbound'][-1]}")
    else:
        print("  → 데이터 없음, 기존 유지")

    # ── 지역별 방문자 (관광공사)
    data = _fetch_tourism_visitors(data)

    return data


def main():
    data = load_existing()
    data = run(data)
    save_data(data)
    print("\n✅ fetch_tourist.py 완료")


if __name__ == "__main__":
    main()
