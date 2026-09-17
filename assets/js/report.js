/**
 * report.js — 월간 학습 리포트 집계 및 초안 생성
 *
 * 한 달치 수업 기록 · 숙제 기록 · 상담 기록을 모아 리포트 초안을 만든다.
 *
 * 지켜야 할 규칙 4가지
 *  1. 같은 내용을 반복하지 않는다
 *     → 같은 진도가 8회 나와도 한 줄로 묶고 "(3회)"처럼 횟수만 붙인다.
 *       리포트 전체에서 같은 문장이 두 번 나오지 않도록 걸러낸다.
 *  2. 데이터에 없는 내용을 만들지 않는다
 *     → 모든 문장은 저장된 기록에서 뽑아낸 것이다. 새로 쓰지 않는다.
 *  3. 지나친 평가 표현을 피한다
 *     → "훌륭합니다" 같은 말 대신 "8회 중 6회"처럼 숫자로 적는다.
 *  4. 교사가 최종 수정할 수 있다
 *     → 5개 문단을 따로 저장해 화면에서 각각 고칠 수 있게 한다.
 */
(function (global) {
  'use strict';

  function trim(v) { return String(v == null ? '' : v).trim(); }

  /** 비교용으로 다듬는다 (띄어쓰기·문장부호 차이는 같은 내용으로 본다) */
  function normKey(text) {
    return String(text || '').replace(/\s+/g, '').replace(/[.,·\-—~()\[\]"'`]/g, '').toLowerCase();
  }

  /**
   * 같은 문장이 리포트에 두 번 나오지 않게 막는 도구 (규칙 1).
   * 한 번 쓴 문장은 다시 통과시키지 않는다.
   */
  function makeDeduper() {
    var seen = {};
    return function accept(text) {
      var key = normKey(text);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    };
  }

  /** 같은 항목을 묶고 몇 번 나왔는지 센다 (규칙 1) */
  function tally(list) {
    var map = {}, order = [];
    (list || []).forEach(function (raw) {
      var text = trim(raw);
      if (!text) return;
      var key = normKey(text);
      if (!map[key]) { map[key] = { text: text, count: 0 }; order.push(key); }
      map[key].count++;
    });
    return order.map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  /** 여러 번 나온 항목에만 횟수를 붙인다 (1회짜리에 "(1회)"는 군더더기) */
  function withCount(item) {
    return item.count > 1 ? item.text + ' (' + item.count + '회)' : item.text;
  }

  // ───────────────────────── 집계 ─────────────────────────

  /**
   * 한 달치 기록을 모아 숫자로 정리한다.
   * @returns {{ lessons, homeworks, counsels, stats }}
   */
  function collect(studentId, period) {
    var Store = global.Store;
    var lessons = Store.getLessons({ studentId: studentId, from: period.from, to: period.to });
    var homeworks = Store.getHomeworks({ studentId: studentId, from: period.from, to: period.to });
    var counsels = Store.getCounsels({ studentId: studentId, from: period.from, to: period.to });

    // 이해도 분포
    var levelCounts = {};
    Store.UNDERSTANDING_LEVELS.forEach(function (l) { levelCounts[l.code] = 0; });
    lessons.forEach(function (l) {
      var code = trim(l.input && l.input.understanding);
      if (levelCounts[code] != null) levelCounts[code]++;
    });
    var goodCount = levelCounts.excellent + levelCounts.good;
    var lowCount = levelCounts.needs_work + levelCounts.weak;

    // 진도 · 보완 항목을 항목 단위로 쪼개 묶는다
    var progressItems = [], improveItems = [], noteItems = [];
    lessons.forEach(function (l) {
      var inp = l.input || {};
      global.FeedbackEngine.toItems(inp.progress).forEach(function (t) { progressItems.push(t); });
      global.FeedbackEngine.toItems(inp.improve).forEach(function (t) { improveItems.push(t); });
      if (trim(inp.understandingNote)) noteItems.push(trim(inp.understandingNote));
    });

    // 숙제 집계
    var hwTotal = 0, hwDone = 0, hwChecked = 0, hwPending = [];
    homeworks.forEach(function (h) {
      var items = (h.base || []).concat(h.extra || []);
      items.forEach(function (i) {
        hwTotal++;
        if (i.done) hwDone++;
        else hwPending.push(i.text);
      });
      if (h.teacherCheck && h.teacherCheck.checked) hwChecked++;
    });

    return {
      lessons: lessons, homeworks: homeworks, counsels: counsels,
      stats: {
        lessonCount: lessons.length,
        levelCounts: levelCounts,
        goodCount: goodCount,
        lowCount: lowCount,
        progress: tally(progressItems),
        improve: tally(improveItems),
        notes: tally(noteItems),
        homework: {
          records: homeworks.length,
          totalItems: hwTotal,
          doneItems: hwDone,
          rate: hwTotal ? Math.round(hwDone / hwTotal * 100) : null,
          checkedRecords: hwChecked,
          pending: tally(hwPending)
        },
        counsels: counsels.map(function (c) {
          return {
            date: c.date,
            type: global.CounselEngine.typeLabel(c.type),
            reply: trim(c.academyReply),
            request: trim(c.parentRequest),
            followUp: (c.followUp && c.followUp.needed && !c.followUp.done) ? trim(c.followUp.text) : ''
          };
        })
      }
    };
  }

  /** 근거로 삼은 기록을 남긴다 (원본 기간과 함께 저장하기 위해) */
  function buildSource(data, period) {
    return {
      lessonIds: data.lessons.map(function (l) { return l.id; }),
      homeworkIds: data.homeworks.map(function (h) { return h.id; }),
      counselIds: data.counsels.map(function (c) { return c.id; }),
      counts: {
        lessons: data.lessons.length,
        homeworks: data.homeworks.length,
        counsels: data.counsels.length
      },
      from: period.from, to: period.to,
      collectedAt: new Date().toISOString()
    };
  }

  // ───────────────────────── 문단 생성 ─────────────────────────

  var MAX_ITEMS = 5;   // 한 문단에 너무 많이 넣으면 읽히지 않는다

  /**
   * 5개 문단을 만든다.
   * 모든 문장은 집계 결과에서 나온 것이며, 없는 내용을 채우지 않는다 (규칙 2).
   */
  function buildSections(studentName, period, data, extra) {
    extra = extra || {};
    var st = data.stats;
    var accept = makeDeduper();      // 리포트 전체에서 같은 문장을 막는다 (규칙 1)
    var out = {};

    function lines(arr) {
      return arr.filter(function (t) { return trim(t) && accept(t); }).join('\n');
    }
    function bullets(items, mapper) {
      return items.slice(0, MAX_ITEMS).map(mapper || withCount)
        .filter(function (t) { return trim(t) && accept(t); })
        .map(function (t) { return '· ' + t; }).join('\n');
    }

    // [1] 이번 달 학습 내용 — 수업 횟수와 주요 진도
    var l1 = [];
    if (st.lessonCount > 0) {
      l1.push(period.label + '에 총 ' + st.lessonCount + '회 수업을 진행했습니다.');
      var prog = bullets(st.progress);
      if (prog) { l1.push('주요 진도'); l1.push(prog); }
    } else {
      l1.push(period.label + '에 저장된 수업 기록이 없습니다.');
    }
    out.learning = lines(l1);

    // [2] 잘한 점 — 평가하는 말 대신 기록된 숫자로 (규칙 3)
    var l2 = [];
    if (st.lessonCount > 0 && st.goodCount > 0) {
      l2.push('이해도가 ‘우수’ 이상으로 기록된 수업이 ' + st.lessonCount + '회 중 ' + st.goodCount + '회입니다.');
    }
    if (st.homework.totalItems > 0 && st.homework.rate != null && st.homework.doneItems > 0) {
      l2.push('숙제는 배정된 ' + st.homework.totalItems + '개 중 ' + st.homework.doneItems +
              '개를 완료했습니다. (' + st.homework.rate + '%)');
    }
    if (st.homework.checkedRecords > 0) {
      l2.push('교사가 확인한 숙제가 ' + st.homework.checkedRecords + '회 기록되어 있습니다.');
    }
    out.strengths = lines(l2) || '이번 달 기록에서 따로 집계된 내용이 없습니다.';

    // [3] 보완할 점 — 선생님이 적은 보완 사항만 (반복된 것은 횟수 표시)
    var l3 = [];
    if (st.improve.length) {
      l3.push('수업 기록에 남은 보완 사항입니다.');
      l3.push(bullets(st.improve));
    }
    if (st.lowCount > 0) {
      l3.push('이해도가 ‘보완 필요’ 이하로 기록된 수업이 ' + st.lowCount + '회입니다.');
    }
    out.improvements = lines(l3) || '이번 달 기록에 남은 보완 사항이 없습니다.';

    // [4] 학습 습관 · 숙제
    var l4 = [];
    if (st.homework.records > 0) {
      l4.push('숙제를 ' + st.homework.records + '회 배정했습니다.');
      if (st.homework.rate != null) {
        l4.push('완료율은 ' + st.homework.rate + '%입니다. (' + st.homework.doneItems + '/' + st.homework.totalItems + '개)');
      }
      if (st.homework.pending.length) {
        l4.push('아직 완료로 표시되지 않은 숙제입니다.');
        l4.push(bullets(st.homework.pending));
      }
    } else {
      l4.push(period.label + '에 배정된 숙제 기록이 없습니다.');
    }
    out.habit = lines(l4);

    // [부가] 상담 · 특이사항 — 상담 기록이 있을 때만
    var l5 = [];
    st.counsels.forEach(function (c) {
      var head = c.date + ' ' + c.type + ' 진행';
      l5.push(head);
      if (c.request) l5.push('학부모 요청: ' + c.request);
      if (c.reply) l5.push('학원 답변: ' + c.reply);
    });
    out.counsel = lines(l5);

    // [5] 다음 달 목표 — 이번 달 기록에서 끌어낼 수 있는 것만 (규칙 2)
    var l6 = [];
    st.improve.slice(0, 2).forEach(function (item) {
      l6.push('· ' + item.text + ' — 다음 달 수업에서 반복 연습');
    });
    if (st.homework.pending.length) {
      l6.push('· 이번 달 완료하지 못한 숙제 ' + st.homework.pending.length + '개 마무리');
    }
    st.counsels.forEach(function (c) {
      if (c.followUp) l6.push('· 상담 후속조치: ' + c.followUp);
    });
    if (extra.upcomingExam) {
      var ex = extra.upcomingExam;
      l6.push('· ' + global.FeedbackEngine.formatDate(ex.examDate) + ' ' +
              [ex.school, ex.grade, ex.term].filter(Boolean).join(' ') + ' 대비');
    }
    out.goal = lines(l6) ||
      '이번 달 기록에서 끌어낼 수 있는 목표가 없습니다. 선생님이 직접 적어 주세요.';

    return out;
  }

  var SECTION_ORDER = [
    { key: 'learning',     title: '이번 달 학습 내용' },
    { key: 'strengths',    title: '잘한 점' },
    { key: 'improvements', title: '보완할 점' },
    { key: 'habit',        title: '학습 습관 · 숙제' },
    { key: 'counsel',      title: '상담 · 특이사항' },
    { key: 'goal',         title: '다음 달 목표' }
  ];

  /** 문단을 합쳐 최종 리포트 문장을 만든다 */
  function composeText(report, sections, settings) {
    settings = settings || {};
    var lines = [];
    lines.push('[' + (report.studentName || '학생') + ' 학생 ' + report.period.label + ' 학습 리포트]');
    var head = [report.className, report.period.from + ' ~ ' + report.period.to].filter(Boolean).join(' · ');
    lines.push(head);
    lines.push('');

    SECTION_ORDER.forEach(function (sec) {
      var body = trim(sections[sec.key]);
      if (!body) return;                     // 내용이 없는 문단은 아예 넣지 않는다
      lines.push('■ ' + sec.title);
      lines.push(body);
      lines.push('');
    });

    var sign = trim(settings.signature) || trim(settings.academyName);
    if (sign) lines.push('- ' + sign);

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ───────────────────────── 검증 ─────────────────────────

  /**
   * 리포트가 원본 기록 범위를 벗어났는지, 같은 문장이 반복되지는 않는지,
   * 지나친 평가 표현이 들어가지 않았는지 검사한다.
   */
  function verify(sections, data, report, extra) {
    extra = extra || {};
    var st = data.stats;
    var source = [];
    data.lessons.forEach(function (l) {
      var i = l.input || {};
      source.push(i.progress, i.understandingNote, i.improve, i.homework, i.memo, l.teacher, l.date);
    });
    data.homeworks.forEach(function (h) {
      (h.base || []).concat(h.extra || []).forEach(function (it) { source.push(it.text); });
      source.push(h.teacher, h.className, h.date, h.dueDate);
    });
    data.counsels.forEach(function (c) {
      source.push(c.content, c.parentRequest, c.academyReply, c.date,
                  c.followUp && c.followUp.text);
    });
    source.push(report.studentName, report.className, report.period.label,
                report.period.from, report.period.to);
    // 다음 달 목표에 넣은 시험 정보도 근거에 포함해야 한다
    if (extra.upcomingExam) {
      var ux = extra.upcomingExam;
      source.push(ux.school, ux.grade, ux.term, ux.examDate,
                  global.FeedbackEngine.formatDate(ux.examDate));
    }
    global.Store.UNDERSTANDING_LEVELS.forEach(function (l) { source.push(l.label); });
    global.Store.COUNSEL_TYPES.forEach(function (t) { source.push(t.label); });

    // 앱이 스스로 계산해 넣는 숫자는 정상이므로 원본에 더해 둔다
    var calc = [st.lessonCount, st.goodCount, st.lowCount,
                st.homework.records, st.homework.totalItems, st.homework.doneItems,
                st.homework.rate, st.homework.checkedRecords, st.homework.pending.length];
    st.progress.forEach(function (i) { calc.push(i.count); });
    st.improve.forEach(function (i) { calc.push(i.count); });
    st.homework.pending.forEach(function (i) { calc.push(i.count); });

    var body = SECTION_ORDER.map(function (s) { return trim(sections[s.key]); })
      .filter(Boolean).join('\n');

    var result = global.FeedbackEngine.verify(body, {
      input: { progress: source.filter(Boolean).join(' ') + ' ' + calc.join(' ') }
    });

    // 같은 문장이 반복되지 않는지 (규칙 1)
    var seen = {}, dup = [];
    body.split('\n').forEach(function (line) {
      var t = trim(line).replace(/^·\s*/, '');
      if (!t) return;
      var k = normKey(t);
      if (seen[k]) { if (dup.indexOf(t) === -1) dup.push(t); }
      seen[k] = true;
    });
    dup.forEach(function (t) {
      result.warnings.push({ type: 'duplicate', token: t, message: '"' + t + '" 이(가) 두 번 나옵니다.' });
    });

    return result;
  }

  /** 초안 전체를 한 번에 만든다 */
  function generate(student, period, settings, extra) {
    var data = collect(student.id, period);
    var report = {
      studentName: student.name,
      className: trim(student.className),
      period: period
    };
    var sections = buildSections(student.name, period, data, extra);
    var text = composeText(report, sections, settings);
    return {
      data: data,
      source: buildSource(data, period),
      stats: data.stats,
      sections: sections,
      text: text,
      check: verify(sections, data, report, extra)
    };
  }

  global.ReportEngine = {
    SECTION_ORDER: SECTION_ORDER,
    normKey: normKey,
    makeDeduper: makeDeduper,
    tally: tally,
    withCount: withCount,
    collect: collect,
    buildSource: buildSource,
    buildSections: buildSections,
    composeText: composeText,
    verify: verify,
    generate: generate
  };
})(window);
