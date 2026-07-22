/* ===========================================
   JS § 19. 기사 필터 (fnews)
   · data-cat 속성 기준으로 기사 필터링
   ═══════════════════════════════════════════ */
function fnews(cat, btn) {
  document.querySelectorAll('.kwbtn').forEach(function(b){ b.classList.remove('on'); });
  btn.classList.add('on');
  var hidden = document.getElementById('nwrap-hidden');
  if (hidden) hidden.style.display = '';
  document.querySelectorAll('.news-item').forEach(function(item){
    item.style.display = (cat==='all' || item.dataset.cat===cat) ? '' : 'none';
  });
}

/* ═══════════════════════════════════════════
   JS § 20. 연구기관 보고서 — reports.json 동적 렌더링
   · loadReports(): GitHub raw에서 fetch → 4개 기관 렌더
   · renderReportList(org, items): 뉴스 카드 삽입
   ═══════════════════════════════════════════ */
var REPORTS_URL = './reports.json';

async function loadReports() {
  try {
    var res = await fetch(REPORTS_URL + '?_=' + Date.now());
    if (!res.ok) throw new Error('fetch fail');
    var data = await res.json();
    if (data.updated) {
      var el = document.getElementById('rpt-updated');
      if (el) el.textContent = '업데이트 ' + data.updated;
    }
    ['hri','kdi','bok','kiep','kif'].forEach(function(org) {
      renderReportList(org, data[org] || []);
    });
  } catch(e) {
    ['hri','kdi','bok','kiep','kif'].forEach(function(org) {
      var el = document.getElementById('rpt-' + org + '-list');
      if (el) el.innerHTML = '<div class="rpt-empty" style="color:#E24B4A">데이터를 불러오지 못했습니다.</div>';
    });
  }
}

function renderReportList(org, items) {
  var list = document.getElementById('rpt-' + org + '-list');
  if (!list) return;
  if (!items || items.length === 0) {
    list.innerHTML = '<div class="rpt-empty">등록된 항목이 없습니다.</div>';
    return;
  }
  var months = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  var LIMIT = 5;

  function makeCard(item) {
    var dateStr = (item.date || '').replace(/^\w+,\s*(\d+)\s+(\w+)\s+(\d+)$/, function(_, dd, mm, yyyy) {
      return yyyy + '.' + (months[mm] || mm) + '.' + (dd.length === 1 ? '0'+dd : dd);
    });
    return '<div class="rpt-item">'
      + '<div class="rpt-date">' + dateStr + '</div>'
      + '<div class="rpt-body">'
      + '<div class="rpt-title"><a href="' + (item.url||'#') + '" target="_blank" rel="noopener">' + (item.title||'(제목 없음)') + '</a></div>'
      + (item.source ? '<div class="rpt-meta"><span class="rpt-src">' + item.source + '</span></div>' : '')
      + '</div></div>';
  }

  var visible = items.slice(0, LIMIT);
  var hidden  = items.slice(LIMIT);

  var html = visible.map(makeCard).join('');

  if (hidden.length > 0) {
    html += '<div class="rpt-hidden-items" style="display:none">' + hidden.map(makeCard).join('') + '</div>';
    html += '<button class="show-more-btn" onclick="toggleMore(this, \'rpt-' + org + '-list\')">▼ 더보기 (' + hidden.length + '개)</button>';
  }

  list.innerHTML = html;
}

/* ═══════════════════════════════════════════
   JS § 21. 페이지 초기화 (window.onload)
   · 기본 지표(csi) 로드
   · 리사이저 드래그 이벤트 등록
   ═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   JS § 21. 더보기 버튼 공통 함수
   · toggleMore: 숨겨진 항목 토글
   · loadNews: news.json fetch → 동적 렌더링
   · initNewsShowMore: 더보기 버튼 초기화
   ═══════════════════════════════════════════ */
