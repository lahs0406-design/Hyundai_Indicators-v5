/* ===========================================
   JS § 5. 날짜 헬퍼
   · addMonths(yyyymm, n): n개월 전후 계산
   · nowYM(): 현재 YYYYMM 반환
   ═══════════════════════════════════════════ */
function addMonths(yyyymm, n) {
  var y = parseInt(yyyymm.substring(0,4));
  var m = parseInt(yyyymm.substring(4,6)) + n;
  while(m > 12){m -= 12; y++;}
  while(m < 1){m += 12; y--;}
  return y.toString() + (m<10?'0':'')+m.toString();
}
function nowYM() {
  var d = new Date();
  return d.getFullYear().toString() + (d.getMonth()<9?'0':'')+(d.getMonth()+1).toString();
}

/* ═══════════════════════════════════════════
   JS § 6. 포맷 헬퍼
   · fmtVal(val, unit): 단위별 숫자 포맷
     - % → #,##0.0%
     - 원/건/명 → #,##0 + 단위
     - p/조 → 정수 + 단위
   · fmtDiff(diff, unit): 증감 화살표 포맷
   ═══════════════════════════════════════════ */
// 단위별 포맷 규칙:
//   % → #,##0.0%  (소수점 1자리 + % 단위)
//   원 → #,##0원  (정수 콤마 + 원)
//   건/명/p/억원 등 → #,##0 + 단위
//   증감이 % 인 경우 → 부호 포함 #,##0.0%
function fmtVal(val, unit, isDiff) {
  if(val === null || val === undefined || isNaN(val)) return '-';
  var n = Number(val);
  var sign = isDiff ? (n > 0 ? '+' : '') : '';
  if(unit === '%') {
    // #,##0.0%
    return sign + n.toLocaleString('ko-KR', {minimumFractionDigits:1, maximumFractionDigits:1}) + '%';
  }
  if(unit === '원') {
    // #,##0원
    return sign + Math.round(n).toLocaleString('ko-KR') + '원';
  }
  if(unit === '건' || unit === '명') {
    // #,##0건/명
    return sign + Math.round(n).toLocaleString('ko-KR') + unit;
  }
  if(unit === 'p' || unit === '억원' || unit === '조') {
    // #,##0p 등 (소수점 없이)
    return sign + Math.round(n).toLocaleString('ko-KR') + (unit||'');
  }
  // 기본: 소수점 1자리
  return sign + n.toLocaleString('ko-KR', {minimumFractionDigits:1, maximumFractionDigits:1}) + (unit||'');
}

// 증감(diff)값 포맷: 단위에 따라 % 또는 원/건 등
function fmtDiff(diff, unit) {
  if(diff === null || diff === undefined || diff === '-') return '-';
  var n = Number(diff);
  var sign = n > 0 ? '▲ +' : n < 0 ? '▼ ' : '= ';
  var absN = Math.abs(n);
  if(unit === '%') {
    return sign + absN.toLocaleString('ko-KR', {minimumFractionDigits:1, maximumFractionDigits:1}) + '%p';
  }
  if(unit === '원') {
    return sign + Math.round(absN).toLocaleString('ko-KR') + '원';
  }
  if(unit === '건' || unit === '명') {
    return sign + Math.round(absN).toLocaleString('ko-KR') + unit;
  }
  if(unit === 'p') {
    return sign + Math.round(absN).toLocaleString('ko-KR') + 'p';
  }
  return sign + absN.toLocaleString('ko-KR', {minimumFractionDigits:1, maximumFractionDigits:1}) + (unit||'');
}

/* ═══════════════════════════════════════════
   JS § 7. 차트 레이블 생성
   · makeLabels(rows): API rows → 차트 레이블
   · makeMonthLabels(): 샘플용 1월~12월
   ═══════════════════════════════════════════ */


