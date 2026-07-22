"""
fetch_data.py — 전체 데이터 수집 오케스트레이터
─────────────────────────────────────────────────────
카테고리별 스크립트를 순서대로 호출하고,
날씨·공휴일 데이터를 수집한 뒤 data.json을 저장합니다.

카테고리 스크립트 (각각 단독 실행도 가능):
  python scripts/fetch_csi.py       # 소비심리
  python scripts/fetch_price.py     # 물가·금리
  python scripts/fetch_assets.py    # 자산시장
  python scripts/fetch_tourist.py   # 관광객
  python scripts/fetch_retail.py    # 유통채널

환경변수:
  ECOS_KEY     한국은행 ECOS API 인증키
  KOSIS_KEY    KOSIS API 인증키
  KOSIS_PROXY  Cloudflare Worker 프록시 URL (선택)
  KMA_KEY      기상청 API Hub 인증키 (없으면 날씨 skip)
  HOLIDAY_KEY  공공데이터포털 인증키 (없으면 공휴일 skip)
  TOURISM_KEY  한국관광공사 빅데이터 GW 인증키 (없으면 관광 skip)
"""

import sys, os, json, urllib.request, urllib.parse, datetime, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "indicators"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from utils import load_existing, save_data, today_str

# ── 카테고리 스크립트 import
import fetch_csi
import fetch_price
import fetch_assets
import fetch_tourist
import fetch_retail
import gen_summary

KMA_KEY     = os.environ.get("KMA_KEY", "")
HOLIDAY_KEY = os.environ.get("HOLIDAY_KEY", "")

# 기상청 ASOS 지점번호
KMA_STATIONS = {
    "seoul":    "108",
    "busan":    "159",
    "daegu":    "143",
    "incheon":  "112",
    "gwangju":  "156",
    "daejeon":  "133",
    "ulsan":    "152",
    "cheongju": "131",
}


# ── 기상청 ASOS 일별 기후값 조회 ──────────────────────
def _kma_parse_csv(text: str) -> list:
    result = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cols = line.split()
        if len(cols) < 39:
            continue
        ymd_raw = cols[0]
        if len(ymd_raw) == 6:
            ymd_raw = "20" + ymd_raw
        try:
            t_raw = float(cols[10])
            r_raw = float(cols[38])
            result.append({
                "ymd":  ymd_raw,
                "temp": None if t_raw <= -9.0 else t_raw,
                "rain": 0.0  if r_raw <= -9.0 else r_raw,
            })
        except (ValueError, IndexError):
            continue
    return result


