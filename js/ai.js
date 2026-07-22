/* ===========================================
   ai.js § 0. 공통 시스템 프롬프트
   =========================================== */
var AI_SYSTEM_PROMPT = [
  '당신은 현대백화점 상품본부 전략 분석가입니다.',
  '아래 최근 경제 지표 실수치 데이터를 분석하여, 현대백화점 관점의 실전 인사이트를 작성해주세요.',
  '',
  '[분석 조건 설정]',
  '- 경제 지표 : 소비심리지수 / 소비자물가 / 기준금리 / 환율 / 코스피 / 외국인관광객 / 날씨(기온/강수)',
  '- 상품군 : 패션 / 명품 / 하이주얼리 / 장신구·잡화 / 뷰티 / 리빙 / 가전 / 유·아동 / F&B / 식품관 / SPA / 스포츠·아웃도어',
  '- 고객군 : 내국인 VIP고객 / 내국인 일반고객 / 외국인 관광객',
  '',
  '[분석 내용 가이드]',
  '① 지표 추이 요약',
  '- 각 지표의 최근 방향성(상승/하락/보합)과 변화 폭을 수치와 함께 2~3줄로 요약',
  '',
  '② 소비자 및 백화점 업계 영향',
  '- 현재 지표 조합이 내·외국인 소비 심리에 미치는 복합적 영향',
  '- 백화점 방문 빈도 및 객단가 관점에서 서술',
  '',
  '③ 상품 카테고리별 기회·리스크',
  '- 상품군 / 기회요인 / 리스크요인 / 지표에 대한 수치적 근거 순으로 작성',
  '',
  '④ 단기(1~3개월) MD 대응 전략 제언',
  '- 각 상품군별 구체적인 행동 방향 (프로모션 타이밍, 재고 전략, 외국인 타겟 마케팅 등)',
  '- 수치 근거를 바탕으로 우선순위 제시',
  '',
  '[인사이트 작성시 유의사항]',
  '※ 지표 간 상관관계를 반드시 포함할 것',
  '   Ex) 환율 상승 → 외국인 구매력 증가 → 명품 수요 확대',
  '※ 단순 현황 나열이 아닌, 수치 기반 판단 근거를 포함할 것',
  '※ 긍정/부정 양면을 균형 있게 서술할 것',
  '※ 아래 제공되는 [경제 지표 실수치]는 실제 API에서 수집된 데이터로,',
  '   반드시 제공된 수치만을 근거로 분석하고, 데이터에 없는 수치는 절대 추측하거나 임의 생성 금지. 반드시 한글로만 작성할것.'
].join('\n');

/* ===========================================
   ai.js § 1. Direct Line 클라이언트 (Copilot Studio)
   =========================================== */

var _dlToken = null;
var _dlTokenExpiresAt = 0;
var _currentAbortController = null;

async function _getToken(signal) {
  var now = Date.now();
  if (_dlToken && now < _dlTokenExpiresAt) return _dlToken;
  var secret = localStorage.getItem('copilot_secret');
  if (!secret) throw new Error('Copilot Studio 키가 설정되지 않았습니다.');
  var res = await fetch('https://directline.botframework.com/v3/directline/tokens/generate', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + secret }, signal: signal
  });
  if (!res.ok) throw new Error('토큰 발급 실패 (' + res.status + ') — 키를 다시 확인하세요.');
  var data = await res.json();
  _dlToken = data.token;
  _dlTokenExpiresAt = now + (Math.max((data.expires_in || 1800) - 60, 30)) * 1000;
  return _dlToken;
}