function makeLabels(rows) {
  return rows.map(function(r){
    if(r.ym && r.ym.length === 8) {
      // 일별(MM/DD): makeLabels가 MM/DD 형식 반환 → renderChart에서 월 단위로 표시
      return r.ym.substring(4,6)+'/'+r.ym.substring(6,8);
    }
    if(r.ym && r.ym.indexOf('Q') >= 0) return r.ym.substring(2,4)+'.'+r.ym.substring(4);
    return r.ym ? r.ym.substring(2,4)+'.'+r.ym.substring(4,6) : r;
  });
}
function makeMonthLabels() {
  return ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
}
/* ===========================================
   JS § 8. 차트 렌더링 (renderChart)
   · 일별 데이터(KOSPI 등): 포인트 숨김,
     가로축은 월이 바뀌는 첫 포인트에만 "N월" 표시
   · 월별/분기별: 일반 레이블 그대로 표시
   ═══════════════════════════════════════════ */
// 일별 데이터(KOSPI 등)일 때: 데이터 포인트는 일별 그대로 유지하되
// 가로축 레이블만 "월이 바뀌는 첫 번째 인덱스"에만 월 표시
var _lastSeriesVals = null, _lastSeriesLabels = null;

function renderChart(vals, prevVals, labels, d) {
  _lastSeriesVals = vals; _lastSeriesLabels = labels;
  if(mc){ mc.destroy(); mc = null; }

  // MM/DD 형식이면 일별 데이터로 판단
  var isDaily = labels.length > 0 && /^\d{2}\/\d{2}$/.test(labels[0]);

  // 일별일 때: 월이 바뀌는 첫 포인트에만 "N월" 표시, 나머지 빈 문자열
  var monthLabels = null;
  if(isDaily) {
    var lastMM = '';
    monthLabels = labels.map(function(lbl) {
      var mm = lbl.substring(0, 2); // "04" 등
      if(mm !== lastMM) {
        lastMM = mm;
        return parseInt(mm, 10) + '월'; // "4월"
      }
      return '';
    });
  }

  setTimeout(function(){
    var ctx = document.getElementById('mc').getContext('2d');
    var ptR  = isDaily ? 0 : 3;
    var ptR2 = isDaily ? 0 : 2;

    var datasets = [{
      label:'금년', data:vals,
      borderColor:d.color, backgroundColor:d.color+'18',
      borderWidth:2, pointRadius:ptR, pointBackgroundColor:d.color,
      fill:true, tension:0.35
    }];
    if(prevVals && prevVals.length > 0) {
      datasets.push({
        label:'전년', data:prevVals,
        borderColor:d.color+'88', backgroundColor:'transparent',
        borderWidth:1.5, borderDash:[5,4],
        pointRadius:ptR2, pointBackgroundColor:d.color+'88',
        fill:false, tension:0.35
      });
    }

    mc = new Chart(ctx, {
      type:'line',
      data:{labels:labels, datasets:datasets},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{
          x:{
            grid:{color:'rgba(128,128,128,0.07)'},
            ticks:{
              font:{size:9}, maxRotation:0,
              autoSkip: false,
              // 일별: 월이 바뀌는 첫 포인트에만 "N월"
              // 월별: 1월 → 연도('YY년), 4·7·10월 → 월만, 나머지 숨김
              callback: isDaily
                ? function(value, index) { return monthLabels[index] || ''; }
                : function(value, index) {
                    var lbl = labels[index];
                    if (!lbl) return '';
                    // lbl 형식: "24.01" (YY.MM)
                    var dot = lbl.indexOf('.');
                    if (dot < 0) return lbl; // 분기 등 다른 형식은 그대로
                    var yy = lbl.substring(0, dot);
                    var mm = parseInt(lbl.substring(dot + 1), 10);
                    if (mm === 1)  return "'" + yy + '년';
                    if (mm === 4 || mm === 7 || mm === 10) return mm + '월';
                    return '';
                  }
            }
          },
          y:{grid:{color:'rgba(128,128,128,0.07)'}, ticks:{font:{size:9}}}
        }
      }
    });
  }, 10);
}


