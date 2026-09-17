/**
 * homework.js — 숙제 문장 생성
 *
 * 피드백과 같은 원칙을 따른다.
 *  - 선생님이 입력한 숙제 내용만 쓴다 (없는 숙제를 만들지 않는다).
 *  - 기본 숙제와 오늘 추가 숙제를 항목으로 분리해 한 줄에 하나씩 적는다.
 *  - 완료 현황은 체크된 개수를 그대로 쓴다. 평가하는 말을 덧붙이지 않는다.
 */
(function (global) {
  'use strict';

  var STATE_LABEL = {
    none:  '항목 없음',
    todo:  '미완료',
    doing: '진행중',
    done:  '완료'
  };

  function trim(v) { return String(v == null ? '' : v).trim(); }

  function fmt(iso) { return global.FeedbackEngine.formatDate(iso); }

  /** 숙제 항목 배열 → "· 내용" 목록 (완료된 항목은 표시를 붙인다) */
  function itemLines(items, showDone) {
    return (items || [])
      .filter(function (i) { return trim(i.text); })
      .map(function (i) {
        return '· ' + trim(i.text) + (showDone && i.done ? ' (완료)' : '');
      })
      .join('\n');
  }

  /**
   * 학부모에게 보낼 숙제 안내 문장을 만든다.
   * @param opts.showProgress  완료 현황을 넣을지 (기본: 완료한 항목이 있으면 넣음)
   */
  function buildMessage(hw, settings, opts) {
    settings = settings || {};
    opts = opts || {};
    var sum = global.Store.summarize(hw);
    var lines = [];

    lines.push('[' + (hw.studentName || '학생') + ' 학생 숙제 안내]');
    var head = fmt(hw.date);
    if (hw.className) head += ' · ' + hw.className;
    if (hw.teacher) head += ' · 담당 ' + hw.teacher;
    lines.push(head);
    lines.push('');

    function block(title, body) {
      if (!trim(body)) return;
      lines.push('■ ' + title);
      lines.push(trim(body));
      lines.push('');
    }

    var showDone = opts.showProgress !== false && sum.done > 0;

    block('기본 숙제', itemLines(hw.base, showDone));
    block('오늘 추가 숙제', itemLines(hw.extra, showDone));

    if (hw.dueDate) block('제출 예정일', fmt(hw.dueDate) + '까지');

    // 완료 현황은 체크된 개수를 사실 그대로만 적는다
    if (showDone && sum.total > 0) {
      block('진행 상황', '전체 ' + sum.total + '개 중 ' + sum.done + '개 완료' +
        (sum.remain > 0 ? ' (남은 항목 ' + sum.remain + '개)' : ''));
    }

    // 교사 확인은 실제로 확인한 경우에만 적는다
    if (hw.teacherCheck && hw.teacherCheck.checked) {
      var checkLine = '담당 교사가 숙제를 확인했습니다.';
      if (trim(hw.teacherCheck.note)) checkLine += '\n' + trim(hw.teacherCheck.note);
      block('교사 확인', checkLine);
    }

    if (sum.total > 0 && sum.state !== 'done') {
      lines.push('가정에서도 확인 부탁드립니다.');
      lines.push('');
    }

    var sign = trim(settings.signature) || trim(settings.academyName);
    if (sign) lines.push('- ' + sign);

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * 숙제 문장이 입력 범위를 벗어났는지 검사한다.
   * 숙제는 쪽수·범위 숫자가 많아 잘못 옮기면 바로 사고가 나므로,
   * 문장에 쓰인 숫자와 영어가 모두 원본 항목에 있는지 확인한다.
   */
  function verifyMessage(text, hw) {
    var source = (hw.base || []).concat(hw.extra || [])
      .map(function (i) { return i.text; })
      .concat([hw.studentName, hw.teacher, hw.className, hw.date, hw.dueDate,
               (hw.teacherCheck && hw.teacherCheck.note) || ''])
      .join(' ');

    var sum = global.Store.summarize(hw);
    // 앱이 스스로 넣는 숫자(날짜·개수)는 정상이므로 원본에 더해 둔다
    source += ' ' + sum.total + ' ' + sum.done + ' ' + sum.remain;

    var body = String(text || '').split('\n').filter(function (line) {
      var t = line.trim();
      if (!t) return false;
      if (/^\[.*\]$/.test(t)) return false;   // [○○ 학생 숙제 안내]
      if (/^■/.test(t)) return false;         // ■ 소제목
      if (/^-\s/.test(t)) return false;       // - 학원 서명
      return true;
    }).join('\n');

    return global.FeedbackEngine.verify(body, { input: { progress: source } });
  }

  global.HomeworkEngine = {
    STATE_LABEL: STATE_LABEL,
    itemLines: itemLines,
    buildMessage: buildMessage,
    verifyMessage: verifyMessage
  };
})(window);