function _dlHeaders(token) {
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function askCopilotAgent(message, opts) {
  opts = opts || {};
  var timeoutMs  = opts.timeoutMs  || 300000;
  var onProgress = opts.onProgress || null;
  var signal     = opts.signal     || null;

  if (onProgress) onProgress(1, '🔑 Copilot 키 인증 중…');
  var token = await _getToken(signal);

  if (onProgress) onProgress(2, '🔗 에이전트 연결 중…');
  var convRes = await fetch('https://directline.botframework.com/v3/directline/conversations', {
    method: 'POST', headers: _dlHeaders(token), signal: signal
  });
  if (!convRes.ok) {
    _dlToken = null;
    token = await _getToken(signal);
    convRes = await fetch('https://directline.botframework.com/v3/directline/conversations', {
      method: 'POST', headers: _dlHeaders(token), signal: signal
    });
    if (!convRes.ok) throw new Error('대화 시작 실패 (' + convRes.status + ')');
  }
  var conv = await convRes.json();
  var convId    = conv.conversationId;
  var convToken = conv.token || token;
  var streamUrl = conv.streamUrl;   // Direct Line WebSocket URL
  var actUrl    = 'https://directline.botframework.com/v3/directline/conversations/' + convId + '/activities';

  // WebSocket 가능하면 즉시 응답, 아니면 폴링 폴백
  if (streamUrl) {
    return await _askCopilotViaWS(streamUrl, actUrl, convToken, message, timeoutMs, signal, onProgress);
  } else {
    return await _askCopilotViaPoll(actUrl, convToken, message, timeoutMs, signal, onProgress);
  }
}

/* ── WebSocket 방식 (Direct Line streamUrl) ─────────────────────── */
function _askCopilotViaWS(streamUrl, actUrl, convToken, message, timeoutMs, signal, onProgress) {
  return new Promise(function(resolve, reject) {
    var ws = null;
    var deadline = null;
    var progressTimer = null;
    var startTime = Date.now();
    var sendTime = null;   // 메시지 전송 완료 시각 (초기 activity 필터용)
    var done = false;

    function finish(fn) {
      if (done) return;
      done = true;
      if (deadline) clearTimeout(deadline);
      if (progressTimer) clearInterval(progressTimer);
      try { if (ws && ws.readyState < 2) ws.close(); } catch(e) {}
      fn();
    }

    deadline = setTimeout(function() {
      finish(function() { reject(new Error('응답 시간 초과 (' + Math.floor(timeoutMs / 1000) + '초)')); });
    }, timeoutMs);

    if (signal) {
      signal.addEventListener('abort', function() {
        finish(function() { reject(new DOMException('중단됨', 'AbortError')); });
      });
    }

    try {
      ws = new WebSocket(streamUrl);
    } catch(e) {
      finish(function() {});
      _askCopilotViaPoll(actUrl, convToken, message, timeoutMs, signal, onProgress).then(resolve, reject);
      return;
    }

    ws.onmessage = function(event) {
      if (sendTime === null) return;  // 전송 전 초기 activity 무시
      var data;
      try { data = JSON.parse(event.data); } catch(e) { return; }
      var activities = data.activities || [];
      var botMsgs = activities.filter(function(a) {
        var ts = a.timestamp ? new Date(a.timestamp).getTime() : sendTime;
        return a.type === 'message'
          && a.from && a.from.id !== 'dashboard-user'
          && typeof a.text === 'string' && a.text.trim().length > 0
          && ts >= sendTime - 2000;
      });
      if (botMsgs.length > 0) {
        console.log('[Copilot WS] 응답 수신 (' + Math.floor((Date.now() - startTime) / 1000) + '초)');
        finish(function() { resolve(botMsgs.map(function(a) { return a.text; }).join('\n\n')); });
      }
    };

    ws.onerror = function() {
      console.warn('[Copilot] WebSocket 오류 → 폴링으로 전환');
      finish(function() {});
      _askCopilotViaPoll(actUrl, convToken, message, timeoutMs, signal, onProgress).then(resolve, reject);
    };

    ws.onopen = async function() {
      try {
        if (onProgress) onProgress(3, '📨 분석 요청 전송 중…');
        var sendRes = await fetch(actUrl, {
          method: 'POST', headers: _dlHeaders(convToken),
          body: JSON.stringify({ type: 'message', from: { id: 'dashboard-user' }, text: message }),
          signal: signal
        });
        if (!sendRes.ok) {
          finish(function() { reject(new Error('메시지 전송 실패 (' + sendRes.status + ')')); });
          return;
        }
        sendTime = Date.now();
        if (onProgress) {
          progressTimer = setInterval(function() {
            var elapsed = Math.floor((Date.now() - startTime) / 1000);
            onProgress(4, '⏳ 응답 대기 중… (' + elapsed + '초 경과)');
          }, 1000);
        }
      } catch(e) {
        finish(function() { reject(e); });
      }
    };
  });
}

/* ── 폴링 방식 (WebSocket 미지원 시 폴백, 500ms 간격) ───────────── */
async function _askCopilotViaPoll(actUrl, convToken, message, timeoutMs, signal, onProgress) {
  if (onProgress) onProgress(3, '📨 분석 요청 전송 중…');
  var sendRes = await fetch(actUrl, {
    method: 'POST', headers: _dlHeaders(convToken),
    body: JSON.stringify({ type: 'message', from: { id: 'dashboard-user' }, text: message }),
    signal: signal
  });
  if (!sendRes.ok) throw new Error('메시지 전송 실패 (' + sendRes.status + ')');

  var watermark = null;
  var startTime = Date.now();
  var deadline  = startTime + timeoutMs;

  while (Date.now() < deadline) {
    if (signal && signal.aborted) throw new DOMException('중단됨', 'AbortError');
    await new Promise(function(r) { setTimeout(r, 500); });
    if (signal && signal.aborted) throw new DOMException('중단됨', 'AbortError');

    var elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (onProgress) onProgress(4, '⏳ 응답 대기 중… (' + elapsed + '초 경과)');

    var url = actUrl + (watermark != null ? '?watermark=' + watermark : '');
    try {
      var pollRes = await fetch(url, { headers: { 'Authorization': 'Bearer ' + convToken }, signal: signal });
      if (!pollRes.ok) continue;
      var pollData = await pollRes.json();
      watermark = pollData.watermark;
      console.log('[Copilot poll] activities:', JSON.stringify(pollData.activities || []));
      var botMsgs = (pollData.activities || []).filter(function(a) {
        return a.type === 'message' && a.from && a.from.id !== 'dashboard-user'
               && typeof a.text === 'string' && a.text.trim().length > 0;
      });
      if (botMsgs.length) return botMsgs.map(function(a) { return a.text; }).join('\n\n');
    } catch(e) {
      if (e.name === 'AbortError') throw e;
    }
  }
  throw new Error('응답 시간 초과 (' + Math.floor(timeoutMs / 1000) + '초)');
}

/* ===========================================
   ai.js § 2. Gemini
   =========================================== */
async function askGemini(message, opts) {
  opts = opts || {};
  var onProgress = opts.onProgress || null;
  var signal     = opts.signal     || null;

  var key = localStorage.getItem('gemini_api_key');
  if (!key) throw new Error('Gemini API 키가 설정되지 않았습니다.');

  if (onProgress) onProgress(1, '🔑 Gemini 키 확인 중…');
  if (onProgress) onProgress(3, '📨 Gemini에 요청 전송 중…');

  var progressTimer = setTimeout(function() {
    if (onProgress) onProgress(4, '⏳ Gemini 응답 대기 중…');
  }, 500);

  try {
    var res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + key,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: message }] }]
      }),
        signal: signal
      }
    );
    clearTimeout(progressTimer);
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error('Gemini 오류 (' + res.status + '): ' + ((err.error && err.error.message) || '알 수 없는 오류'));
    }
    var data = await res.json();
    var text = data.candidates && data.candidates[0] && data.candidates[0].content
               && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
               && data.candidates[0].content.parts[0].text;
    if (!text) throw new Error('Gemini에서 응답을 받지 못했습니다.');
    return text;
  } catch(e) {
    clearTimeout(progressTimer);
    throw e;
  }
}