/* ═══════════════════════════════════════════
   JS § 9. 출처 메타 표시 헬퍼
   · setMetaSample(d): 빨간색 "샘플 데이터" 표시
   · setMetaLive(d, src): 실시간 ECOS/KOSIS 표시
   · setMetaLoading(): 로딩 중 표시
   ═══════════════════════════════════════════ */
function setMetaSample(d) {
  var el = document.getElementById('cmeta');
  el.textContent = d.meta + ' 〔샘플 데이터〕';
  el.className = 'chart-src is-sample';
}
function setMetaLive(d, src) {
  var el = document.getElementById('cmeta');
  el.textContent = d.meta + ' (실시간 ' + src + ')';
  el.className = 'chart-src';
}
function setMetaLoading() {
  var el = document.getElementById('cmeta');
  el.textContent = '🔄 실시간 데이터 불러오는 중...';
  el.className = 'chart-src';
}

/* JS § 9-1. 가계소득 원 단위 포맷 (fmtIncome) — fmtVal로 대체 가능, 하위호환용 */
function fmtIncome(val) {
  return Number(val).toLocaleString('ko-KR') + '원';
}

/* ═══════════════════════════════════════════
   JS § 10. KPI 패널 업데이트 (샘플 fallback)
   · API 실패 시 CD 객체의 cur/avg/yoy 값 표시
   ═══════════════════════════════════════════ */
function updateKPI(d) {
  // 샘플 데이터는 CD에 저장된 cur/avg/yoy 문자열 그대로 사용
  // (이미 포맷된 문자열이거나 계산된 값)
  document.getElementById('scur').textContent  = d.cur  || '-';
  document.getElementById('savg').textContent  = d.avg  || '-';
  document.getElementById('syoy').textContent  = d.yoy  || '-';
  var schg = document.getElementById('schg');
  schg.textContent = d.chg || '-';
  schg.className   = 'kc ' + (d.cc || 'neu');
  document.getElementById('snote').textContent  = d.note || '';
  document.getElementById('synote').textContent = d.yn   || '';
}
/* ===========================================
   JS § 13. ECOS 차트 로드 (loadEcosChart)
   · API 성공 → 실시간 데이터로 KPI + 차트 갱신
   · API 실패 → 샘플 데이터 fallback
   ═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   JS § 12-1. 전년 대비(YoY) 비교값 탐색 (findYoyRow)
   · 월별(YYYYMM)이든 일별(YYYYMMDD)이든 "ym" 문자열의 실제 날짜를 보고
     1년 전 시점(또는 그 직전 가장 가까운 영업일/월)의 값을 찾는다.
   · 배열 인덱스를 고정폭(-13)으로 거슬러 올라가는 방식은 일별 데이터에서
     "1년 전"이 아니라 "13거래일 전"이 되어버리는 오류가 있어 이 함수로 대체.
   ═══════════════════════════════════════════ */
function findYoyRow(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  var latestYm = rows[rows.length - 1].ym;
  if (!latestYm) return null;
  var isDaily = latestYm.length >= 8;

  var y  = parseInt(latestYm.slice(0, 4), 10) - 1;
  var targetYm = isDaily
    ? (String(y) + latestYm.slice(4, 8))   // YYYY(전년)MMDD
    : (String(y) + latestYm.slice(4, 6));  // YYYY(전년)MM

  // targetYm 이하(=1년 전 시점이거나 그 직전 가장 가까운 영업일/월)인 가장 최근 항목을 뒤에서부터 탐색
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i].ym <= targetYm) return rows[i];
  }
  return null;
}

