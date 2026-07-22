"""
KOSIS 유통채널 파라미터 확인
실행: python scripts/debug_kosis.py
"""
import os, json, urllib.request, urllib.parse
from dotenv import load_dotenv
load_dotenv()

KEY = os.environ.get("KOSIS_KEY", "")
BASE = "https://kosis.kr/openapi/Param/statisticsParameterData.do"

def call(params):
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as res:
        text = res.read().decode("utf-8")
    return json.loads(text)

# ── 세 채널 품목별 C1/C1_NM 전체 목록 (outputFields 없음 → C1/C1_NM 자동 포함)
print("="*60)
print("유통채널 품목별 C1 코드 확인 (2025-03 기준)")
PARAMS = {
    "method":"getList","apiKey":KEY,"format":"json","jsonVD":"Y",
    "prdSe":"M","startPrdDe":"202503","endPrdDe":"202503",
    "itmId":"T002","objL1":"ALL","prdInterval":"1",
}
for tblId, label in [
    ("DT_115023_100","대형마트"),
    ("DT_115023_200","백화점"),
    ("DT_115023_300","편의점"),
]:
    rows = call({**PARAMS,"orgId":"115","tblId":tblId})
    if isinstance(rows, list):
        print(f"\n  [{label}] {len(rows)}개 품목")
        for i, r in enumerate(rows):
            mark = " ← 합계(마지막)" if i == len(rows)-1 else ""
            print(f"    C1={r.get('C1','?'):6s} C1_NM={r.get('C1_NM','?'):16s} DT={r.get('DT','?')}{mark}")
    else:
        print(f"\n  [{label}] 오류: {rows}")