function toggleMore(btn, listId) {
  var hidden = btn.previousElementSibling;
  if (!hidden || !hidden.classList.contains('rpt-hidden-items')) {
    hidden = document.getElementById(listId + '-hidden');
  }
  if (!hidden) return;
  var isOpen = hidden.style.display !== 'none';
  hidden.style.display = isOpen ? 'none' : '';
  var count = hidden.querySelectorAll('.news-item, .rpt-item').length;
  btn.textContent = isOpen ? '▼ 더보기 (' + count + '개)' : '▲ 접기';
}

var NEWS_URL = './news.json';

/* news.json → 카테고리별 매핑 후 nwrap에 렌더링 */
async function loadNews() {
  var wrap = document.getElementById('nwrap');
  try {
    var res = await fetch(NEWS_URL + '?_=' + Date.now());
    if (!res.ok) throw new Error('fetch fail');
    var data = await res.json();

    // 섹션3 업데이트 시점 표시
    if (data.updated) {
      var elNews = document.getElementById('news-updated');
      if (elNews) elNews.textContent = '업데이트 ' + data.updated;
    }

    // news.json 키 → 화면 카테고리 매핑
    var CAT_MAP = [
      { cat:'store',   label:'백화점·유통', color:'#185FA5', kwCls:'nkw-store',   keys:['dept'] },
      { cat:'consume', label:'소비 트렌드', color:'#639922', kwCls:'nkw-consume', keys:['trend'] },
      { cat:'fx',      label:'환율·관광',   color:'#BA7517', kwCls:'nkw-fx',      keys:['rate'] },
      { cat:'rate',    label:'금리·경기',   color:'#534AB7', kwCls:'nkw-rate',    keys:['asset'] },
    ];

    var allItems = [];
    var usedUrls = new Set(); // 중복 기사 제거용

    CAT_MAP.forEach(function(catDef) {
      var items = [];
      catDef.keys.forEach(function(key) {
        (data[key] || []).forEach(function(article) {
          if (!usedUrls.has(article.url)) {
            usedUrls.add(article.url);
            items.push(article);
          }
        });
      });
      // 날짜 최신순 정렬
      items.sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
      });
      items.slice(0, 10).forEach(function(article) {
        allItems.push({ catDef: catDef, article: article });
      });
    });

    if (allItems.length === 0) throw new Error('no items');

    var LIMIT = 5;
    var html = '';
    allItems.forEach(function(row, idx) {
      var c = row.catDef;
      var a = row.article;
      // pubDate 포맷 변환: "Fri, 08 May 2026 10:00:00" → "2026.05.08"
      var months = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
      var dateStr = (a.date || '').replace(/^\w+,\s*(\d+)\s+(\w+)\s+(\d+).*$/, function(_, dd, mm, yyyy) {
        return yyyy + '.' + (months[mm] || mm) + '.' + (dd.length === 1 ? '0'+dd : dd);
      });
      if (idx === LIMIT) html += '<div id="nwrap-hidden" style="display:none">';
      html += '<div class="news-item" data-cat="' + c.cat + '">'
        + '<div class="ndot" style="background:' + c.color + '"></div>'
        + '<div class="news-item-body">'
        + '<div class="nkw ' + c.kwCls + '">' + c.label + '</div>'
        + '<div class="nh">' + (a.title || '') + '</div>'
        + '<div class="nd">' + dateStr + ' · ' + (a.source || '') + '</div>'
        + (a.url ? '<a class="news-link" href="' + a.url + '" target="_blank" rel="noopener">기사 원문 보기 ↗</a>' : '')
        + '</div></div>';
    });
    if (allItems.length > LIMIT) html += '</div>';

    wrap.innerHTML = html;

    // 더보기 버튼 추가
    if (allItems.length > LIMIT) {
      var btn = document.createElement('button');
      btn.className = 'show-more-btn';
      btn.textContent = '▼ 더보기 (' + (allItems.length - LIMIT) + '개)';
      btn.onclick = function() {
        var h = document.getElementById('nwrap-hidden');
        var isOpen = h.style.display !== 'none';
        h.style.display = isOpen ? 'none' : '';
        btn.textContent = isOpen ? '▼ 더보기 (' + (allItems.length - LIMIT) + '개)' : '▲ 접기';
      };
      wrap.parentNode.insertBefore(btn, wrap.nextSibling);
    }

    // 현재 필터 유지
    var activeBtn = document.querySelector('.kwbtn.on');
    if (activeBtn) fnews(activeBtn.dataset.cat || 'all', activeBtn);

  } catch(e) {
    wrap.innerHTML = '<div style="padding:1.2rem;text-align:center;font-size:12px;color:#E24B4A">기사를 불러오지 못했습니다.</div>';
    console.warn('news.json load error:', e);
  }
}