async function loadEcosChart(key) {
  var d = CD[key]; if(!d) return;
  var _wrap = document.querySelector('.canvas-wrap');
  if(_wrap) _wrap.style.height = '150px';
  document.getElementById('ctitle').textContent = d.title;
  document.getElementById('cmeta').textContent  = '🔄 실시간 데이터 불러오는 중...';
  document.getElementById('scur').textContent   = '...';
  document.getElementById('savg').textContent   = '...';
  document.getElementById('syoy').textContent   = '...';

  // data.json에서 로드
  var jsonData = await loadDataJson();
  var rows = jsonData ? jsonData[key] : null;

  if(!rows||rows.length===0) {
    setMetaSample(d);
    updateKPI(d);
    renderChart(d.data||[], null, makeMonthLabels(), d);
    return;
  }

  var vals   = rows.map(function(r){return r.val;});
  var labels = makeLabels(rows);
  var latest = vals[vals.length-1];
  var avg6   = vals.slice(-6).reduce(function(a,b){return a+b;},0)/Math.min(6,vals.length);
  var diff   = latest - (vals[vals.length-2]||latest);

  // 전년 대비 KPI 계산 (차트 라인 별도 표시 안 함 — 2년 시계열에 이미 포함)
  var yoyRow  = findYoyRow(rows);
  var yoyDiff = yoyRow ? (latest - yoyRow.val) : null;

  document.getElementById('ctitle').textContent = d.title;
  setMetaLive(d, 'data.json');
  document.getElementById('scur').textContent   = fmtVal(latest, d.unit);
  document.getElementById('savg').textContent   = fmtVal(avg6, d.unit);
  document.getElementById('syoy').textContent   = yoyDiff !== null ? fmtVal(yoyDiff, d.unit, true) : '-';
  var schg = document.getElementById('schg');
  schg.textContent = fmtDiff(diff, d.unit);
  schg.className = 'kc ' + (diff>0?'up':diff<0?'down':'neu');
  document.getElementById('snote').textContent  = d.note;
  document.getElementById('synote').textContent = d.yn;

  renderChart(vals, null, labels, d);
}

/* ═══════════════════════════════════════════
   JS § 14. KOSIS 차트 로드 (loadKosisChart)
   · API 성공 → 실시간 데이터로 KPI + 차트 갱신
   · API 실패 → 샘플 데이터 fallback
   ═══════════════════════════════════════════ */
async function loadKosisChart(key) {
  var d = CD[key]; if(!d) return;
  var _wrap = document.querySelector('.canvas-wrap');
  if(_wrap) _wrap.style.height = '150px';
  document.getElementById('ctitle').textContent = d.title;
  document.getElementById('cmeta').textContent  = '🔄 실시간 데이터 불러오는 중...';
  document.getElementById('scur').textContent   = '...';
  document.getElementById('savg').textContent   = '...';
  document.getElementById('syoy').textContent   = '...';

  var jsonData = await loadDataJson();
  var rows = jsonData ? jsonData[key] : null;

  if(!rows||rows.length===0) {
    setMetaSample(d);
    updateKPI(d);
    renderChart(d.data||[], null, makeMonthLabels(), d);
    return;
  }

  var vals     = rows.map(function(r){return r.val;});
  var labels   = makeLabels(rows);
  var latest   = vals[vals.length-1];
  var avg6     = vals.slice(-6).reduce(function(a,b){return a+b;},0)/Math.min(6,vals.length);
  var diff     = latest - (vals[vals.length-2]||latest);
  var yoyRow   = findYoyRow(rows);
  var yoyDiff  = yoyRow ? (latest - yoyRow.val) : null;
  var prevVals = null;

  // online: 억원→조 변환 (소수점 1자리)
  var displayUnit = d.unit;
  var displayLatest = latest;
  var displayAvg = avg6;
  var displayYoy = yoyDiff;
  var displayDiff = diff;
  if(key === 'online') {
    displayLatest = latest / 1000000;
    displayAvg    = avg6   / 1000000;
    displayYoy    = yoyDiff !== null ? yoyDiff / 1000000 : null;
    displayDiff   = diff   / 1000000;
    // 조 단위는 소수점 1자리로 표시
    var fmtJo = function(v, isDiff) {
      if(v === null || isNaN(v)) return '-';
      var sign = isDiff ? (v > 0 ? '+' : '') : '';
      return sign + v.toLocaleString('ko-KR', {minimumFractionDigits:1, maximumFractionDigits:1}) + '조';
    };
    document.getElementById('ctitle').textContent = d.title;
    setMetaLive(d, 'data.json');
    document.getElementById('scur').textContent = fmtJo(displayLatest);
    document.getElementById('savg').textContent = fmtJo(displayAvg);
    document.getElementById('syoy').textContent = displayYoy !== null ? fmtJo(displayYoy, true) : '-';
    var schg = document.getElementById('schg');
    var sign2 = displayDiff > 0 ? '▲ +' : displayDiff < 0 ? '▼ ' : '= ';
    schg.textContent = sign2 + Math.abs(displayDiff).toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '조';
    schg.className = 'kc ' + (displayDiff>0?'up':displayDiff<0?'down':'neu');
    document.getElementById('snote').textContent  = d.note;
    document.getElementById('synote').textContent = d.yn;
    renderChart(vals, prevVals, labels, d);
    return;
  }

  document.getElementById('ctitle').textContent = d.title;
  setMetaLive(d, 'data.json');
  document.getElementById('scur').textContent   = fmtVal(displayLatest, displayUnit);
  document.getElementById('savg').textContent   = fmtVal(displayAvg, displayUnit);
  document.getElementById('syoy').textContent   = yoyDiff !== null ? fmtVal(yoyDiff, displayUnit, true) : '-';
  var schg = document.getElementById('schg');
  schg.textContent = fmtDiff(diff, displayUnit);
  schg.className = 'kc ' + (diff>0?'up':diff<0?'down':'neu');
  document.getElementById('snote').textContent  = d.note;
  document.getElementById('synote').textContent = d.yn;

  renderChart(vals, prevVals, labels, d);
}
/* ===========================================
   JS § 15. 카테고리 토글 (toggleCat)
   · 카테고리 버튼 클릭 → 해당 서브패널 열림
   ═══════════════════════════════════════════ */