/* ===========================================
   ai.js § 3. Anthropic (Claude)
   =========================================== */
async function askAnthropic(message, opts) {
  opts = opts || {};
  var onProgress = opts.onProgress || null;
  var signal     = opts.signal     || null;

  var key = localStorage.getItem('anthropic_api_key');
  if (!key) throw new Error('Anthropic API 키가 설정되지 않았습니다.');

  if (onProgress) onProgress(1, '🔑 Claude 키 확인 중…');
  if (onProgress) onProgress(3, '📨 Claude에 요청 전송 중…');

  var progressTimer = setTimeout(function() {
    if (onProgress) onProgress(4, '⏳ Claude 응답 대기 중…');
  }, 500);

  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }]
      }),
      signal: signal
    });
    clearTimeout(progressTimer);
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error('Claude 오류 (' + res.status + '): ' + ((err.error && err.error.message) || '알 수 없는 오류'));
    }
    var data = await res.json();
    var text = data.content && data.content[0] && data.content[0].text;
    if (!text) throw new Error('Claude에서 응답을 받지 못했습니다.');
    return text;
  } catch(e) {
    clearTimeout(progressTimer);
    throw e;
  }
}

/* ===========================================
   ai.js § 4. Groq (llama-3.3-70b, 무료)
   =========================================== */