function initNewsShowMore() {
  // loadNews()로 대체됨 — 하위호환용 빈 함수
}
/* ===========================================
   JS § 관광 방문자 섹션 (Tourism Visitor)
   ═══════════════════════════════════════════ */
var _tourData = null;
var tourIdx = 11;
var tourSelectedCity = null;
var tourChartInst = null;

var TOUR_CITIES = ['서울','부산','대구','인천','광주','대전','울산'];
var TOUR_COLORS = ['#378ADD','#D85A30','#7F77DD','#1D9E75','#D4537E','#BA7517','#0F6E56'];

function tourMonthStr(ym) {
  // ym: '202504' → '2025년 04월'
  return ym.slice(0,4) + '년 ' + ym.slice(4,6) + '월';
}

function tourYoyPct(cur, prev) {
  if (!prev) return 0;
  return Math.round((cur - prev) / prev * 1000) / 10;
}

function tourInit() {
  loadDataJson().then(function(d) {
    var sec = document.getElementById('tour-section');
    if (!d || !d.tourism || !Object.keys(d.tourism).length) {
      if (sec) sec.style.display = 'none';
      return;
    }
    if (sec) sec.style.display = '';
    _tourData = d.tourism;

    // 슬라이더 범위 설정: data.json의 실제 ym 목록 기준
    var yms = Object.keys(_tourData).sort();
    if (!yms.length) return;

    // 말일까지 데이터가 완전한 달만 필터링
yms = yms.filter(function(ym) {
  var lastDay = new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6)), 0).getDate();
  var cities = _tourData[ym] ? Object.keys(_tourData[ym]) : [];
  if (!cities.length) return false;
  var minDays = Math.min.apply(null, cities.map(function(city) {
    return _tourData[ym][city] && _tourData[ym][city].daily ? Object.keys(_tourData[ym][city].daily).length : 0;
  }));
  return minDays >= lastDay;
});
if (!yms.length) return;

var slider = document.getElementById('tour-slider');
slider.min = 0;
slider.max = yms.length - 1;
slider.value = yms.length - 1;
tourIdx = yms.length - 1;

    slider.addEventListener('input', function() {
      tourIdx = +this.value;
      var ym = yms[tourIdx];
      document.getElementById('tour-sl-label').textContent = tourMonthStr(ym);
      tourRenderCards(yms);
    });

    document.getElementById('tour-sl-label').textContent = tourMonthStr(yms[tourIdx]);
    tourRenderCards(yms);
  });
}

