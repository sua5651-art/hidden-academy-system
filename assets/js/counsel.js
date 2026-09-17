/**
 * counsel.js — 상담 내용 요약 (3~5줄)
 *
 * 원문(content)과 요약(summary)은 끝까지 분리해 보관한다.
 * 요약을 다시 만들거나 손봐도 원문은 그대로 남는다.
 *
 * 요약 방식 두 가지
 *  1) 규칙 기반(기본) — 원문에서 중요한 문장을 "골라내는" 방식(발췌).
 *     문장을 새로 쓰지 않으므로 없는 내용이 들어갈 수 없다.
 *  2) AI — 문장을 다듬어 준다. 생성 후 원문과 대조 검증한다.
 */
(function (global) {
  'use strict';

  var MIN_LINES = 3;
  var MAX_LINES = 5;

  function trim(v) { return String(v == null ? '' : v).trim(); }

  function labelOf(list, code) {
    var f = (list || []).filter(function (x) { return x.code === code; })[0];
    return f ? f.label : '';
  }

  function targetLabel(code) { return labelOf(global.Store.COUNSEL_TARGETS, code) || '기타'; }
  function typeLabel(code) { return labelOf(global.Store.COUNSEL_TYPES, code) || '기타'; }

  /** 상담 기록에서 중요하게 볼 말들 — 발췌 점수에 쓴다 */
  var KEY_WORDS = ('성적 등급 점수 모의고사 내신 중간고사 기말고사 시험 숙제 과제 태도 집중 결석 지각 조퇴 '
    + '진학 진로 대학 학과 반배정 레벨 교재 보충 재수강 환불 상담 요청 불만 건의 건강 친구 관계 '
    + '학습량 계획 목표 출결 전화 방문 면담').split(/\s+/);

  /** 원문을 문장 단위로 나눈다 */
  function toSentences(text) {
    return String(text || '')
      .split(/\r?\n+/)
      .reduce(function (acc, line) {
        // 한 줄 안에 여러 문장이 있으면 문장부호 기준으로 더 나눈다
        var parts = line.split(/(?<=[.!?…]|다\.|요\.)\s+/);
        return acc.concat(parts);
      }, [])
      .map(function (t) { return trim(t).replace(/^[-·*•]\s*/, ''); })
      .filter(function (t) { return t.length >= 2; });
  }

  function scoreSentence(sentence, index, total) {
    var score = 0;
    KEY_WORDS.forEach(function (w) { if (sentence.indexOf(w) !== -1) score += 3; });
    if (/\d/.test(sentence)) score += 2;                   // 숫자가 있으면 구체적인 정보
    var len = sentence.length;
    if (len >= 12 && len <= 90) score += 2;                // 너무 짧거나 긴 문장은 감점
    if (len > 120) score -= 2;
    if (index === 0) score += 3;                           // 첫 문장은 대개 핵심
    if (index === total - 1) score += 1;                   // 마지막 문장도 정리인 경우가 많음
    return score;
  }

  /**
   * 규칙 기반 요약 — 원문에서 문장을 골라낸다 (새로 쓰지 않는다).
   * 상담 유형·대상, 학부모 요청사항, 학원 답변, 후속조치는 별도 줄로 덧붙인다.
   */
  function summarizeRuleBased(counsel) {
    var lines = [];

    // 1줄: 어떤 상담이었는지 (선생님이 고른 값을 그대로 옮긴 것)
    lines.push('[' + typeLabel(counsel.type) + '] ' + targetLabel(counsel.target) + ' 상담');

    // 본문에서 중요한 문장 발췌
    var sentences = toSentences(counsel.content);
    var picked = [];
    if (sentences.length) {
      var scored = sentences.map(function (t, i) {
        return { text: t, index: i, score: scoreSentence(t, i, sentences.length) };
      });
      var room = MAX_LINES - lines.length
        - (trim(counsel.parentRequest) ? 1 : 0)
        - (trim(counsel.academyReply) ? 1 : 0)
        - (counsel.followUp && counsel.followUp.needed && trim(counsel.followUp.text) ? 1 : 0);
      var take = Math.max(1, Math.min(room, sentences.length));
      picked = scored.slice()
        .sort(function (a, b) { return b.score - a.score || a.index - b.index; })
        .slice(0, take)
        .sort(function (a, b) { return a.index - b.index; })       // 원문 순서대로 되돌린다
        .map(function (x) { return x.text; });
      picked.forEach(function (t) { lines.push(t); });
    }

    if (trim(counsel.parentRequest)) lines.push('학부모 요청: ' + trim(counsel.parentRequest));
    if (trim(counsel.academyReply)) lines.push('학원 답변: ' + trim(counsel.academyReply));
    if (counsel.followUp && counsel.followUp.needed && trim(counsel.followUp.text)) {
      lines.push('후속조치: ' + trim(counsel.followUp.text));
    }

    return clampLines(lines);
  }

  /** 3~5줄로 맞춘다. 원문이 짧아 3줄이 안 되면 억지로 채우지 않는다. */
  function clampLines(lines) {
    var out = lines.map(trim).filter(Boolean);
    if (out.length > MAX_LINES) out = out.slice(0, MAX_LINES);
    return out;
  }

  /** 각 줄을 읽기 좋게 자른다 (너무 길면 화면에서 문단처럼 보인다) */
  function formatLines(lines) {
    return clampLines(lines).map(function (l) { return '· ' + l.replace(/^[-·*•]\s*/, ''); }).join('\n');
  }

  // ───────────────────────── AI 요약 ─────────────────────────

  function buildAIPrompt(counsel) {
    var facts = [
      '학생명: ' + (counsel.studentName || ''),
      '상담일: ' + (counsel.date || ''),
      '상담 대상: ' + targetLabel(counsel.target),
      '상담 유형: ' + typeLabel(counsel.type),
      '상담 교사: ' + (trim(counsel.counselor) || '(입력 없음)'),
      '',
      '[상담 내용 원문]',
      trim(counsel.content) || '(입력 없음)',
      '',
      '[학부모 요청사항]',
      trim(counsel.parentRequest) || '(입력 없음)',
      '',
      '[학원 답변]',
      trim(counsel.academyReply) || '(입력 없음)',
      '',
      '[후속조치]',
      (counsel.followUp && counsel.followUp.needed ? (trim(counsel.followUp.text) || '(내용 없음)') : '(해당 없음)')
    ].join('\n');

    var system = [
      '당신은 학원 상담 기록을 요약하는 보조 도구입니다.',
      '선생님이 나중에 빠르게 훑어볼 수 있도록 상담 내용을 짧게 정리합니다.',
      '',
      '## 절대 규칙',
      '1. 아래 원문에 없는 내용을 절대 만들어내지 마십시오.',
      '2. 원문에 없는 점수, 등급, 등수, 날짜, 금액, 사람 이름, 학교명을 쓰지 마십시오.',
      '3. 학생이나 학부모에 대한 평가·추측을 쓰지 마십시오. (예: "학부모가 예민해 보입니다")',
      '4. 상담에서 결정되지 않은 약속이나 계획을 만들어 쓰지 마십시오.',
      '5. 숫자와 고유명사는 원문 그대로 옮기십시오.',
      '',
      '## 요약 방식',
      '- 3줄 이상 5줄 이하로 씁니다. 원문이 짧으면 3줄 미만이어도 됩니다.',
      '- 한 줄은 한 가지 사실만 담고, 60자 안팎으로 짧게 씁니다.',
      '- 순서: 상담 주제 → 오간 이야기 → 학부모 요청 → 학원 답변 → 후속조치.',
      '- 학부모 요청사항과 학원 답변이 있으면 반드시 각각 한 줄로 남깁니다.',
      '- 사실만 담백하게 적습니다. 칭찬이나 위로하는 말을 덧붙이지 않습니다.',
      '',
      '## 출력 형식',
      '다른 설명 없이 아래 JSON만 출력하십시오.',
      '{"lines":["첫째 줄","둘째 줄","셋째 줄"]}'
    ].join('\n');

    return { system: system, user: facts + '\n\n위 내용만 사용해 JSON을 출력하십시오.' };
  }

  /** 요약이 원문 범위를 벗어났는지 검사 */
  function verifySummary(lines, counsel) {
    var source = [
      counsel.content, counsel.parentRequest, counsel.academyReply,
      counsel.followUp && counsel.followUp.text,
      counsel.studentName, counsel.counselor, counsel.className,
      counsel.date, counsel.nextCheckDate,
      targetLabel(counsel.target), typeLabel(counsel.type)
    ].join(' ');

    var body = (Array.isArray(lines) ? lines : String(lines || '').split('\n'))
      .map(function (l) { return trim(l).replace(/^[-·*•]\s*/, ''); })
      .filter(Boolean).join('\n');

    var result = global.FeedbackEngine.verify(body, { input: { progress: source } });

    // 줄 수 규칙도 함께 확인한다
    var count = body ? body.split('\n').length : 0;
    if (count > MAX_LINES) {
      result.warnings = result.warnings.concat([{
        type: 'length', token: String(count),
        message: '요약이 ' + count + '줄입니다. ' + MAX_LINES + '줄 이내로 줄여 주세요.'
      }]);
    }
    return result;
  }

  global.CounselEngine = {
    MIN_LINES: MIN_LINES,
    MAX_LINES: MAX_LINES,
    targetLabel: targetLabel,
    typeLabel: typeLabel,
    toSentences: toSentences,
    summarizeRuleBased: summarizeRuleBased,
    formatLines: formatLines,
    clampLines: clampLines,
    buildAIPrompt: buildAIPrompt,
    verifySummary: verifySummary
  };
})(window);