async function askGroq(message, opts) {
  opts = opts || {};
  var onProgress = opts.onProgress || null;
  var signal     = opts.signal     || null;

  var key = localStorage.getItem('groq_api_key');
  if (!key) throw new Error('Groq API 키가 설정되지 않았습니다.');

  if (onProgress) onProgress(1, '🔑 Groq 키 확인 중…');
  if (onProgress) onProgress(3, '📨 Groq에 요청 전송 중…');

  var progressTimer = setTimeout(function() {
    if (onProgress) onProgress(4, '⏳ Groq 응답 대기 중…');
  }, 500);

  try {
    var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user',   content: message }
        ],
        max_tokens: 2048
      }),
      signal: signal
    });
    clearTimeout(progressTimer);
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error('Groq 오류 (' + res.status + '): ' + ((err.error && err.error.message) || '알 수 없는 오류'));
    }
    var data = await res.json();
    var text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Groq에서 응답을 받지 못했습니다.');
    return text;
  } catch(e) {
    clearTimeout(progressTimer);
    throw e;
  }
}

/* ===========================================
   ai.js § 5. 프로바이더 디스패처
   =========================================== */
async function askAI(message, opts) {
  var provider = localStorage.getItem('ai_provider') || 'copilot';
  return askAIByProvider(provider, message, opts);
}

async function askAIByProvider(provider, message, opts) {
  switch (provider) {
    case 'gemini':    return askGemini(message, opts);
    case 'anthropic': return askAnthropic(message, opts);
    case 'groq':      return askGroq(message, opts);
    default:          return askCopilotAgent(message, opts);
  }
}

/* ===========================================
   ai.js § 6. 교차분석 UI
   =========================================== */

/* 현재 선택 프로바이더 */
var _lastFocusedProvider = localStorage.getItem('ai_provider') || 'copilot';

/* 엔진별 결과 캐시: { provider: { html: '...', label: '...' } } */
var _resultCache = {};

/* 프로바이더 단일 선택 */
function switchProvider(btn) {
  document.querySelectorAll('.ptab').forEach(function(b){ b.classList.remove('on'); });
  btn.classList.add('on');
  var provider = btn.dataset.provider;
  _lastFocusedProvider = provider;
  localStorage.setItem('ai_provider', provider);
  updateKeyStatus();
  // 이 엔진에 캐시된 결과가 있으면 바로 표시
  _showCachedResult(provider);
}

/* 현재 선택 프로바이더 */
function currentProvider() { return _lastFocusedProvider; }

/* 키 도트 / 버튼 텍스트 업데이트 */
function updateKeyStatus() {
  // 각 ptab 버튼 내 도트 업데이트
  Object.keys(PROVIDER_CFG).forEach(function(p) {
    var cfg = PROVIDER_CFG[p];
    var dot = document.getElementById('ptab-dot-' + p);
    if (dot) dot.className = 'ptab-dot ' + (localStorage.getItem(cfg.storageKey) ? 'set' : 'unset');
  });
  // 키 설정 버튼은 마지막 포커스 프로바이더 기준
  var cfg = PROVIDER_CFG[_lastFocusedProvider];
  var dot = document.getElementById('ai-key-status-dot');
  var txt = document.getElementById('ai-key-btn-text');
  var hasKey = cfg && !!localStorage.getItem(cfg.storageKey);
  if (dot) dot.className = 'ai-key-dot ' + (hasKey ? 'set' : 'unset');
  if (txt) txt.textContent = hasKey
    ? (cfg.label) + ' 키 등록됨 — 클릭하여 변경'
    : (_lastFocusedProvider ? (cfg.label) + ' 키 미설정 — 클릭하여 등록' : '엔진 선택 후 키 등록');
}

