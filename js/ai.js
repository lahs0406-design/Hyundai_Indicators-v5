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
  '① 총론 형태의 문장형 요약답변 3~4줄',
  '   - 각 지표의 최근 3~4개월 방향성(상승/하락/보합)과 변화 폭을 중심으로 수치와 함께 요약',
  '② 각 지표별 흐름 요약 1~2줄',
  '③ 지표간 상관관계 1~2줄 (유의사항 내 세부예시 참조)',
  '③ 당사 상품군에 미치는 영향 3~4줄',
  '   - 표나 도식화 가능, 너무 구체적인 방안은 삼가 (프로모션 전개 같은), 그리고 각각 기회요인, 리스크요인 나눠서 작성, 수치적 근거를 댈것',
  '④ 결론 1줄',
  '',
  '[인사이트 작성시 유의사항]',
  '',
  '※ 아래 세부 예시를 반드시 참고하여 지표 간 상관관계를 반드시 포함후 작성',
  '    Ex) 환율 상승 / 외국인 관광객 증가 → 외국인 구매력 확대 → 명품 등 비필수재 사치재 수요에 긍정적 영향',
  '    Ex) 환율 하락 / 외국인 관광객 증가 → 외국인 수요는 있을것이나 구매력 약화  → 가격 메리트 외 구매 요인 다변화 필요',
  '    Ex) 코스피 상승 / 소비심리지수 증가 → 내국인 고객 자산 증대 효과 및 소비 심리 확대 → 전반적 상품군 긍정적 영향',
  '    Ex) 물가 상승 / 소비심리지수 증가 → 소비심리는 높지만 내국인 구매력 감소 → 당장의 구매 심리는 있을것이나 장기적으로 물가 압력에 따른 소비심리 축소 대응 필요',
  '    Ex) 금리 상승 / 물가상승 → 내국인 고객의 소비여력 감소 → 비필수재, 사치재의 수요 감소 대응 필요, 필수재 및 가격 소구 중심의 상품 전개 필요',
  '    Ex) 코스피 감소 / 환율 상승 → 외국인 자본의 이탈 가속화 (악순환), 수출기업 유리, 수입기업 불리, 금리 인하 어려움에 따라 대출 이자 부담 증가',
  '',
  '※ 단순 현황 나열이 아닌, 수치 기반 판단 근거를 포함할 것',
  '※ 긍정/부정 양면을 균형 있게 서술할 것',
  '※ 3~4개월간 추이를 보고 추이의 방향성도 고려해서 판단 (예를들어 지수가 100을 넘더라도, 최근 3개월 대비 떨어졌다면 해당 추세도 고려해서 작성)',
  '※ 아래 제공되는 [경제 지표 실수치]는 실제 API에서 수집된 데이터로,',
  '    반드시 제공된 수치만을 근거로 분석하고, 데이터에 없는 수치는 절대 추측하거나 임의 생성 금지',
  '※ 물가지수의 경우, 전년비 신장률이 중요 (5월은 전년비 +3% 신장이었는데, 7월은 전년비 +2.8% 신장 → 물가 상승이 지속되었으나 상승폭이 둔화 됨)',
  '※ 소비심리지수·환율·코스피·금리 의 경우, 최근 수개월 대비 증감이 중요',
  '    (8월 소비심리지수가 108이어도 6~7월이 119 였다 → 소비심리가 최근 몇개월 대비 감소됨)',
  '    (8월 금리가 3%인데 최근 수개월동안 2.5% 였다가 7월 이후 연속 상승해서 긴축 기조로 돌아섰다)',
  '    (8월 환율이 1330인데 6월까지 1580까지 올라갔다가 급감했다 등등, 코스피도 마찬가지)',
  '',
  '',
  '[답변 구성]',
  '',
  '총론 형태의 문장형 요약답변 3~4줄',
  '각 지표별 흐름 요약 1~2줄',
  '지표간 상관관계 1~2줄 (유의사항 내 세부예시 참조)',
  '당사 상품군에 미치는 영향 3~4줄 (표나 도식화 가능, 너무 구체적인 방안은 삼가 (프로모션 전개 같은), 그리고 각각 기회요인, 리스크요인 나눠서 작성, 수치적 근거를 댈것)',
  '결론 1줄',
  '',
  "※ 모든 답변은 '존대어(~입니다 등)' 형태로 작성",
  '※ 숫자 표기시 단위까지 표기해주고, 소수점이 있는경우 첫째자리까지 표기',
  "※ '쓰고 지우기' 같은 보기 어려운 형태의 답변 금지, 평서문 형태 (한국어) 로만 작성",
  '',
  '',
  '[각 지표별 분석 참고사항]',
  '',
  '★ 소비심리지수(CSI) 특성 반영 :',
  '소비심리지수는 실물 경제에 선행하는 심리 지표이므로, 1년 전과의 단순 비교(YoY)보다는 전월, 전전월 등 최근 3~6개월간의 단기적 흐름(MoM 추세)과 기준값(100) 상회 여부를 더 중요시해서 분석 필요',
  '예를 들어 당월 수치가 105이고 전년 동월이 99이더라도, 전전월이 120, 전월이 118의 흐름을 보였다면 "전년 대비 상승했다"라고 긍정적으로 평가하기보다, "기준값(100)을 상회해 낙관론은 유지되고 있으나, 최근 3개월 연속 하락하며 소비 심리가 빠르게 둔화(위축)되는 추세다"라는 관점에서 해석하는 것이 맞음',
  '분석 시 전월 대비 신장률(%)보다는 지수 자체의 절대 수치와 단순 증감(p, 포인트)으로 표기할 것',
  '',
  '★ 소비자물가지수(CPI) 특성 반영 :',
  "물가지수는 지수 자체의 절대 수치나 전월 대비 증감(MoM)보다는 '전년 동월 대비 신장률(%, 인플레이션율)'이 최근 몇 개월간 어떤 방향성(확대/둔화)을 보이는지를 더 중요시해서 분석 필요",
  '예를 들어 당월 지수가 120(전년 동월 대비 +2.8%)이고, 전월 지수가 119(전년 동월 대비 +3.0%)라면 지수 자체는 전월보다 높아졌지만 "물가가 전월 대비 더 올랐다"고 단편적으로 보기보다는, "물가 상승세는 지속되고 있으나, 전년 동월 대비 상승률이 3.0%에서 2.8%로 낮아지며 인플레이션 압력이 다소 둔화되고 있다"라고 해석하는 것이 맞음',
  '분석 시 지수의 단순 증감(p)보다는 전년 동월 대비 신장률(%)을 중심으로 표기하며, 이 수치가 고객의 실질 구매력(장바구니 물가 부담)에 미치는 누적된 영향을 짚어줄 것',
  '',
  '★ 기준금리 특성 반영 :',
  "기준금리는 전년 동월 대비 신장률(%)보다는 '현재의 절대적인 수치(%)'와 최근 몇 개월간의 '방향성(연속 인상, 동결, 인하 등 기조)'을 중심으로 분석 필요",
  '예를 들어 당월이 3.0%이고 전월이 2.75%, 전전월이 2.5%라면, "금리가 10% 가까이 신장했다"라고 표현하는 것은 틀린 방식이며, "최근 연속 인상되며 긴축 기조가 강해졌다(0.25%p 상승)"라고 해석하는 것이 맞음',
  "또한 금리는 수치의 등락 자체보다는 특정 수준(예: 3%대 고금리)이 '얼마나 오래 지속(동결)되고 있는지'가 실물 경제(이자 부담)에 미치는 영향이 크므로 이를 고려해야 함",
  '분석 시 신장률(%)이 아닌 절대 수치(%)와 증감(%p)으로 표기할 것',
  '',
  '★ 코스피(KOSPI) 특성 반영 :',
  "코스피는 변동성이 매우 큰 선행 지표이므로, 1년 전과의 단순 비교(YoY)보다는 최근 몇 주~몇 개월간의 '추세(박스권, 급락, 랠리 등)'와 '고점 대비 하락폭'을 중요시해서 분석 필요",
  '예를 들어 당월이 2,600pt이고 전년 동월이 2,400pt이더라도, 전월이 2,800pt였다면 "전년 대비 올랐다"가 아니라 "최근 급격한 조정(하락) 국면에 진입해 자산 효과가 축소되었다"라고 보는 것이 맞음',
  '분석 시 지수(pt) 자체의 움직임을 중심으로 표기 (박스권 횡보, 급락, 랠리 등 표현 사용)하며, 주식 시장의 흐름이 내국인 VIP 및 일반 고객의 소비 심리(자산 효과)에 즉각적인 영향을 미친다는 관점으로 해석할 것',
  '',
  '★ 환율(원/달러) 특성 반영 :',
  "환율은 전년 동월 대비보다는 최근 3~6개월간의 단기적 흐름(MoM)과 '특정 심리적 저항선(예: 1,300원, 1,400원)' 돌파 여부를 더 중요시해서 분석 필요",
  '예를 들어 당월이 1,350원이고 전년 동월이 1,300원인데, 직전 3개월이 1,400원 -> 1,380원 -> 1,350원으로 흐르고 있다면 "전년 대비 올랐다"기 보다는 "최근 환율 하락세(원화 강세)가 이어지고 있다"라고 방향성을 짚어주는 것이 맞음',
  "분석 시 신장률(%)보다는 절대 금액(원)과 증감액(원)으로 보는 것이 더 직관적이며, '환율 하락 = 달러 가치 하락 = 외국인의 원화 체감 물가 상승(구매력 감소)'의 메커니즘을 반드시 반영할 것",
  '',
  '★ 외국인 관광객 특성 반영 :',
  '관광객 수는 전년 동월 대비 신장률(YoY %)을 통해 구조적 회복 및 성장세를 파악하는 것이 기본이나, 최근 유입 속도의 변화를 보여주는 전월 대비(MoM) 단기 추이 역시 매우 중요하게 복합적으로 분석해야 함.',
  '특히 외국인 방문은 계절성 및 주변국의 대형 연휴 이벤트에 크게 좌우되므로, 방한 비중이 높은 중국의 주요 연휴(1~2월 춘절, 5월 노동절, 10월 국경절)와 일본의 주요 연휴(4월 말~5월 초 골든위크, 8월 중순 오본, 12~1월 연말연시)가 당월 또는 직전·직후 월에 포함되어 있는지 반드시 감안하여 기저효과나 일시적 급증/급감 여부를 판단할 것.',
  '예를 들어 당월이 150만 명이고 전월이 180만 명인데, 전년 동월이 120만 명이라면 "전월 대비 감소했다(부정적)"라고 단순 해석하기보다, "중국 국경절 등 대형 이벤트가 집중되었던 전월 대비로는 단기적으로 둔화되었으나, 전년 대비로는 25% 신장하며 계절적 비수기에도 구조적 성장세를 단단하게 유지하고 있다"라고 입체적으로 보는 것이 맞음.',
  '분석 시 단순 증감(명) 보다는 절대 수치(만 명 등)와 신장률(%) 중심으로 표기할 것.'
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