function tourRenderCards(yms) {
  if (!yms) {
    yms = _tourData ? Object.keys(_tourData).sort() : [];
  }
  var ym   = yms[tourIdx];
  var lyYm = (parseInt(ym.slice(0,4)) - 1) + ym.slice(4);
  var cur  = (_tourData && _tourData[ym])   || {};
  var prev = (_tourData && _tourData[lyYm]) || {};

  var grid = document.getElementById('tour-city-grid');
  if (!grid) return;
  grid.innerHTML = '';

  var today = new Date();
  var isCurrentMonth = (ym === today.getFullYear().toString() + (today.getMonth()<9?'0':'')+(today.getMonth()+1).toString());
  var lastDay = new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6)), 0).getDate();

  var totCur = 0, totPrev = 0;
  TOUR_CITIES.forEach(function(city, i) {
    var curDays = cur[city] && cur[city].daily ? Object.keys(cur[city].daily).length : 0;
    var monthComplete = curDays >= lastDay;
    var cVal = (cur[city] && monthComplete) ? Math.round(cur[city].total / 10000) : null;
    var pVal = prev[city] ? Math.round(prev[city].total / 10000) : null;
    if (cVal !== null) totCur  += cVal;
    if (pVal !== null) totPrev += pVal;

    var pct = (cVal !== null && pVal !== null) ? tourYoyPct(cVal, pVal) : null;
    var col = pct === null ? 'var(--text2)' : pct > 0 ? '#A32D2D' : pct < 0 ? '#185FA5' : 'var(--text2)';
    var yoyTxt = pct === null ? '전년 데이터 없음' : (pct > 0 ? '▲ +' : '▼ ') + Math.abs(pct) + '%';

    var card = document.createElement('div');
    card.style.cssText = 'background:var(--bg);border:.5px solid var(--border);border-radius:7px;padding:9px 11px;cursor:pointer;transition:border-color .15s' + (tourSelectedCity === city ? ';border:1.5px solid #378ADD;background:#E6F1FB' : '');
    card.innerHTML =
      '<div style="font-size:10px;color:' + (tourSelectedCity === city ? '#0C447C' : 'var(--text2)') + ';font-weight:500;margin-bottom:3px">' + city + '</div>' +
      '<div style="font-size:17px;font-weight:600;color:var(--text);line-height:1.2">' + (cVal !== null ? cVal : '—') + '<span style="font-size:10px;color:var(--text2);font-weight:400">만명</span></div>' +
      '<div style="font-size:10px;margin-top:3px;font-weight:500;color:' + col + '">' + yoyTxt + '</div>' +
      '<div style="font-size:9px;color:var(--text2);margin-top:1px">전년 동월 ' + (pVal !== null ? pVal : '—') + '만명</div>';

    card.onclick = (function(c) { return function() {
      tourSelectedCity = (tourSelectedCity === c) ? null : c;
      tourRenderCards(yms);
      if (tourSelectedCity) tourSetView('chart', document.getElementById('tour-tab-chart'));
    }; })(city);
    grid.appendChild(card);
  });

  var avgPct = (totCur && totPrev) ? tourYoyPct(totCur, totPrev) : null;
  var badge = document.getElementById('tour-avg-badge');
  if (badge) {
    badge.textContent = avgPct !== null ? '전체 평균 전년比 ' + (avgPct > 0 ? '+' : '') + avgPct + '%' : '—';
    badge.style.background = avgPct > 0 ? '#FCEBEB' : avgPct < 0 ? '#E6F1FB' : 'var(--bg2)';
    badge.style.color = avgPct > 0 ? '#791F1F' : avgPct < 0 ? '#042C53' : 'var(--text2)';
  }
}

function tourUpdateChart() {
  var canvas = document.getElementById('tour-chart');
  if (!canvas || !_tourData) return;
  if (tourChartInst) { tourChartInst.destroy(); tourChartInst = null; }

  var yms = Object.keys(_tourData).sort();
  var labels = yms.map(tourMonthStr);
  var cities = tourSelectedCity ? [tourSelectedCity] : TOUR_CITIES;

  var datasets = cities.map(function(city, i) {
    var ci = tourSelectedCity ? 0 : i;
    return {
      label: city,
      data: yms.map(function(ym) {
        return (_tourData[ym] && _tourData[ym][city]) ? Math.round(_tourData[ym][city].total / 10000) : null;
      }),
      borderColor: TOUR_COLORS[ci],
      backgroundColor: TOUR_COLORS[ci] + '22',
      borderWidth: 2,
      pointRadius: 2,
      tension: .3,
      spanGaps: true,
    };
  });

  tourChartInst = new Chart(canvas, {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, maxTicksLimit: 13 } },
        y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 9 }, callback: function(v) { return v + '만'; } } }
      }
    }
  });

  var leg = document.getElementById('tour-chart-legend');
  if (leg) {
    leg.innerHTML = cities.map(function(city, i) {
      var ci = tourSelectedCity ? 0 : i;
      return '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)">'
        + '<div style="width:7px;height:7px;border-radius:50%;background:' + TOUR_COLORS[ci] + '"></div>' + city + '</div>';
    }).join('');
  }
  document.getElementById('tour-chart-title').textContent = tourSelectedCity ? tourSelectedCity + ' 월별 추이' : '전체 도시 추이';
}