document.addEventListener('DOMContentLoaded', updateKeyStatus);

/* 체크박스 ID → summary.json 키 매핑 */
var CHK_TO_KEY = {
  ic_csi:         'csi',
  ic_cpi:         'cpi',
  ic_rate:        'rate',
  ic_fx:          'fx',
  ic_kospi:       'kospi',
  ic_tourist:     'tourist',
  ic_retail:      'retail',
  ic_dept:        'dept',
  ic_mart:        'mart',
  ic_convenience: 'convenience'
};

/* summary.json 로드 (캐시 무효화) */
var _summaryCache = null;
var _summaryCacheTime = 0;
async function loadSummaryJson() {
  var now = Date.now();
  if (_summaryCache && now - _summaryCacheTime < 60000) return _summaryCache;
  try {
    var res = await fetch('./summary.json?_=' + now);
    if (res.ok) {
      _summaryCache = await res.json();
      _summaryCacheTime = now;
      return _summaryCache;
    }
  } catch(e) {}
  return null;
}

/* 선택 지표의 summary 데이터를 텍스트 블록으로 변환 */
async function buildRawDataBlock(checked) {
  var summary  = await loadSummaryJson();
  var jsonData = null;
  if (!summary) {
    // summary.json 없으면 data.json 폴백 (최근 12개월)
    try { jsonData = await loadDataJson(); } catch(e) {}
  }

  var lines = [];
  Array.from(checked).forEach(function(chk) {
    var key   = CHK_TO_KEY[chk.id];
    var label = ((document.querySelector('label[for="' + chk.id + '"]') || {}).textContent || chk.value).trim();

    if (summary && key && summary[key]) {
      var entry = summary[key];
      var kpi   = entry.kpi || {};
      var s12   = entry.series12 || [];

      // KPI 한 줄 요약
      var kpiParts = [];
      if (kpi.cur  !== undefined) kpiParts.push('현재:' + kpi.cur);
      if (kpi.mom  !== undefined) kpiParts.push('전월비:' + (kpi.mom >= 0 ? '+' : '') + kpi.mom);
      if (kpi.yoy  !== undefined) kpiParts.push('전년비:' + (kpi.yoy >= 0 ? '+' : '') + kpi.yoy);
      if (kpi.avg6 !== undefined) kpiParts.push('6개월평균:' + kpi.avg6);

      // 12개월 시계열
      var series = s12.map(function(r) { return r.ym + ':' + r.val; }).join(', ');

      var block = '[' + label + ']\n';
      if (kpiParts.length) block += '  요약: ' + kpiParts.join(' | ') + '\n';
      if (series)          block += '  월별(최근12개월): ' + series + '\n';

      // 품목별 최신값 (유통채널만)
      if (entry.items_latest) {
        var items = Object.keys(entry.items_latest).map(function(nm) {
          return nm + ':' + entry.items_latest[nm];
        }).join(', ');
        block += '  품목별(최신월): ' + items + '\n';
      }
      lines.push(block);

    } else if (jsonData && key && jsonData[key]) {
      // 폴백: data.json 최근 12개월
      var rows = jsonData[key].slice(-12);
      lines.push('[' + label + ']\n  월별: ' + rows.map(function(r) { return r.ym + ':' + r.val; }).join(', '));
    } else {
      lines.push('[' + label + ']\n  데이터 없음');
    }
  });
  return lines.join('\n');
}