/* 지표별 중점 고려사항 (교차분석 시스템 프롬프트의 [각 지표별 분석 참고사항]과 동일한
   내용을, 단일 지표 해석 상황에 맞춰 그대로 사용) */
var INDICATOR_NOTES = {
  csi: '소비심리지수는 실물 경제에 선행하는 심리 지표이므로, 1년 전과의 단순 비교(YoY)보다는 전월·전전월 등 최근 3~6개월간의 단기적 흐름(MoM 추세)과 기준값(100) 상회 여부를 더 중요하게 봅니다. 전년 대비 높더라도 최근 몇 개월 연속 하락 중이라면 그 둔화·위축 추세를 우선해서 짚어주세요. 전월 대비 변화는 신장률(%)이 아닌 지수 자체의 절대 수치와 단순 증감(p, 포인트)으로 표기합니다.',
  cpi: "소비자물가지수는 지수 자체의 절대 수치나 전월 대비 증감(MoM)보다는 '전년 동월 대비 신장률(%, 인플레이션율)'이 최근 몇 개월간 확대되고 있는지 둔화되고 있는지를 중심으로 봅니다. 예를 들어 상승률이 3.0%에서 2.8%로 낮아졌다면 물가 상승세는 지속되더라도 상승폭이 둔화되고 있다는 점을 짚어주세요. 지수의 단순 증감(p)보다 전년 동월 대비 신장률(%)을 중심으로 표기하고, 이 수치가 고객의 실질 구매력(장바구니 물가 부담)에 미치는 누적 영향을 함께 짚어줍니다.",
  rate: "기준금리는 전년 동월 대비 신장률(%)보다는 현재의 절대 수치(%)와 최근 몇 개월간의 방향성(연속 인상·동결·인하 등 기조)을 중심으로 봅니다. '10% 가까이 신장했다' 같은 신장률 표현은 쓰지 말고, '연속 인상되며 긴축 기조가 강해졌다(0.25%p 상승)'처럼 절대 수치(%)와 증감(%p)으로 표기하세요. 특정 금리 수준이 얼마나 오래 지속(동결)되고 있는지도 실물 경제(이자 부담)에 미치는 영향이 크므로 함께 고려합니다.",
  fx: "환율은 전년 동월 대비보다는 최근 3~6개월간의 단기적 흐름(MoM)과 특정 심리적 저항선(예: 1,300원, 1,400원) 돌파 여부를 더 중요하게 봅니다. 신장률(%)보다는 절대 금액(원)과 증감액(원)으로 표기하는 것이 직관적이며, '환율 하락 = 원화 강세 = 외국인의 원화 체감 물가 상승(구매력 감소)'의 메커니즘을 반영해서 해석해주세요.",
  kospi: "코스피는 변동성이 큰 선행 지표이므로 전년 대비 단순 비교보다는 최근 몇 주~몇 개월간의 추세(박스권, 급락, 랠리 등)와 고점 대비 하락폭을 중요하게 봅니다. 지수(pt) 자체의 움직임을 박스권 횡보·급락·랠리 등으로 표현하고, 이 흐름이 내국인 VIP·일반 고객의 소비 심리(자산 효과)에 미치는 영향으로 연결해서 해석해주세요.",
  tourist: '외국인 관광객 수는 전년 동월 대비 신장률(YoY %)로 구조적 회복·성장세를 판단하되, 최근 유입 속도 변화를 보여주는 전월 대비(MoM) 단기 추이도 함께 봅니다. 방한 비중이 높은 중국(춘절, 노동절, 국경절)과 일본(골든위크, 오본, 연말연시)의 주요 연휴가 해당 월이나 인접 월에 포함되는지 감안해 기저효과와 일시적 급증·급감을 구분해주세요. 단순 증감(명)보다는 절대 수치(만 명 등)와 신장률(%) 중심으로 표기합니다.',
  retail: '유통업 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 함께 살피고, 최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석해주세요.',
  dept: '백화점 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 함께 살피고, 최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석해주세요.',
  mart: '마트 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 함께 살피고, 최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석해주세요.',
  convenience: '편의점 매출은 전월 대비(MoM) 단기 변동과 함께 전년 동월 대비(YoY) 신장률로 구조적 추세를 함께 살피고, 최근 3~6개월간의 방향성(회복/둔화)을 중심으로 해석해주세요.'
};

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

  var noteLine = INDICATOR_NOTES[key] ? ('\n[지표별 중점 고려사항]\n' + INDICATOR_NOTES[key] + '\n') : '';

  return (
    '[' + title + ']\n' +
    '최신값: ' + cur + unit + ' · 전월비: ' + chg + ' · 전년비: ' + yoy + ' · 6개월 평균: ' + avg + '\n' +
    recentLine +
    noteLine +
    '\n위 수치는 방금 화면에 표시된 실제 최신 데이터입니다. ' +
    '반드시 제공된 수치만을 근거로 분석하고, 데이터에 없는 수치는 절대 추측하거나 임의 생성하지 마세요. ' +
    '날짜나 시점을 언급할 때는 반드시 "OO년 O월"(예: 26년 7월) 형식으로만 표기하고, "26.07" 같은 표기는 쓰지 마세요. ' +
    '단순히 최근 하루이틀·한두 구간의 반등만으로 "추세 전환"이라고 성급히 단정하지 마세요. ' +
    '최근 수개월간의 고점·저점 대비 현재 위치가 어디인지 먼저 짚고, 그 다음 가장 최근 구간에서 ' +
    '일시적 반등인지 아니면 방향 자체가 바뀌는 신호인지 구분해서 설명해주세요. ' +
    '위 [지표별 중점 고려사항]에 제시된 지표 특성(중요 지표는 절대 수치 vs 신장률, 포인트 vs %p 등 표기 기준 포함)을 반드시 반영해서 해석하세요.\n' +
    '이 지표가 현대백화점 매출과 고객 소비 심리에 미치는 영향을 3~4문장으로 해석해주세요.\n' +
    '\n[표기 규칙]\n' +
    '- 모든 답변은 존대어(~입니다 등) 형태로 작성하세요.\n' +
    '- 숫자 표기 시 단위까지 표기하고, 소수점이 있는 경우 첫째자리까지 표기하세요.\n' +
    '- 반드시 한국어 평서문으로만 작성하세요.\n' +
    '\n[출력 형식 — 반드시 지켜주세요]\n' +
    '- 제목이나 소제목을 달지 마세요 (예: "○○ 영향 해석" 같은 줄 금지).\n' +
    '- 글머리표(*, -, •)나 번호 매기기를 쓰지 말고, 문장과 문장이 자연스럽게 이어지는 하나의 문단(또는 이어지는 여러 문단)으로 작성하세요.\n' +
    '- 구분선(---, ***, 밑줄 등)을 절대 넣지 마세요.\n' +
    '- 마크다운 서식(굵게, 기울임, 표 등) 없이 순수한 문장으로만 답하세요.'
  );
}

