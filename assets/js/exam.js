/**
 * exam.js — 시험 전 최종 체크리스트 생성
 *
 * 학교 공통 시험 정보(exam)와 학생별 준비 기록(prep)을 합쳐
 * "이 학생이 시험 전에 아직 해야 할 일"만 뽑아낸다.
 *
 * 다른 문장 생성기와 같은 원칙을 따른다.
 *  - 선생님이 체크한 상태와 입력한 내용만 쓴다.
 *  - 없는 단원·문법을 만들어내지 않는다.
 *  - 이미 끝낸 항목은 넣지 않는다. (남은 일만 보여야 쓸모가 있다)
 */
(function (global) {
  'use strict';

  function trim(v) { return String(v == null ? '' : v).trim(); }
  function fmt(iso) { return global.FeedbackEngine.formatDate(iso); }

  function stateLabel(code) {
    var f = (global.Store.PREP_STATES || []).filter(function (s) { return s.code === code; })[0];
    return f ? f.label : '시작 전';
  }

  /** D-day 를 사람이 읽는 말로 */
  function ddayLabel(dday) {
    if (dday == null) return '';
    if (dday > 0) return 'D-' + dday;
    if (dday === 0) return 'D-DAY (오늘)';
    return '시험일 ' + (-dday) + '일 지남';
  }

  /**
   * 시험 전 최종 체크리스트 (기능 5).
   * @param opts.includeDone  true 면 끝낸 항목도 함께 적는다 (기본: 남은 것만)
   */
  function buildChecklist(exam, prep, settings, opts) {
    settings = settings || {};
    opts = opts || {};
    var sum = global.Store.prepProgress(exam, prep);
    var dday = global.Store.examDday(exam);
    var lines = [];

    lines.push('[' + (prep.studentName || '학생') + ' 학생 시험 대비 체크리스트]');
    var head = [exam.school, exam.grade, exam.term].filter(Boolean).join(' ');
    lines.push(head);
    lines.push(fmt(exam.examDate) + ' · ' + ddayLabel(dday));
    if (trim(exam.textbook)) lines.push('교과서 ' + trim(exam.textbook));
    if (trim(prep.targetScore)) lines.push('목표 점수 ' + trim(prep.targetScore) + '점');
    lines.push('');
    lines.push('준비 ' + sum.done + '/' + sum.total + ' 완료 (' + sum.percent + '%)');
    lines.push('');

    function block(title, items) {
      var body = (items || []).filter(Boolean);
      if (!body.length) return;
      lines.push('■ ' + title);
      body.forEach(function (t) { lines.push('· ' + t); });
      lines.push('');
    }

    // 아직 끝내지 못한 단원 준비 / 본문 암기 (기능 4 — 미완료 강조)
    var unitPending = sum.pending.filter(function (p) { return p.kind === '단원 준비'; })
      .map(function (p) { return p.unit + ' (' + stateLabel(p.state) + ')'; });
    var memoPending = sum.pending.filter(function (p) { return p.kind === '본문 암기'; })
      .map(function (p) { return p.unit + ' (' + stateLabel(p.state) + ')'; });

    block('아직 남은 단원 준비', unitPending);
    block('아직 남은 본문 암기', memoPending);

    // 취약 문법 — 시험 문법 범위 중 선생님이 고른 것만
    var grammarNames = (exam.grammarPoints || [])
      .filter(function (g) { return (prep.weakGrammar || []).indexOf(g.id) !== -1; })
      .map(function (g) { return g.name; });
    if (trim(prep.weakGrammarNote)) grammarNames.push(trim(prep.weakGrammarNote));
    block('집중해야 할 문법', grammarNames);

    // 오답
    if (Number(prep.wrongCount || 0) > 0) {
      block('오답 정리', ['오답 ' + Number(prep.wrongCount) + '문항 — 시험 전 다시 풀어 보기']);
    }

    // 보강
    if (prep.needsExtra) {
      block('보강', [trim(prep.extraNote) || '보강이 필요한 상태로 표시되어 있습니다.']);
    }

    // 수행평가·서술형은 학교 공통 정보 그대로
    if (trim(exam.performance)) block('수행평가 · 서술형', [trim(exam.performance)]);
    if (trim(exam.rangeNote)) block('시험범위 참고', [trim(exam.rangeNote)]);

    if (opts.includeDone) {
      var doneItems = [];
      (exam.units || []).forEach(function (u) {
        if ((prep.units || {})[u.id] === 'done') doneItems.push(u.name + ' 단원 준비');
        if ((prep.memorize || {})[u.id] === 'done') doneItems.push(u.name + ' 본문 암기');
      });
      block('이미 끝낸 항목', doneItems);
    }

    if (sum.total > 0 && sum.remain === 0 && !grammarNames.length && !Number(prep.wrongCount || 0) && !prep.needsExtra) {
      lines.push('표시된 준비 항목을 모두 끝냈습니다.');
      lines.push('');
    }

    var sign = trim(settings.signature) || trim(settings.academyName);
    if (sign) lines.push('- ' + sign);

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** 체크리스트가 입력 범위를 벗어났는지 검사 */
  function verifyChecklist(text, exam, prep) {
    var source = []
      .concat((exam.units || []).map(function (u) { return u.name; }))
      .concat((exam.grammarPoints || []).map(function (g) { return g.name; }))
      .concat([exam.school, exam.grade, exam.term, exam.textbook, exam.examDate,
               exam.performance, exam.rangeNote,
               prep.studentName, prep.targetScore, prep.weakGrammarNote, prep.extraNote,
               String(prep.wrongCount || 0)])
      .join(' ');

    var sum = global.Store.prepProgress(exam, prep);
    var dday = global.Store.examDday(exam);
    // 앱이 스스로 계산해 넣는 숫자는 정상이므로 원본에 더해 둔다
    source += ' ' + sum.done + ' ' + sum.total + ' ' + sum.percent + ' ' + (dday == null ? '' : Math.abs(dday));

    var body = String(text || '').split('\n').filter(function (line) {
      var t = line.trim();
      if (!t) return false;
      if (/^\[.*\]$/.test(t)) return false;
      if (/^■/.test(t)) return false;
      if (/^-\s/.test(t)) return false;
      if (/^\d{4}년\s*\d+월\s*\d+일/.test(t)) return false;
      return true;
    }).join('\n');

    return global.FeedbackEngine.verify(body, { input: { progress: source } });
  }

  global.ExamEngine = {
    stateLabel: stateLabel,
    ddayLabel: ddayLabel,
    buildChecklist: buildChecklist,
    verifyChecklist: verifyChecklist
  };
})(window);