function tourSetView(v, btn) {
  document.querySelectorAll('#tour-section .wx-rtab').forEach(function(b) { b.classList.remove('on'); });
  if (btn) btn.classList.add('on');
  var cardView  = document.getElementById('tour-card-view');
  var chartView = document.getElementById('tour-chart-view');
  if (cardView)  cardView.style.display  = v === 'card'  ? '' : 'none';
  if (chartView) chartView.style.display = v === 'chart' ? '' : 'none';
  if (v === 'chart') setTimeout(tourUpdateChart, 50);
}
/* ===========================================
   JS § 날씨 달력 (Weather Calendar)
   ═══════════════════════════════════════════ */
var _wxData = null;   // data.json weather 캐시
var _holData = null;  // data.json holidays 캐시
var wxRegion = 'seoul';
var wxY, wxM;

(function() {
  var now = new Date();
  wxY = now.getFullYear();
  wxM = now.getMonth(); // 0-based
})();

function wxInit() {
  loadDataJson().then(function(d) {
    if (!d) return;
    _wxData = d.weather || {};
    _holData = d.holidays || {};
    wxRender();
  });
}

function wxSelRegion(btn) {
  document.querySelectorAll('.wx-rtab').forEach(function(b){ b.classList.remove('on'); });
  btn.classList.add('on');
  wxRegion = btn.dataset.region;
  wxRender();
}

function wxMove(dir) {
  wxM += dir;
  if (wxM > 11) { wxM = 0; wxY++; }
  if (wxM < 0)  { wxM = 11; wxY--; }
  wxRender();
}

function wxMonthStr(y, m) { return y + '년 ' + (m + 1) + '월'; }
function wxYm(y, m) { return '' + y + String(m + 1).padStart(2,'0'); }
function wxDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function wxFirstDow(y, m) { return new Date(y, m, 1).getDay(); }

function wxGetHoliday(y, m, d) {
  if (!_holData) return null;
  var yearKey = String(y);
  var ymdKey = '' + y + String(m + 1).padStart(2,'0') + String(d).padStart(2,'0');
  var yObj = _holData[yearKey];
  return yObj ? (yObj[ymdKey] || null) : null;
}