/* 기본 프롬프트 생성 (체크박스 선택 시 textarea에 표시) */
function buildDefaultPrompt(checked) {
  var labels = Array.from(checked).map(function(chk) {
    return (document.querySelector('label[for="' + chk.id + '"]') || {}).textContent || chk.value;
  }).map(function(l) { return l.trim(); });

  return '아래 경제 지표 데이터를 바탕으로 현대백화점 상품본부 관점에서 분석 보고서를 작성해 주세요.\n\n' +
    '분석 지표: ' + labels.join(', ') + '\n\n' +
    '다음 구성으로 마크다운 형식으로 작성해 주세요:\n' +
    '1. 지표 간 상관관계 및 현황 요약\n' +
    '2. 현대백화점 매출·고객 방문에 미치는 영향 분석\n' +
    '3. 상품 카테고리별 기회/리스크 (예: 명품, 식품, 생활, 스포츠 등)\n' +
    '4. 단기(1~3개월) 대응 전략 제언\n\n' +
    '(실제 지표 수치는 아래 [데이터] 섹션에 포함됩니다.)';
}

function updateDefaultPrompt() {
  var checked  = document.querySelectorAll('.ind-chk:checked');
  var textarea = document.getElementById('custom-prompt-input');
  if (!textarea) return;
  if (checked.length === 0) {
    textarea.value = '';
    return;
  }
  textarea.value = buildDefaultPrompt(checked);
}

function selectedIndicatorsToPrompt(checked) {
  return Array.from(checked).map(function(c) { return c.value; }).join(', ');
}

function cancelInsight() {
  if (_currentAbortController) {
    _currentAbortController.abort();
    _currentAbortController = null;
  }
}

/* 프로바이더별 단계 레이블 */
var PROVIDER_STEPS = {
  copilot:   ['키 인증', '에이전트 연결', '요청 전송', '응답 대기'],
  gemini:    ['키 확인', '—', '요청 전송', '응답 수신'],
  anthropic: ['키 확인', '—', '요청 전송', '응답 수신'],
  groq:      ['키 확인', '—', '요청 전송', '응답 수신']
};

/* 결과 엔진 탭 업데이트 (캐시 있는 엔진 활성화) */
function _updateResultEngineTabs() {
  var tabsEl = document.getElementById('result-engine-tabs');
  if (!tabsEl) return;
  var hasAny = false;
  Object.keys(PROVIDER_CFG).forEach(function(p) {
    var btn = tabsEl.querySelector('[data-provider="' + p + '"]');
    if (!btn) return;
    var cached = !!_resultCache[p];
    btn.disabled = !cached;
    btn.classList.toggle('has-result', cached);
    if (cached) hasAny = true;
  });
  tabsEl.style.display = hasAny ? 'flex' : 'none';

  // 현재 선택 엔진 탭 강조
  var cur = currentProvider();
  tabsEl.querySelectorAll('.res-tab-btn').forEach(function(b){
    b.classList.toggle('on', b.dataset.provider === cur && !!_resultCache[cur]);
  });
}

/* 캐시된 결과 결과 영역에 표시 */
function _showCachedResult(provider) {
  var cache = _resultCache[provider];
  var resultBox = document.getElementById('custom-result');
  var cirBody   = document.getElementById('cir-body');
  if (!cache || !resultBox) return;

  resultBox.classList.add('show');
  cirBody.innerHTML = cache.html;
  _updateResultEngineTabs();
}

