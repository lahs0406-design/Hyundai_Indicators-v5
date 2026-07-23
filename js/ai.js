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

  // 좌측 사이드바 "AI 지표 해석" 박스도 같이 갱신 (키 등록/변경 시 바로 반영)
  var indBox = document.getElementById('ai-interpret-box');
  if (indBox && indBox.style.display !== 'none' && typeof curKey !== 'undefined' && typeof CD !== 'undefined') {
    resetIndicatorAI(curKey, CD[curKey]);
  }
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
      var series = s12.map(function(r) { return formatKoreanYm(r.ym) + ':' + r.val; }).join(', ');

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
      lines.push('[' + label + ']\n  월별: ' + rows.map(function(r) { return formatKoreanYm(r.ym) + ':' + r.val; }).join(', '));
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
    '날짜나 시점을 언급할 때는 반드시 "OO년 O월"(예: 26년 7월) 형식으로만 표기하고, "26.07" 같은 표기는 쓰지 마세요.\n\n' +
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

function togglePromptEditor() {
  var body = document.getElementById('prompt-input-body');
  var icon = document.getElementById('prompt-toggle-icon');
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if (icon) icon.textContent = isOpen ? '▸' : '▾';
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

/* ===========================================
   ai.js § 9. 단일 지표 AI 해석 (좌측 사이드바)
   · 오른쪽 "지표 교차 인사이트"와 완전히 독립적으로 동작
   · resetIndicatorAI(key, d): 지표 전환 시 상태 초기화 + 키 있으면 자동 생성
   · runIndicatorAI(): 현재 지표에 대해 AI 해석 (재)생성
   · buildIndicatorPrompt(): config.js의 고정 예시문이 아니라, 화면에 실제로
     표시된 최신 KPI·최근 추이 값을 그대로 프롬프트에 넣어 최신 시점 기준으로 해석하도록 함
   =========================================== */
var _indicatorAIAbort = null;

function formatKoreanYm(ym) {
  if (!ym) return '';
  var s = String(ym);
  if (s.length >= 8) {
    var yy = s.slice(2, 4);
    var mm = parseInt(s.slice(4, 6), 10);
    var dd = parseInt(s.slice(6, 8), 10);
    return yy + '년 ' + mm + '월 ' + dd + '일';
  }
  if (s.length === 6) {
    var yy2 = s.slice(2, 4);
    var mm2 = parseInt(s.slice(4, 6), 10);
    return yy2 + '년 ' + mm2 + '월';
  }
  return s;
}

function buildIndicatorPrompt(key, d) {
  var cur = (document.getElementById('scur') || {}).textContent || '';
  var chg = (document.getElementById('schg') || {}).textContent || '';
  var yoy = (document.getElementById('syoy') || {}).textContent || '';
  var avg = (document.getElementById('savg') || {}).textContent || '';
  var unit  = d.unit  || '';
  var title = d.title || key;

  var recentLine = '';
  if (Array.isArray(_lastSeriesVals) && _lastSeriesVals.length > 0) {
    var hasYms = Array.isArray(_lastSeriesYms) && _lastSeriesYms.length === _lastSeriesVals.length;
    var isDailySeries = hasYms
      ? (_lastSeriesYms[0] && String(_lastSeriesYms[0]).length >= 8)
      : (Array.isArray(_lastSeriesLabels) && _lastSeriesLabels.length > 0 && /^\d{2}\/\d{2}$/.test(_lastSeriesLabels[0]));
    var sampleVals, sampleYms;

    if (isDailySeries) {
      // 일별 데이터: 최근 며칠치만 보면 노이즈를 추세 전환으로 착각할 수 있으므로
      // 최근 3~4개월(최대 90거래일)을 넉넉히 보고, 대표 지점만 추려서 전달
      var lookback  = Math.min(90, _lastSeriesVals.length);
      var sliceVals = _lastSeriesVals.slice(-lookback);
      var sliceYms  = hasYms ? _lastSeriesYms.slice(-lookback) : [];
      var step = Math.max(1, Math.ceil(sliceVals.length / 10));
      sampleVals = []; sampleYms = [];
      for (var i = 0; i < sliceVals.length; i += step) {
        sampleVals.push(sliceVals[i]); sampleYms.push(sliceYms[i]);
      }
      var lastIdx = sliceVals.length - 1;
      if (sampleVals[sampleVals.length - 1] !== sliceVals[lastIdx]) {
        sampleVals.push(sliceVals[lastIdx]); sampleYms.push(sliceYms[lastIdx]);
      }
    } else {
      var n = Math.min(6, _lastSeriesVals.length);
      sampleVals = _lastSeriesVals.slice(-n);
      sampleYms  = hasYms ? _lastSeriesYms.slice(-n) : [];
    }

    var pairs = sampleVals.map(function(v, i) {
      var lbl = hasYms ? formatKoreanYm(sampleYms[i]) : '';
      return (lbl ? lbl + ':' : '') + v;
    });
    recentLine = (isDailySeries ? '최근 약 3개월간 추이(오래된 순 → 최신순, 대표 지점 샘플링): ' : '최근 추이(오래된 순 → 최신순): ')
      + pairs.join(' → ') + '\n';
  }

  return (
    '[' + title + ']\n' +
    '최신값: ' + cur + unit + ' · 전월비: ' + chg + ' · 전년비: ' + yoy + ' · 6개월 평균: ' + avg + '\n' +
    recentLine +
    '\n위 수치는 방금 화면에 표시된 실제 최신 데이터입니다. ' +
    '날짜나 시점을 언급할 때는 반드시 "OO년 O월"(예: 26년 7월) 형식으로만 표기하고, "26.07" 같은 표기는 쓰지 마세요. ' +
    '단순히 최근 하루이틀·한두 구간의 반등만으로 "추세 전환"이라고 성급히 단정하지 마세요. ' +
    '최근 수개월간의 고점·저점 대비 현재 위치가 어디인지 먼저 짚고, 그 다음 가장 최근 구간에서 ' +
    '일시적 반등인지 아니면 방향 자체가 바뀌는 신호인지 구분해서 설명해주세요.\n' +
    '이 지표가 현대백화점 매출과 고객 소비 심리에 미치는 영향을 3~4문장으로, 한국어로 해석해주세요.'
  );
}

function resetIndicatorAI(key, d) {
  var box        = document.getElementById('ai-interpret-box');
  var body       = document.getElementById('ai-interpret-body');
  var refreshBtn = document.getElementById('ai-interpret-refresh-btn');
  var providerTag= document.getElementById('ai-interpret-provider');
  if (!box || !body) return;

  if (_indicatorAIAbort) { _indicatorAIAbort.abort(); _indicatorAIAbort = null; }

  if (!d) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  box.dataset.key = key;

  var provider = currentProvider();
  var cfg = PROVIDER_CFG[provider];
  if (providerTag) providerTag.textContent = cfg ? cfg.label : '';

  var hasKey = cfg && !!localStorage.getItem(cfg.storageKey);
  if (refreshBtn) refreshBtn.style.display = hasKey ? '' : 'none';

  if (hasKey) {
    runIndicatorAI();
  } else {
    body.innerHTML = '<span class="ai-interpret-placeholder">AI 엔진 키를 등록하면 자동으로 분석이 생성됩니다. '
      + '<a href="#" onclick="openKeyModal();return false;">키 등록하기</a></span>';
  }
}

async function runIndicatorAI() {
  var box        = document.getElementById('ai-interpret-box');
  var body       = document.getElementById('ai-interpret-body');
  var refreshBtn = document.getElementById('ai-interpret-refresh-btn');
  if (!box || !body) return;
  var key = box.dataset.key;
  var d = (typeof CD !== 'undefined') ? CD[key] : null;
  if (!d) return;

  var provider = currentProvider();
  var cfg = PROVIDER_CFG[provider];
  if (!cfg || !localStorage.getItem(cfg.storageKey)) {
    body.innerHTML = '<span class="ai-interpret-placeholder">AI 엔진 키를 등록하면 분석을 생성할 수 있습니다. '
      + '<a href="#" onclick="openKeyModal();return false;">키 등록하기</a></span>';
    return;
  }

  if (_indicatorAIAbort) _indicatorAIAbort.abort();
  _indicatorAIAbort = new AbortController();
  if (refreshBtn) refreshBtn.disabled = true;
  body.innerHTML = '<span class="ai-interpret-placeholder">✦ 분석 생성 중…</span>';

  try {
    var prompt = buildIndicatorPrompt(key, d);
    var txt = await askAIByProvider(provider, prompt, { signal: _indicatorAIAbort.signal });
    var html = (typeof marked !== 'undefined') ? marked.parse(txt || '') : (txt || '').replace(/\n/g, '<br>');
    // 응답 도착 시점에 사용자가 다른 지표로 이동했으면 반영하지 않음
    if (box.dataset.key === key) body.innerHTML = html;
  } catch (e) {
    if (box.dataset.key === key) {
      body.innerHTML = (e.name === 'AbortError')
        ? '<span style="color:#888">⊘ 분석이 중단되었습니다.</span>'
        : '<span class="res-pane-error">⚠ ' + e.message + '</span>';
    }
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}