function wxBuildGrid(gridEl, region, y, m, isCur) {
  gridEl.innerHTML = '';
  var days = wxDaysInMonth(y, m);
  var start = wxFirstDow(y, m);
  var now = new Date();
  var todayD = (isCur && y === now.getFullYear() && m === now.getMonth()) ? now.getDate() : -1;
  // 당월이면 data.json에 실제 있는 마지막 날까지만 표시 (API 수집 기준)
  var ym = wxYm(y, m);
  var regionData = (_wxData && _wxData[region]) ? _wxData[region][ym] : null;
  var lastData;
  if (isCur && regionData && regionData.days && regionData.days.length) {
    lastData = regionData.days[regionData.days.length - 1].d;
  } else if (isCur) {
    lastData = now.getDate() - 1;
  } else {
    lastData = days;
  }

  for (var i = 0; i < start; i++) {
    var e = document.createElement('div');
    e.className = 'wx-cell empty';
    gridEl.appendChild(e);
  }
  for (var d = 1; d <= days; d++) {
    var dow = (start + d - 1) % 7;
    var holName = wxGetHoliday(y, m, d);
    var cell = document.createElement('div');
    var cls = 'wx-cell';
    if (dow === 0) cls += ' sun';
    if (dow === 6) cls += ' sat';
    if (d === todayD) cls += ' today';
    var isCurrentMonth = (y === now.getFullYear() && m === now.getMonth());
    if (isCurrentMonth && d > now.getDate()) cls += ' future';
    if (holName && !(isCurrentMonth && d > now.getDate())) cls += ' holiday';
    cell.className = cls;

    var numEl = document.createElement('div');
    numEl.className = 'wx-dnum';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (holName) {
      var hn = document.createElement('div');
      hn.className = 'wx-hname';
      hn.textContent = holName;
      cell.appendChild(hn);
    }

    var hasData = !isCur || d <= lastData;
    var isFuture = isCurrentMonth && d > now.getDate();
    if (hasData && regionData && !isFuture) {
      var dayObj = null;
      for (var k = 0; k < regionData.days.length; k++) {
        if (regionData.days[k].d === d) { dayObj = regionData.days[k]; break; }
      }
      if (dayObj) {
        if (dayObj.temp !== null && dayObj.temp !== undefined) {
          var tv = document.createElement('div');
          tv.className = 'wx-temp';
          tv.textContent = dayObj.temp + '°';
          cell.appendChild(tv);
        }
        if (dayObj.rain > 0) {
          var rv = document.createElement('div');
          rv.className = 'wx-rain';
          rv.textContent = dayObj.rain + 'mm';
          cell.appendChild(rv);
        }
      }
    } else if (!hasData) {
      var nd = document.createElement('div');
      nd.className = 'wx-nd';
      nd.textContent = '—';
      cell.appendChild(nd);
    }
    gridEl.appendChild(cell);
  }

}

function wxBuildDowIdx(curY, curM) {
  var lyY = curY - 1, lyM = curM;
  var DOW_NAMES = ['일','월','화','수','목','금','토'];
  var body = document.getElementById('wx-di-body');
  if (!body) return;
  body.innerHTML = '';

  var curLastDay = wxDaysInMonth(curY, curM);
  var lyLastDay  = wxDaysInMonth(lyY, lyM);

  function countDow(y, m, lastDay) {
    var dc = [0,0,0,0,0,0,0]; var hc = 0; var hlist = [];
    for (var d = 1; d <= lastDay; d++) {
      var dow = new Date(y, m, d).getDay();
      var hol = wxGetHoliday(y, m, d);
      if (hol && dow !== 0 && dow !== 6) { hc++; hlist.push(hol); }
      else dc[dow]++;
    }
    return { dc: dc, hc: hc, hlist: hlist };
  }

  var cur = countDow(curY, curM, curLastDay);
  var ly  = countDow(lyY, lyM, lyLastDay);

  document.getElementById('wx-di-month').textContent =
    '— ' + wxMonthStr(curY, curM) + ' vs ' + wxMonthStr(lyY, lyM);

  var todayDow = new Date().getDay();
  var grid = document.createElement('div');
  grid.className = 'wx-di-grid';

  // 월~일 순 (1~6, 0)
  [1,2,3,4,5,6,0].forEach(function(i) {
    var diff = cur.dc[i] - ly.dc[i];
    var chip = document.createElement('div');
    chip.className = 'wx-di-chip' + (i === todayDow ? ' today-dow' : '');
    var lbl = document.createElement('div');
    lbl.className = 'wx-di-chip-lbl';
    lbl.textContent = DOW_NAMES[i] + '요일';
    var val = document.createElement('div');
    val.className = 'wx-di-chip-val ' + (diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'zero');
    val.textContent = (diff > 0 ? '+' : '') + diff + '일';
    chip.appendChild(lbl); chip.appendChild(val);
    grid.appendChild(chip);
  });

  // 공휴일 칩
  var holDiff = cur.hc - ly.hc;
  var holChip = document.createElement('div');
  holChip.className = 'wx-di-chip hol-chip';
  var holLbl = document.createElement('div');
  holLbl.className = 'wx-di-chip-lbl';
  holLbl.textContent = '공휴일';
  var holVal = document.createElement('div');
  holVal.className = 'wx-di-chip-val ' + (holDiff > 0 ? 'pos' : holDiff < 0 ? 'neg' : 'zero');
  holVal.textContent = (holDiff > 0 ? '+' : '') + holDiff + '일';
  holChip.appendChild(holLbl); holChip.appendChild(holVal);
  grid.appendChild(holChip);

  body.appendChild(grid);

  var holDetail = document.createElement('div');
  holDetail.className = 'wx-di-hol-detail';
  holDetail.textContent =
    '금년: ' + (cur.hlist.length ? cur.hlist.join('·') : '없음') +
    ' / 전년: ' + (ly.hlist.length ? ly.hlist.join('·') : '없음');
  body.appendChild(holDetail);
}