function toggleCat(btn, grpId) {
  var isOpen = btn.classList.contains('open');
  document.querySelectorAll('.cat-col-btn').forEach(function(b){ b.classList.remove('open'); });
  document.querySelectorAll('.sub-panel').forEach(function(s){ s.classList.remove('open'); });
  if(!isOpen) {
    btn.classList.add('open');
    var grp = document.getElementById(grpId);
    if(grp) grp.classList.add('open');

    /* 하위 첫 번째 버튼 자동 활성화 */
    var firstSubBtn = grp && grp.querySelector('.sub-btn');
    if(firstSubBtn) firstSubBtn.click();
  }
}

/* ═══════════════════════════════════════════
   JS § 16. 지표 선택 (selChart)
   · 버튼 클릭 → ECOS/KOSIS/샘플 분기 처리
   · AI 해석 초기화
   ═══════════════════════════════════════════ */
function selChart(key, btn, grpId) {
  // onload 전에 호출되는 경우의 안전망
  selChartWithAPI(key, btn, grpId);
}

async function selChartWithAPI(key, btn, grpId) {
  curKey = key;
  document.querySelectorAll('.sub-btn').forEach(function(b){ b.classList.remove('on'); });
  btn.classList.add('on');

  // 유통채널 품목별 필터 버튼: 다른 지표로 이동 시 항상 초기화 (loadRetailItemChart에서 다시 채움)
  var _rif = document.getElementById('retail-item-filters');
  if(_rif) { _rif.style.display = 'none'; _rif.innerHTML = ''; }
  document.querySelectorAll('.sub-panel').forEach(function(s){ s.classList.remove('open'); });
  document.querySelectorAll('.cat-col-btn').forEach(function(b){ b.classList.remove('open'); });
  var grp = document.getElementById(grpId);
  if(grp) grp.classList.add('open');
var grpToBtnIdx = {'grp1':0,'grp3':1,'grp4':2,'grp7':3,'grp5':4};
var idx = grpToBtnIdx[grpId];
var catBtns = document.querySelectorAll('.cat-col-btn');
if(idx !== undefined && catBtns[idx]) catBtns[idx].classList.add('open');



  // ★ 지수 설명 표시 (indexNote가 있는 지표만)
  var noteEl = document.getElementById('index-note');
  var d0 = CD[key];
  if(noteEl) {
    if(d0 && d0.indexNote) {
      noteEl.textContent = '💡 ' + d0.indexNote;
      noteEl.classList.add('show');
    } else {
      noteEl.textContent = '';
      noteEl.classList.remove('show');
    }
  }

  var d = CD[key]; if(!d) return;

  if(ECOS_MAP[key]) {
    await loadEcosChart(key);
  } else if(key==='dept'||key==='mart'||key==='convenience') {
    await loadRetailItemChart(key);
  } else if(KOSIS_MAP[key]) {
    await loadKosisChart(key);
  } else {
    document.getElementById('ctitle').textContent = d.title;
    document.getElementById('cmeta').textContent  = d.meta+' (샘플 데이터)';
    updateKPI(d);
    renderChart(d.data||[], null, makeMonthLabels(), d);
  }

  // KPI·차트 데이터가 다 반영된 뒤에 실행 → AI 해석이 최신값을 정확히 참조
  if(typeof resetIndicatorAI === 'function') resetIndicatorAI(key, d);
}