/* ai_interpretations.json: 매일 새벽 GitHub Actions 배치가 생성해 두는
   지표별 AI 해석 캐시. { generated_at: '...', items: { key: { text } } } */
var _aiInterpCache = null;
var _aiInterpCacheTime = 0;
async function loadAiInterpretations(forceRefresh) {
  var now = Date.now();
  if (!forceRefresh && _aiInterpCache && now - _aiInterpCacheTime < 60000) return _aiInterpCache;
  try {
    var res = await fetch('./ai_interpretations.json?_=' + now);
    if (res.ok) {
      _aiInterpCache = await res.json();
      _aiInterpCacheTime = now;
      return _aiInterpCache;
    }
  } catch (e) {}
  return null;
}

function resetIndicatorAI(key, d) {
  var box  = document.getElementById('ai-interpret-box');
  var body = document.getElementById('ai-interpret-body');
  if (!box || !body) return;

  if (_indicatorAIAbort) { _indicatorAIAbort.abort(); _indicatorAIAbort = null; }

  if (!d) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  box.dataset.key = key;
  showIndicatorAI(key, false);
}

/* 클릭 시마다 AI를 새로 호출하는 대신, 배치가 미리 만들어 둔
   ai_interpretations.json에서 해당 지표의 해석을 읽어와 표시한다. */