function wxRender() {
  var now = new Date();
  var lyY = wxY - 1, lyM = wxM;
  var ym    = wxYm(wxY, wxM);
  var lyYm  = wxYm(lyY, lyM);

  document.getElementById('wx-nav-label').innerHTML =
    wxMonthStr(wxY, wxM) + '<span class="wx-nav-sub">/ ' + wxMonthStr(lyY, lyM) + '</span>';
  document.getElementById('wx-cur-lbl').textContent  = wxMonthStr(wxY, wxM);
  document.getElementById('wx-prev-lbl').textContent = wxMonthStr(lyY, lyM);

  var futureLimit = new Date(now.getFullYear(), now.getMonth() + 3, 1);
var atMax = (wxY > futureLimit.getFullYear()) || 
            (wxY === futureLimit.getFullYear() && wxM >= futureLimit.getMonth());
  document.getElementById('wx-next').disabled = atMax;

  wxBuildGrid(document.getElementById('wx-grid-cur'),  wxRegion, wxY,  wxM,  true);
  wxBuildGrid(document.getElementById('wx-grid-prev'), wxRegion, lyY, lyM, false);

  // 요약 카드
  var rd = _wxData && _wxData[wxRegion];
  var curMon = rd ? rd[ym]   : null;
  var lyMon  = rd ? rd[lyYm] : null;

  function setVal(id, v, unit) {
    var el = document.getElementById(id);
    if (el) el.textContent = (v !== null && v !== undefined) ? v + unit : '—';
  }
  function setDiff(diffId, cur, prev, unit) {
    var de = document.getElementById(diffId);
    if (!de) return;
    if (cur === null || prev === null || cur === undefined || prev === undefined) { de.textContent = '—'; return; }
    var d = Math.round((cur - prev) * 10) / 10;
    de.textContent = (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= ') + Math.abs(d) + unit;
    de.style.color = unit === 'mm' ? (d < 0 ? '#1659A8' : '#A32D2D') : (d > 0 ? '#A32D2D' : '#1659A8');
  }

  var curTemp  = curMon ? curMon.avg_temp : null;
  var lyTemp   = lyMon  ? lyMon.avg_temp  : null;
  var curRainAvg = (curMon && curMon.total_rain != null && curMon.days && curMon.days.length)
    ? Math.round(curMon.total_rain / curMon.days.length * 10) / 10 : null;
  var lyRainAvg  = (lyMon  && lyMon.total_rain  != null && lyMon.days  && lyMon.days.length)
    ? Math.round(lyMon.total_rain  / lyMon.days.length  * 10) / 10 : null;

  setVal('wx-s-temp',  curTemp,    '°C');
  setVal('wx-s-rain',  curRainAvg, 'mm');
  setVal('wx-s-ptemp', lyTemp,     '°C');
  setVal('wx-s-prain', lyRainAvg,  'mm');
  setDiff('wx-s-tdiff', curTemp,    lyTemp,    '°C');
  setDiff('wx-s-rdiff', curRainAvg, lyRainAvg, 'mm');

  wxBuildDowIdx(wxY, wxM);
}
