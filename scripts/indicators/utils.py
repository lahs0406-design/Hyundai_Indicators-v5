"""
utils.py
────────────────────────────────────────────────
공통 헬퍼 함수 모음
  - data.json 로드 / 저장
  - upsert / get_fetch_start
  - 날짜 헬퍼 (today_str, months_ago)
  - ECOS API 호출 (ecos_fetch)
  - KOSIS API 호출 (kosis_fetch)
"""

import os, json, urllib.request, urllib.parse, datetime

# data.json 위치: 스크립트 디렉터리 기준 상위 폴더
DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data.json")


# ── data.json 로드 / 저장 ─────────────────────────────
def load_existing():
    try:
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_data(data):
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── 시리즈 upsert ────────────────────────────────────
def upsert(series: list, ym: str, val: float) -> list:
    """ym이 이미 있으면 업데이트, 없으면 추가"""
    for item in series:
        if item["ym"] == ym:
            item["val"] = val
            return series
    series.append({"ym": ym, "val": val})
    return series


# ── 날짜 헬퍼 ────────────────────────────────────────
def today_str(fmt="%Y%m%d"):
    return datetime.date.today().strftime(fmt)


def months_ago(n, fmt="%Y%m"):
    d = datetime.date.today()
    m = d.month - n
    y = d.year + m // 12
    m = m % 12 or 12
    return f"{y}{m:02d}"


def get_fetch_start(series: list, min_months: int = 24) -> str:
    """히스토리가 짧으면 30개월 전, 충분하면 3개월 전"""
    if len(series) < min_months:
        return months_ago(30)
    return months_ago(3)


# ── ECOS API 호출 ────────────────────────────────────
def ecos_fetch(stat_code: str, item_code: str, cycle: str,
               start_date: str, end_date: str, key: str) -> list:
    """
    한국은행 ECOS StatisticSearch API
    cycle: 'M'(월) | 'D'(일) | 'Q'(분기)
    반환: [{"ym": "202604", "val": 99.2}, ...]
    """
    url = (
        f"https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr"
        f"/1/500/{stat_code}/{cycle}/{start_date}/{end_date}/{item_code}"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as res:
            data = json.loads(res.read().decode("utf-8"))
            rows = data.get("StatisticSearch", {}).get("row", [])
            result = []
            for r in rows:
                ym  = r.get("TIME", "")
                val = r.get("DATA_VALUE", "")
                if ym and val and val.strip():
                    try:
                        result.append({"ym": ym, "val": float(val.replace(",", ""))})
                    except ValueError:
                        pass
            return result
    except Exception as e:
        print(f"  [ECOS 오류] {stat_code}/{item_code}: {e}")
        return []


# ── KOSIS API 호출 ───────────────────────────────────
def kosis_fetch(org_id: str, tbl_id: str, itm_id: str,
                obj_l1: str, start_prd: str, end_prd: str,
                key: str, proxy: str = "", prd_se: str = "M") -> list:
    """
    KOSIS statisticsParameterData API
    프록시(Cloudflare Worker) 우선, 없으면 직접 호출
    """
    params = urllib.parse.urlencode({
        "method":       "getList",
        "apiKey":       key,
        "format":       "json",
        "jsonVD":       "Y",
        "outputFields": "ITM_ID PRD_DE DT",
        "orgId":        org_id,
        "tblId":        tbl_id,
        "objL1":        obj_l1,
        "itmId":        itm_id,
        "prdSe":        prd_se,
        "startPrdDe":   start_prd,
        "endPrdDe":     end_prd,
        "prdInterval":  "1",
    })
    base_url = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
    urls_to_try = []
    if proxy:
        urls_to_try.append(f"{proxy}?{params}")
    urls_to_try.append(f"{base_url}?{params}")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    for url in urls_to_try:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as res:
                rows = json.loads(res.read().decode("utf-8"))
                if not isinstance(rows, list):
                    continue
                result = []
                for r in rows:
                    ym  = r.get("PRD_DE", "")
                    val = r.get("DT", "")
                    if ym and val and val.strip():
                        try:
                            result.append({"ym": ym, "val": float(val.replace(",", ""))})
                        except ValueError:
                            pass
                if result:
                    return result
        except Exception as e:
            print(f"  [KOSIS 오류] {tbl_id}: {e}")
            continue
    return []