async function showIndicatorAI(key, forceRefresh) {
  var box        = document.getElementById('ai-interpret-box');
  var body       = document.getElementById('ai-interpret-body');
  var providerTag= document.getElementById('ai-interpret-provider');
  if (!box || !body) return;

  body.innerHTML = '<span class="ai-interpret-placeholder">✦ 해석 불러오는 중…</span>';

  var data = await loadAiInterpretations(forceRefresh);
  if (box.dataset.key !== key) return; // 응답 도착 전 다른 지표로 이동했으면 무시

  var entry = data && data.items && data.items[key];
  if (providerTag) providerTag.textContent = (data && data.generated_at) ? data.generated_at + ' 기준' : '';

  if (!entry || !entry.text) {
    body.innerHTML = '<span class="ai-interpret-placeholder">아직 생성된 해석이 없습니다. (매일 새벽 자동 갱신됩니다)</span>';
    return;
  }
  var html = (typeof marked !== 'undefined') ? marked.parse(entry.text) : entry.text.replace(/\n/g, '<br>');
  body.innerHTML = html;
}

/* "⟳" 버튼: 재생성이 아니라 캐시를 무시하고 ai_interpretations.json을 다시 읽어온다
   (예: 배치가 방금 막 갱신됐을 때 새로고침 용도) */
function runIndicatorAI() {
  var box = document.getElementById('ai-interpret-box');
  if (!box || !box.dataset.key) return;
  showIndicatorAI(box.dataset.key, true);
}