/* ═══════════════════════════════════════════
   JS § 17. 유통채널 품목별 멀티라인 차트
   · loadRetailItemChart(key): 합계 KPI + 품목별 라인
   · renderRetailItemsChart(): 멀티 데이터셋 Chart.js
   ═══════════════════════════════════════════ */
var RETAIL_PALETTE = [
  '#185FA5','#1D9E75','#D85A30','#7B5EA7','#E6A817',
  '#2E86AB','#A23B72','#F18F01','#4B8B3B','#C0392B'
];

function renderRetailItemsChart(itemsObj, ymList, labels, d) {
  if(mc){ mc.destroy(); mc = null; }
  var itemNames = Object.keys(itemsObj);
  var datasets = itemNames.map(function(nm, idx) {
    var valMap = {};
    itemsObj[nm].forEach(function(r){ valMap[r.ym] = r.val; });
    var vals = ymList.map(function(ym){
      return valMap[ym] !== undefined ? valMap[ym] : null;
    });
    var color = RETAIL_PALETTE[idx % RETAIL_PALETTE.length];
    return {
      label: nm,
      data: vals,
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 1.5,
      pointHoverRadius: 4,
      fill: false,
      tension: 0.35,
      spanGaps: true
    };
  });

  setTimeout(function(){
    var ctx = document.getElementById('mc').getContext('2d');
    mc = new Chart(ctx, {
      type: 'line',
      data: {labels: labels, datasets: datasets},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: {font:{size:8}, boxWidth:10, padding:5, usePointStyle:true}
          },
          tooltip: {mode:'index', intersect:false}
        },
        scales: {
          x: {
            grid: {color:'rgba(128,128,128,0.07)'},
            ticks: {
              font:{size:9}, maxRotation:0, autoSkip:false,
              callback: function(value, index) {
                var lbl = labels[index]; if(!lbl) return '';
                var dot = lbl.indexOf('.'); if(dot<0) return lbl;
                var yy = lbl.substring(0,dot);
                var mm = parseInt(lbl.substring(dot+1), 10);
                if(mm===1)  return "'"+yy+'년';
                if(mm===4||mm===7||mm===10) return mm+'월';
                return '';
              }
            }
          },
          y: {
            grid: {color:'rgba(128,128,128,0.07)'},
            ticks: {font:{size:9}},
            title: {display:true, text:'전년동월비 (%)', font:{size:8}, color:'var(--text3)'}
          }
        }
      }
    });
  }, 10);
}