def kma_fetch_month(station_id: str, ym: str) -> dict:
    import calendar
    if not KMA_KEY:
        return None
    y, m   = int(ym[:4]), int(ym[4:6])
    last_d = calendar.monthrange(y, m)[1]
    tm1    = f"{ym}01"
    _today = datetime.date.today()
    if ym == _today.strftime("%Y%m"):
        tm2 = (_today - datetime.timedelta(days=1)).strftime("%Y%m%d")
    else:
        tm2 = f"{ym}{last_d:02d}"
    url = (
        f"https://apihub.kma.go.kr/api/typ01/url/kma_sfcdd3.php"
        f"?tm1={tm1}&tm2={tm2}&stn={station_id}&authKey={KMA_KEY}"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as res:
            raw = res.read().decode("euc-kr", errors="replace")
    except Exception as e:
        print(f"  [KMA 오류] stn={station_id} {ym}: {e}")
        return None
    rows = _kma_parse_csv(raw)
    if not rows:
        return None
    days_data = []
    temps, total_rain, rain_days = [], 0.0, 0
    for r in rows:
        d  = int(r["ymd"][6:8])
        t  = r["temp"]
        rn = r["rain"]
        days_data.append({"d": d, "temp": t, "rain": rn})
        if t is not None:
            temps.append(t)
        total_rain += rn
        if rn > 0:
            rain_days += 1
    return {
        "ym":         ym,
        "days":       days_data,
        "avg_temp":   round(sum(temps) / len(temps), 1) if temps else None,
        "max_temp":   round(max(temps), 1) if temps else None,
        "total_rain": round(total_rain, 1),
        "rain_days":  rain_days,
    }


def _fetch_holidays(data: dict, today: str) -> dict:
    """공휴일 수집 (한국천문연구원 특일정보)"""
    if not HOLIDAY_KEY:
        print("\n[공휴일] skip (HOLIDAY_KEY 없음)")
        return data

    print("\n[공휴일] 수집 중...")
    holidays   = data.get("holidays", {})
    this_year  = int(today[:4])
    for year in [this_year - 1, this_year]:
        year_key = str(year)
        if year_key in holidays and year < this_year:
            print(f"  {year}년 캐시 사용 ({len(holidays[year_key])}건)")
            continue
        year_hols = {}
        for month in range(1, 13):
            params = urllib.parse.urlencode({
                "serviceKey": HOLIDAY_KEY,
                "solYear":    year,
                "solMonth":   f"{month:02d}",
                "numOfRows":  "20",
                "_type":      "json",
            })
            url = (
                "http://apis.data.go.kr/B090041/openapi/service"
                f"/SpcdeInfoService/getRestDeInfo?{params}"
            )
            try:
                with urllib.request.urlopen(url, timeout=10) as res:
                    body  = json.loads(res.read().decode("utf-8"))
                    items = body.get("response", {}).get("body", {}).get("items", {})
                    if not items:
                        continue
                    rows = items.get("item", [])
                    if isinstance(rows, dict):
                        rows = [rows]
                    for r in rows:
                        date_str = str(r.get("locdate", ""))
                        is_hol   = r.get("isHoliday", "N")
                        if date_str and is_hol == "Y":
                            year_hols[date_str] = r.get("dateName", "")
            except Exception as e:
                print(f"  [공휴일 오류] {year}-{month:02d}: {e}")
            time.sleep(0.1)
        holidays[year_key] = year_hols
        print(f"  {year}년: {len(year_hols)}건 수집")
    data["holidays"] = holidays
    return data


def _fetch_weather(data: dict, today: str) -> dict:
    """날씨 수집 (기상청 ASOS 일별)"""
    if not KMA_KEY:
        print("\n[날씨] skip (KMA_KEY 없음)")
        return data

    print("\n[날씨] 기상청 ASOS 수집 중...")
    weather  = data.get("weather", {})
    base_ym  = today[:6]

    def _iter(start_ym, count):
        y, m = int(start_ym[:4]), int(start_ym[4:])
        res = []
        for _ in range(count):
            res.append(f"{y}{m:02d}")
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        return res

    cur_yms    = _iter(base_ym, 13)
    prev_yms   = [f"{int(ym[:4])-1}{ym[4:]}" for ym in cur_yms]
    target_yms = sorted(set(cur_yms + prev_yms))
    print(f"  범위: {target_yms[0]} ~ {target_yms[-1]} ({len(target_yms)}개월 × {len(KMA_STATIONS)}지역)")

    for region, stn in KMA_STATIONS.items():
        region_data          = weather.get(region, {})
        new_count, skip_count = 0, 0
        for ym in target_yms:
            if ym != base_ym and ym in region_data:
                skip_count += 1
                continue
            result = kma_fetch_month(stn, ym)
            if result:
                region_data[ym] = result
                new_count += 1
            else:
                print(f"    {region}/{ym} 없음")
            time.sleep(0.2)
        print(f"  {region}: 신규 {new_count}건, 캐시 {skip_count}건")
        weather[region] = region_data

    data["weather"] = weather
    return data


def main():
    print("=" * 55)
    print(f"fetch_data.py 시작: {today_str()}")
    print("=" * 55)

    # ── data.json 한 번 로드
    data = load_existing()

    # ── 1. 소비심리
    print("\n" + "─" * 40)
    print("▶ 소비심리")
    data = fetch_csi.run(data)

    # ── 2. 물가·금리
    print("\n" + "─" * 40)
    print("▶ 물가·금리")
    data = fetch_price.run(data)

    # ── 3. 자산시장
    print("\n" + "─" * 40)
    print("▶ 자산시장")
    data = fetch_assets.run(data)

    # ── 4. 관광객
    print("\n" + "─" * 40)
    print("▶ 관광객")
    data = fetch_tourist.run(data)

    # ── 5. 유통채널
    print("\n" + "─" * 40)
    print("▶ 유통채널")
    data = fetch_retail.run(data)

    # ── 6. 공휴일
    print("\n" + "─" * 40)
    print("▶ 공휴일")
    data = _fetch_holidays(data, today_str())

    # ── 7. 날씨
    print("\n" + "─" * 40)
    print("▶ 날씨")
    data = _fetch_weather(data, today_str())

    # ── 저장
    save_data(data)
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    print(f"\n{'=' * 55}")
    print(f"✅ data.json 저장 완료 ({now.strftime('%Y.%m.%d %H:%M KST')})")

    # ── summary.json 생성 (AI 분석용 경량 요약)
    print("\n" + "─" * 40)
    print("▶ summary.json 생성 (AI 분석용)")
    summary = gen_summary.run(data)
    gen_summary.save_summary(summary)
    print(f"✅ summary.json 저장 완료")
    print("=" * 55)


if __name__ == "__main__":
    main()