/**
 * ai.js — Claude API 연결 (선택 기능)
 *
 * 두 가지 방식을 지원합니다.
 *  1) 프록시 서버 방식(권장) : 학원 서버가 API 키를 보관하고 대신 호출합니다.
 *  2) 직접 호출 방식         : 선생님 기기에 저장한 키로 브라우저가 직접 호출합니다.
 *     → 편하지만 키가 기기에 남으므로, 개인 기기에서만 사용하세요.
 *
 * 어떤 방식이든 생성 결과는 feedback.js 의 verify()로 검증한 뒤 화면에 표시됩니다.
 */
(function (global) {
  'use strict';

  var API_URL = 'https://api.anthropic.com/v1/messages';
  var API_VERSION = '2023-06-01';
  var DEFAULT_MODEL = 'claude-sonnet-5';

  function isConfigured(settings) {
    var ai = (settings && settings.ai) || {};
    return !!(String(ai.proxyUrl || '').trim() || String(ai.apiKey || '').trim());
  }

  /** 응답 텍스트에서 JSON 부분만 꺼낸다 (설명이 섞여 와도 견디도록) */
  function extractJSON(text) {
    var t = String(text || '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    var start = t.indexOf('{');
    var end = t.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) throw new Error('AI 응답에서 JSON을 찾지 못했습니다.');
    return JSON.parse(t.slice(start, end + 1));
  }

  function pickText(data) {
    if (!data) throw new Error('AI 응답이 비어 있습니다.');
    if (typeof data === 'string') return data;
    if (Array.isArray(data.content)) {
      return data.content.filter(function (b) { return b && b.type === 'text'; })
        .map(function (b) { return b.text; }).join('\n');
    }
    if (typeof data.text === 'string') return data.text;
    if (data.error) throw new Error(data.error.message || 'AI 호출 오류');
    throw new Error('AI 응답 형식을 해석하지 못했습니다.');
  }

  /**
   * 피드백 5개 문단을 AI로 생성한다.
   * @returns Promise<{today,state,improve,homework,notice}>
   */
  function generate(lesson, settings) {
    var ai = (settings && settings.ai) || {};
    var prompt = global.FeedbackEngine.buildAIPrompt(lesson, settings);
    var body = {
      model: String(ai.model || '').trim() || DEFAULT_MODEL,
      max_tokens: 1200,
      temperature: 0,          // 매번 같은 결과가 나오도록 (임의 창작 최소화)
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    };

    var proxyUrl = String(ai.proxyUrl || '').trim();
    var url, headers;

    if (proxyUrl) {
      url = proxyUrl;
      headers = { 'content-type': 'application/json' };
    } else {
      var key = String(ai.apiKey || '').trim();
      if (!key) return Promise.reject(new Error('AI 설정이 없습니다. 설정 화면에서 프록시 주소나 API 키를 입력해 주세요.'));
      url = API_URL;
      headers = {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    }

    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function (res) {
        return res.text().then(function (txt) {
          if (!res.ok) {
            var msg = 'AI 호출 실패 (' + res.status + ')';
            try { var j = JSON.parse(txt); if (j && j.error && j.error.message) msg += ': ' + j.error.message; } catch (e) {}
            if (res.status === 401) msg += ' — API 키를 확인해 주세요.';
            if (res.status === 429) msg += ' — 잠시 후 다시 시도해 주세요.';
            throw new Error(msg);
          }
          var data;
          try { data = JSON.parse(txt); } catch (e) { data = txt; }
          return data;
        });
      })
      .then(function (data) {
        var parsed = extractJSON(pickText(data));
        return {
          today: String(parsed.today || '').trim(),
          state: String(parsed.state || '').trim(),
          improve: String(parsed.improve || '').trim(),
          homework: String(parsed.homework || '').trim(),
          notice: String(parsed.notice || '').trim()
        };
      });
  }

  global.AIClient = {
    DEFAULT_MODEL: DEFAULT_MODEL,
    isConfigured: isConfigured,
    generate: generate
  };
})(window);