async function loadRetailItemChart(key) {
  var d = CD[key]; if(!d) return;
  // legend 공간 확보
  var _wrap = document.querySelector('.canvas-wrap');
  if(_wrap) _wrap.style.height = '182px';
  document.getElementById('ctitle').textContent = d.title;
  document.getElementById('cmeta').textContent  = '🔄 실시간 데이터 불러오는 중...';
  document.getElementById('scur').textContent   = '...';
  document.getElementById('savg').textContent   = '...';
  document.getElementById('syoy').textContent   = '...';

  var jsonData  = await loadDataJson();
  var totalRows = jsonData ? jsonData[key]           : null;  // 합계 시계열
  var itemsObj  = jsonData ? jsonData[key+'_items']  : null;  // 품목별 dict

  // 실제 데이터 없으면 샘플 폴백
  if(!totalRows || totalRows.length === 0) {
    setMetaSample(d);
    updateKPI(d);
    renderChart(d.data||[], null, makeMonthLabels(), d);
    return;
  }

  // KPI는 합계(totalRows) 기준
  var vals    = totalRows.map(function(r){return r.val;});
  var ymList  = totalRows.map(function(r){return r.ym;});
  var labels  = makeLabels(totalRows);
  var latest  = vals[vals.length-1];
  var avg6    = vals.slice(-6).reduce(function(a,b){return a+b;},0)/Math.min(6,vals.length);
  var yoyRow  = findYoyRow(totalRows);
  var yoyDiff = yoyRow ? (latest - yoyRow.val) : null;
  var diff    = latest - (vals[vals.length-2]||latest);

  setMetaLive(d, 'data.json');
  document.getElementById('ctitle').textContent = d.title;
  document.getElementById('scur').textContent   = fmtVal(latest, d.unit);
  document.getElementById('savg').textContent   = fmtVal(avg6, d.unit);
  document.getElementById('syoy').textContent   = yoyDiff!==null ? fmtVal(yoyDiff, d.unit, true) : '-';
  var schg = document.getElementById('schg');
  schg.textContent = fmtDiff(diff, d.unit);
  schg.className   = 'kc '+(diff>0?'up':diff<0?'down':'neu');
  document.getElementById('snote').textContent  = d.note;
  document.getElementById('synote').textContent = d.yn;

  if(itemsObj && Object.keys(itemsObj).length > 0) {
    renderRetailItemFilters(itemsObj, ymList, labels, d, vals);
    renderChart(vals, null, labels, d);   // 기본값: 전체 합계 추이만 표시
  } else {
    // 품목 데이터 없으면 합계 단일 라인
    var _rif0 = document.getElementById('retail-item-filters');
    if(_rif0) { _rif0.style.display = 'none'; _rif0.innerHTML = ''; }
    renderChart(vals, null, labels, d);
  }
}

/* ═══════════════════════════════════════════
   JS § 18. 유통채널 품목별 필터 버튼
   · renderRetailItemFilters(): "전체" + 품목별 버튼 렌더링
   · selRetailItem(): 버튼 클릭 시 전체(합계)/단일 품목 전환
   ═══════════════════════════════════════════ */
var _rItemsObj = null, _rYmList = null, _rLabels = null, _rD = null, _rVals = null;

function renderRetailItemFilters(itemsObj, ymList, labels, d, vals) {
  var container = document.getElementById('retail-item-filters');
  if(!container) return;
  _rItemsObj = itemsObj; _rYmList = ymList; _rLabels = labels; _rD = d; _rVals = vals;

  var itemNames = Object.keys(itemsObj);
  var html = '<button class="ritem-btn on" onclick="selRetailItem(\'__all__\',this)">전체</button>';
  itemNames.forEach(function(nm) {
    var safe = nm.replace(/'/g, "\\'");
    html += '<button class="ritem-btn" onclick="selRetailItem(\'' + safe + '\',this)">' + nm + '</button>';
  });
  container.innerHTML = html;
  container.style.display = itemNames.length > 0 ? 'flex' : 'none';
}

function selRetailItem(name, btn) {
  document.querySelectorAll('.ritem-btn').forEach(function(b){ b.classList.remove('on'); });
  btn.classList.add('on');
  if(!_rItemsObj) return;
  if(name === '__all__') {
    renderChart(_rVals, null, _rLabels, _rD);   // 전체 = 합계 추이 단일 라인
  } else {
    var single = {};
    single[name] = _rItemsObj[name];
    renderRetailItemsChart(single, _rYmList, _rLabels, _rD);
  }
}