async function runCustomInsight() {
  var checked = document.querySelectorAll('.ind-chk:checked');
  if (checked.length < 2) { alert('2개 이상 선택해주세요.'); return; }

  var provider   = currentProvider();
  var userPrompt = (document.getElementById('custom-prompt-input') || {}).value || buildDefaultPrompt(checked);
  var selectedLabels = Array.from(checked).map(function(c) {
    var lbl = document.querySelector('label[for="' + c.id + '"]');
    return lbl ? lbl.textContent.trim() : c.value;
  });

  var resultBox = document.getElementById('custom-result');
  var cirBody   = document.getElementById('cir-body');
  var cirPulse  = document.getElementById('cir-pulse');
  var cirSelected = document.getElementById('cir-selected');
  var runBtn    = document.getElementById('custom-run-btn');
  var cancelBtn = document.getElementById('custom-cancel-btn');

  /* 선택 지표 태그 */
  cirSelected.innerHTML = selectedLabels.map(function(l){
    return '<span class="cir-tag">' + l + '</span>';
  }).join('');
  cirSelected.style.display = 'flex';

  resultBox.classList.add('show');
  cirPulse.style.display = 'inline';
  runBtn.disabled = true;
  cancelBtn.style.display = 'inline-block';

  /* 로딩 표시 */
  var STEPS = PROVIDER_STEPS[provider] || PROVIDER_STEPS.copilot;
  var skipStep2 = (provider !== 'copilot');
  function renderProgress(currentStep, statusMsg) {
    var stepsHtml = STEPS.map(function(label, i) {
      var idx = i + 1;
      if (skipStep2 && idx === 2) return '';
      var done   = idx < currentStep;
      var active = idx === currentStep;
      var cls    = done ? 'ai-step done' : active ? 'ai-step active' : 'ai-step pending';
      var icon   = done ? '✓'
                 : active ? '<span class="pulse" style="width:7px;height:7px;margin:0"></span>'
                 : String(idx);
      return '<div class="' + cls + '"><span class="ai-step-icon">' + icon + '</span>' + label + '</div>';
    }).join('');
    cirBody.innerHTML =
      '<div class="ai-progress-steps">' + stepsHtml + '</div>' +
      '<div class="ai-progress-msg">' + statusMsg + '</div>';
  }
  renderProgress(1, '📊 지표 데이터 수집 중…');

  _currentAbortController = new AbortController();

  try {
    var dataBlock   = await buildRawDataBlock(checked);
    var fullMessage = userPrompt.trim() + '\n\n[지표 데이터]\n' + dataBlock;

    var txt = await askAIByProvider(provider, fullMessage, {
      onProgress: function(step, msg) { renderProgress(step, msg); },
      signal: _currentAbortController.signal
    });

    var html = (typeof marked !== 'undefined')
      ? marked.parse(txt || '')
      : (txt || '').replace(/\n/g, '<br>');

    /* 결과 캐시에 저장 */
    _resultCache[provider] = { html: html, label: PROVIDER_CFG[provider].label };

    cirBody.innerHTML = html;
    _updateResultEngineTabs();

  } catch(e) {
    cirBody.innerHTML = e.name === 'AbortError'
      ? '<span style="color:#888">⊘ 분석이 중단되었습니다.</span>'
      : '<span class="res-pane-error">⚠ ' + e.message + '</span>';
  } finally {
    cirPulse.style.display = 'none';
    cancelBtn.style.display = 'none';
    runBtn.disabled = false;
    _currentAbortController = null;
  }
}

function cancelInsight() {
  if (_currentAbortController) {
    _currentAbortController.abort();
    _currentAbortController = null;
  }
}

/* ===========================================
   ai.js § 7. 타입라이터 렌더링
   =========================================== */
function typewriterRender(rawText, container) {
  var CHARS_PER_FRAME = 25;
  var html = (typeof marked !== 'undefined') ? marked.parse(rawText) : rawText.replace(/\n/g, '<br>');
  var temp = document.createElement('div');
  temp.innerHTML = html;
  var fullText = temp.textContent || temp.innerText || '';
  container.innerHTML = '';

  return new Promise(function(resolve) {
    var idx = 0;
    var output = document.createElement('div');
    output.className = 'markdown-body';
    container.appendChild(output);

    function tick() {
      if (idx >= fullText.length) {
        output.innerHTML = html;
        resolve();
        return;
      }
      idx = Math.min(idx + CHARS_PER_FRAME, fullText.length);
      output.textContent = fullText.slice(0, idx);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/* ===========================================
   ai.js § 8. 체크박스 카운터 + 프롬프트 자동 업데이트
   =========================================== */
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('change', function(e) {
    if (!e.target.classList.contains('ind-chk')) return;
    var checked = document.querySelectorAll('.ind-chk:checked');
    var counter = document.getElementById('chk-counter');
    if (checked.length > 5) { e.target.checked = false; return; }
    if (counter) counter.textContent = checked.length + '/5 선택됨';
    updateDefaultPrompt();
  });
});
