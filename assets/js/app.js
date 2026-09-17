/**
 * app.js — 화면 동작 전체 (주소창 뒤 #으로 화면을 바꾸는 방식)
 *
 * 화면 목록
 *   #/home            홈(요약)
 *   #/students        학생 목록
 *   #/student/new     학생 추가
 *   #/student/:id     학생 수정
 *   #/lesson/new      수업 기록 작성
 *   #/lesson/:id/edit 수업 기록 수정
 *   #/lessons         기록·피드백 목록
 *   #/feedback/:id    피드백 생성/편집/확정
 *   #/settings        설정
 */
(function (global) {
  'use strict';

  var view = document.getElementById('view');
  var appTitle = document.getElementById('appTitle');
  var appSub = document.getElementById('appSub');
  var backBtn = document.getElementById('backBtn');
  var toastEl = document.getElementById('toast');

  var LEVELS = Store.UNDERSTANDING_LEVELS;
  var STATUS = Store.FEEDBACK_STATUS;

  // ───────────────────────── 공통 도우미 ─────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var toastTimer = null;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind ? ' toast--' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 2600);
  }

  function confirmBox(text, okLabel) {
    return new Promise(function (resolve) {
      var modal = document.getElementById('confirmModal');
      document.getElementById('confirmText').textContent = text;
      var ok = document.getElementById('confirmOk');
      var cancel = document.getElementById('confirmCancel');
      ok.textContent = okLabel || '확인';
      modal.hidden = false;

      function close(result) {
        modal.hidden = true;
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk() { close(true); }
      function onCancel() { close(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  function $(sel, root) { return (root || view).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || view).querySelectorAll(sel)); }

  function go(hash) { global.location.hash = hash; }

  /** 글이 길어지면 입력칸 높이를 자동으로 늘린다 (모바일에서 내용이 잘리지 않도록) */
  function autoGrow(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight + 2, 72) + 'px';
  }

  function bindAutoGrow(root) {
    $$('textarea', root).forEach(function (ta) {
      autoGrow(ta);
      ta.addEventListener('input', function () { autoGrow(ta); });
    });
  }

  function setHeader(title, sub, showBack) {
    appTitle.textContent = title;
    appSub.textContent = sub || '';
    backBtn.hidden = !showBack;
  }

  function levelLabel(code) {
    var f = LEVELS.filter(function (l) { return l.code === code; })[0];
    return f ? f.label : '미입력';
  }

  function statusBadge(st) {
    var s = STATUS[st] || STATUS.draft;
    return '<span class="badge badge--' + s.code + '">' + esc(s.label) + '</span>';
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  // ───────────────────────── 홈 ─────────────────────────

  function renderHome() {
    setHeader('수업 피드백', Store.getSettings().academyName, false);
    var st = Store.getStats();
    var recent = Store.getLessons().slice(0, 5);

    var html = '';
    html += '<div class="stats">';
    html += '<div class="stat"><span class="stat__num">' + st.lessonsToday + '</span><span class="stat__label">오늘 기록</span></div>';
    html += '<div class="stat ' + (st.pending ? 'stat--alert' : '') + '"><span class="stat__num">' + st.pending + '</span><span class="stat__label">미확정 피드백</span></div>';
    html += '<div class="stat"><span class="stat__num">' + st.students + '</span><span class="stat__label">등록 학생</span></div>';
    html += '<div class="stat"><span class="stat__num">' + st.lessonsTotal + '</span><span class="stat__label">전체 기록</span></div>';
    html += '</div>';

    html += '<div class="btn-row">';
    // 홈의 네 버튼은 각 화면으로 가는 길이라 테두리형으로 둔다.
    // 꽉 찬 네이비는 각 화면의 실제 실행 버튼(저장·생성·확정)에만 쓴다.
    html += '<a class="btn btn--ghost" href="#/lesson/new">수업 기록</a>';
    html += '<a class="btn btn--ghost" href="#/homework/new">숙제 배정</a>';
    html += '<a class="btn btn--ghost" href="#/counsel/new">상담 기록</a>';
    html += '<a class="btn btn--ghost" href="#/reports">월간 리포트</a>';
    html += '</div>';

    // 시험 대비 — 다가오는 시험과 남은 기간 (기능 3)
    var exams = Store.getExams({ upcoming: true });
    html += '<div class="card" style="margin-top:14px"><h3 class="card__title">시험 대비' +
            '<a href="#/exams" style="float:right;font-size:12.5px;font-weight:600;color:var(--brand)">전체 보기</a></h3>';
    if (!exams.length) {
      html += '<div class="list__meta" style="margin-bottom:12px">등록된 시험 정보가 없습니다.</div>';
      html += '<a class="btn btn--sm btn--block" href="#/exam/new">+ 학교 시험 정보 등록</a>';
    } else {
      html += exams.slice(0, 3).map(function (ex) {
        var studs = Store.getExamStudents(ex.id);
        var ready = studs.filter(function (st) {
          return Store.prepProgress(ex, Store.getPrep(ex.id, st.id)).ready;
        }).length;
        return '<a class="list__item" href="#/exam/' + esc(ex.id) + '" style="margin-bottom:8px">' +
          '<div class="list__row"><span class="list__name">' + esc(ex.school) + ' ' + esc(ex.grade) + ' ' + esc(ex.term) + '</span>' +
            ddayBadge(ex) + '</div>' +
          '<div class="list__meta">' + esc(FeedbackEngine.formatDate(ex.examDate)) +
            ' · 준비 완료 ' + ready + '/' + studs.length + '명</div>' +
        '</a>';
      }).join('');
      html += '<a class="btn btn--sm btn--ghost btn--block" href="#/exam/new">+ 시험 정보 등록</a>';
    }
    html += '</div>';

    // 다음 확인일이 다가온 상담 (기능 5)
    var due = Store.getUpcomingChecks(3);
    if (due.length) {
      html += '<div class="note note--warn" style="margin-top:14px"><b>곧 확인할 상담 ' + due.length + '건</b><ul>';
      html += due.slice(0, 4).map(function (c) {
        var when = c.overdue ? '<b>' + (-c.dday) + '일 지남</b>' : (c.dday === 0 ? '<b>오늘</b>' : 'D-' + c.dday);
        return '<li><a href="#/counsel/' + esc(c.id) + '">' + esc(c.studentName) + ' · ' +
               esc(cnsTypeLabel(c.type)) + '</a> — ' + when + '</li>';
      }).join('');
      html += (due.length > 4 ? '<li><a href="#/counsels">전체 보기</a></li>' : '') + '</ul></div>';
    }

    if (st.counselsFollowUp) {
      html += '<div class="note note--warn" style="margin-top:10px">후속조치가 남은 상담이 ' + st.counselsFollowUp +
              '건 있습니다. <a href="#/counsels">상담 기록 보기</a></div>';
    }

    if (st.homeworksUnchecked) {
      html += '<div class="note note--warn" style="margin-top:10px">교사 확인이 남은 숙제가 ' + st.homeworksUnchecked +
              '건 있습니다. <a href="#/homeworks">숙제 화면에서 확인하기</a></div>';
    }

    html += '<h2 class="section-title">최근 기록</h2>';
    if (!recent.length) {
      html += '<div class="empty"><span class="empty__icon">📭</span>아직 저장된 수업 기록이 없습니다.<br>위의 <b>새 수업 기록</b> 버튼으로 첫 기록을 남겨 보세요.</div>';
    } else {
      html += '<ul class="list">' + recent.map(lessonItemHTML).join('') + '</ul>';
      html += '<a class="btn btn--ghost btn--block" href="#/lessons">전체 기록 보기</a>';
    }

    if (!Store.available()) {
      html = '<div class="note note--err">이 브라우저는 데이터 저장(로컬스토리지)이 막혀 있습니다. 시크릿 모드를 끄거나 다른 브라우저를 사용해 주세요.</div>' + html;
    }
    view.innerHTML = html;
  }

  function lessonItemHTML(l) {
    var fb = l.feedback || {};
    return '<a class="list__item" href="#/feedback/' + esc(l.id) + '">' +
      '<div class="list__row">' +
        '<span class="list__name">' + esc(l.studentName) + '</span>' +
        statusBadge(fb.status) +
      '</div>' +
      '<div class="list__meta">' + esc(l.date) + ' · ' + esc(l.teacher) + ' · 이해도 ' + esc(levelLabel(l.input && l.input.understanding)) + '</div>' +
      '<div class="list__excerpt">' + esc((l.input && l.input.progress) || '') + '</div>' +
    '</a>';
  }

  // ───────────────────────── 학생 목록 ─────────────────────────

  var studentKeyword = '';
  var showArchivedStudents = false;

  function renderStudents() {
    setHeader('학생 관리', '', false);
    var list = Store.getStudents({ keyword: studentKeyword, includeArchived: showArchivedStudents });

    var html = '';
    html += '<div class="field"><input type="search" id="stuSearch" placeholder="학생 이름·학교로 검색" value="' + esc(studentKeyword) + '"></div>';
    html += '<a class="btn btn--block" href="#/student/new">+ 학생 추가</a>';
    html += '<label class="field" class="check-label check-label--help" style="margin:16px 0 10px">' +
            '<input type="checkbox" id="showArchived" style="width:auto" ' + (showArchivedStudents ? 'checked' : '') + '> 보관된 학생도 보기</label>';

    if (!list.length) {
      html += '<div class="empty"><span class="empty__icon">👥</span>' + (studentKeyword ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.') + '</div>';
    } else {
      html += '<ul class="list">' + list.map(function (s) {
        var meta = [s.school, s.grade, s.className].filter(Boolean).join(' · ');
        var count = Store.getLessons({ studentId: s.id }).length;
        var defCount = (s.defaultHomework || []).length;
        if (defCount) meta += (meta ? ' · ' : '') + '기본 숙제 ' + defCount + '개';
        var cCount = Store.getCounsels({ studentId: s.id }).length;
        if (cCount) meta += (meta ? ' · ' : '') + '상담 ' + cCount + '건';
        return '<a class="list__item" href="#/student/' + esc(s.id) + '">' +
          '<div class="list__row"><span class="list__name">' + esc(s.name) + '</span>' +
          (s.archived ? '<span class="badge badge--archived">보관</span>' : '<span class="badge">기록 ' + count + '건</span>') + '</div>' +
          (meta ? '<div class="list__meta">' + esc(meta) + '</div>' : '') +
        '</a>';
      }).join('') + '</ul>';
    }
    view.innerHTML = html;

    var search = $('#stuSearch');
    search.addEventListener('input', function () {
      studentKeyword = search.value;
      var pos = search.selectionStart;
      renderStudents();
      var s2 = $('#stuSearch');
      s2.focus();
      try { s2.setSelectionRange(pos, pos); } catch (e) {}
    });
    $('#showArchived').addEventListener('change', function (e) {
      showArchivedStudents = e.target.checked;
      renderStudents();
    });
  }

  // ───────────────────────── 학생 추가/수정 ─────────────────────────

  function renderStudentForm(id) {
    var isNew = !id;
    var s = isNew ? { name: '', school: '', grade: '', className: '', teacher: '', parentContact: '', note: '', archived: false }
                  : Store.getStudent(id);
    if (!s) { toast('학생을 찾을 수 없습니다.', 'err'); return go('#/students'); }
    setHeader(isNew ? '학생 추가' : '학생 수정', '', true);

    var html = '<form id="stuForm"><div class="card">';
    html += field('이름', '<input type="text" name="name" value="' + esc(s.name) + '" required autocomplete="off">', true);
    html += field('학교', '<input type="text" name="school" value="' + esc(s.school) + '" placeholder="예: 서해고">');
    html += field('학년', '<input type="text" name="grade" value="' + esc(s.grade) + '" placeholder="예: 고2">');
    html += field('반 / 레벨', '<input type="text" name="className" value="' + esc(s.className) + '" placeholder="예: 내신 A반 / Level 3">');
    html += field('담당 교사', '<input type="text" name="teacher" value="' + esc(s.teacher || '') + '" list="stuTeacherList" placeholder="예: 김선생">' +
      '<datalist id="stuTeacherList">' + Store.getTeachers().map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>',
      false, '수업 기록과 숙제를 만들 때 자동으로 채워집니다.');
    html += field('학부모 연락처', '<input type="text" name="parentContact" value="' + esc(s.parentContact) + '" inputmode="tel" placeholder="선택 입력">');
    html += field('비고', '<textarea name="note" placeholder="선택 입력">' + esc(s.note) + '</textarea>');
    html += '</div>';
    html += '<div class="btn-row"><button type="submit" class="btn btn--block">저장</button></div>';
    html += '</form>';

    if (!isNew) {
      // 기본 숙제 (학생에게 붙어 있는 반복 숙제) 관리
      var defaults = Store.getDefaultHomework(id);
      html += '<div class="card"><h3 class="card__title">기본 숙제 <small>매번 자동으로 불러올 반복 숙제</small></h3>';
      html += '<div id="defList">' + (defaults.length ? defaults.map(function (i) { return hwEditRow('base', i); }).join('') : hwEditRow('base', {})) + '</div>';
      html += '<div class="btn-row" style="margin-top:8px">';
      html += '<button type="button" class="btn btn--ghost btn--sm" id="addDef">+ 줄 추가</button>';
      html += '<button type="button" class="btn btn--sm" id="saveDef">기본 숙제 저장</button></div>';
      html += '<div class="note note--info" style="margin-top:12px">여기 등록한 숙제는 <b>숙제를 배정할 때 자동으로 채워집니다.</b><br>' +
              '그날그날 고친 내용은 이 기본 숙제를 바꾸지 않습니다.</div>';
      html += '</div>';

      // 이 학생의 기록으로 바로 가기
      var cnsCount = Store.getCounsels({ studentId: id }).length;
      var hwCount = Store.getHomeworks({ studentId: id }).length;
      var lesCount = Store.getLessons({ studentId: id }).length;
      html += '<div class="card"><h3 class="card__title">이 학생의 기록</h3><div class="btn-row">';
      html += '<a class="btn btn--ghost btn--sm" href="#/lessons">수업 ' + lesCount + '건</a>';
      html += '<a class="btn btn--ghost btn--sm" href="#/homeworks">숙제 ' + hwCount + '건</a>';
      html += '<a class="btn btn--ghost btn--sm" href="#/counsels?student=' + esc(id) + '">상담 ' + cnsCount + '건</a>';
      var rptCount = Store.getReports({ studentId: id }).length;
      html += '<a class="btn btn--ghost btn--sm" href="#/reports?student=' + esc(id) + '">리포트 ' + rptCount + '건</a>';
      html += '</div>';
      // 이 학생 학교·학년에 맞는 시험 (기능 1 — 자동 연결 결과를 학생 쪽에서도 보여 준다)
      var myExams = Store.getExams({ upcoming: true }).filter(function (ex) {
        if (String(s.school || '').trim() !== ex.school) return false;
        if (ex.grade && String(s.grade || '').trim() !== ex.grade) return false;
        return true;
      });
      if (myExams.length) {
        html += '<div class="btn-row" style="margin-top:8px">' + myExams.slice(0, 2).map(function (ex) {
          var d = Store.examDday(ex);
          return '<a class="btn btn--ghost btn--sm" href="#/prep/' + esc(ex.id) + '/' + esc(id) + '">' +
            esc(ex.term) + ' (' + esc(ExamEngine.ddayLabel(d)) + ')</a>';
        }).join('') + '</div>';
      }
      html += '<div class="btn-row" style="margin-top:8px">';
      html += '<a class="btn btn--sm" href="#/counsel/new?student=' + esc(id) + '">+ 상담 기록 작성</a>';
      html += '<a class="btn btn--sm" href="#/report/new?student=' + esc(id) + '">+ 월간 리포트</a>';
      html += '</div></div>';

      html += '<div class="note note--info" style="margin-top:16px">학생 정보는 삭제되지 않습니다. 더 이상 다니지 않는 학생은 <b>보관</b> 처리하면 목록에서만 숨겨지고 기록은 그대로 남습니다.</div>';
      html += '<button class="btn btn--ghost btn--block" id="archiveBtn">' + (s.archived ? '보관 해제하기' : '이 학생 보관하기') + '</button>';
    }
    view.innerHTML = html;

    $('#stuForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var data = { id: isNew ? null : id };
      fd.forEach(function (v, k) { data[k] = v; });
      var r = Store.saveStudent(data);
      if (!r.ok) return toast(r.error, 'err');
      toast('저장했습니다.', 'ok');
      go('#/students');
    });

    if (!isNew) {
      bindEditList('#defList', '#addDef', 'base');
      $('#saveDef').addEventListener('click', function () {
        var items = readEditRows('#defList');
        var r = Store.setDefaultHomework(id, items);
        if (!r.ok) return toast(r.error, 'err');
        toast(items.length ? '기본 숙제 ' + items.length + '개를 저장했습니다.' : '기본 숙제를 비웠습니다.', 'ok');
      });
    }

    var ab = $('#archiveBtn');
    if (ab) ab.addEventListener('click', function () {
      confirmBox(s.archived ? '이 학생을 다시 목록에 표시할까요?' : '이 학생을 보관할까요?\n기록은 삭제되지 않고 목록에서만 숨겨집니다.',
                 s.archived ? '보관 해제' : '보관하기').then(function (ok) {
        if (!ok) return;
        var r = Store.setStudentArchived(id, !s.archived);
        if (!r.ok) return toast(r.error, 'err');
        toast(s.archived ? '보관을 해제했습니다.' : '보관했습니다.', 'ok');
        go('#/students');
      });
    });
  }

  function field(label, control, required, hint) {
    return '<div class="field"><label>' + esc(label) +
      (required ? '<span class="req">*</span>' : '<span class="opt">(선택)</span>') +
      (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') +
      '</label>' + control + '</div>';
  }

  // ───────────────────────── 수업 기록 작성/수정 ─────────────────────────

  /**
   * 수업 기록 작성 화면에서 보여 주는 "최근 수업 기록".
   *
   * 화면에 쓰는 항목과 저장된 필드의 대응 (필드명은 바꾸지 않았다)
   *   학생명  → lesson.studentName
   *   수업일  → lesson.date
   *   진도    → lesson.input.progress
   *   숙제    → lesson.input.homework
   *   메모    → lesson.input.memo
   *
   * 최신 기록이 위에 오도록 Store.getLessons 의 정렬(날짜 내림차순)을 그대로 쓴다.
   * 수정 중인 기록은 자기 자신이므로 목록에서 뺀다.
   */
  var RECENT_LIMIT = 5;

  function renderRecentLessons(studentId, excludeId) {
    var box = $('#recentBox');
    if (!box) return;

    if (!studentId) {
      box.innerHTML = '<div class="note note--info">학생을 선택하면 그 학생의 최근 수업 기록이 여기에 표시됩니다.</div>';
      return;
    }

    var list = Store.getLessons({ studentId: studentId })
      .filter(function (l) { return l.id !== excludeId; })
      .slice(0, RECENT_LIMIT);

    if (!list.length) {
      var stu = Store.getStudent(studentId);
      box.innerHTML = '<div class="note note--info">' +
        esc((stu && stu.name) || '이 학생') + ' 학생의 저장된 수업 기록이 아직 없습니다.<br>' +
        '지금 작성하는 기록이 첫 번째가 됩니다.</div>';
      return;
    }

    function row(label, value) {
      var v = trimText(value);
      return v ? '<dt>' + label + '</dt><dd>' + esc(v) + '</dd>' : '';
    }

    box.innerHTML =
      '<div class="list__meta" style="margin-bottom:8px">최근 ' + list.length + '회 · 최신순</div>' +
      '<ul class="list">' + list.map(function (l) {
        var i = l.input || {};
        return '<li class="list__item">' +
          '<div class="list__row">' +
            '<span class="list__name">' + esc(FeedbackEngine.formatDate(l.date)) + '</span>' +
            statusBadge(l.feedback && l.feedback.status) +
          '</div>' +
          '<div class="list__meta">' + esc(l.studentName) +
            (l.teacher ? ' · ' + esc(l.teacher) : '') +
            ' · 이해도 ' + esc(levelLabel(i.understanding)) + '</div>' +
          '<dl class="kv kv--tight" style="margin-top:9px">' +
            row('진도', i.progress) + row('숙제', i.homework) + row('메모', i.memo) +
          '</dl>' +
        '</li>';
      }).join('') + '</ul>';
  }

  function trimText(v) { return String(v == null ? '' : v).trim(); }

  function renderLessonForm(id) {
    var isNew = !id;
    var lesson = isNew ? null : Store.getLesson(id);
    if (!isNew && !lesson) { toast('기록을 찾을 수 없습니다.', 'err'); return go('#/lessons'); }
    if (lesson && lesson.feedback && lesson.feedback.status === 'final') {
      toast('확정된 기록입니다. 먼저 잠금을 해제해 주세요.', 'err');
      return go('#/feedback/' + id);
    }

    var students = Store.getStudents();
    if (!students.length) {
      setHeader('수업 기록', '', true);
      view.innerHTML = '<div class="empty"><span class="empty__icon">👥</span>먼저 학생을 등록해야 수업 기록을 작성할 수 있습니다.</div>' +
                       '<a class="btn btn--block" href="#/student/new">+ 학생 추가하러 가기</a>';
      return;
    }

    setHeader(isNew ? '수업 기록 작성' : '수업 기록 수정', '', true);
    var input = (lesson && lesson.input) || Store.emptyInput();
    var teachers = Store.getTeachers();
    var curTeacher = (lesson && lesson.teacher) || '';

    var html = '<form id="lessonForm">';
    html += '<div class="card">';

    // 학생
    html += field('학생명', '<select name="studentId" required><option value="">— 학생 선택 —</option>' +
      students.map(function (s) {
        var sel = (lesson && lesson.studentId === s.id) ? ' selected' : '';
        var meta = [s.school, s.grade].filter(Boolean).join(' ');
        return '<option value="' + esc(s.id) + '"' + sel + '>' + esc(s.name) + (meta ? ' (' + esc(meta) + ')' : '') + '</option>';
      }).join('') + '</select>', true);

    // 날짜
    html += field('수업 날짜', '<input type="date" name="date" value="' + esc((lesson && lesson.date) || Store.todayStr()) + '" required>', true);

    // 교사
    var teacherOptions = teachers.map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === curTeacher ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
    var isCustom = curTeacher && teachers.indexOf(curTeacher) === -1;
    html += field('담당 교사',
      (teachers.length ? '<select name="teacherSelect" id="teacherSelect"><option value="">— 직접 입력 —</option>' + teacherOptions + '</select>' : '') +
      '<input type="text" name="teacher" id="teacherInput" value="' + esc(curTeacher) + '" placeholder="교사 이름" ' +
      (teachers.length ? 'style="margin-top:8px;' + (isCustom || !curTeacher ? '' : 'display:none') + '"' : '') + ' required>', true,
      teachers.length ? '목록에서 고르거나 직접 입력할 수 있습니다.' : '설정 화면에서 교사 목록을 등록하면 다음부터 골라 쓸 수 있습니다.');

    html += '</div><div class="card">';

    html += field('오늘 수업 진도',
      '<textarea name="progress" required placeholder="예: 능률(김) 3과 본문 1~2문단 해석, 관계대명사 which 정리">' + esc(input.progress) + '</textarea>',
      true, '피드백의 "오늘 학습 내용"에 그대로 들어갑니다.');

    // 이해도 5단계
    html += '<div class="field"><label>학습 상태 / 이해도<span class="req">*</span>' +
            '<span class="hint">한 단계를 선택하면 정해진 문장이 자동으로 들어갑니다.</span></label>' +
            '<div class="levels" id="levels">' +
            LEVELS.map(function (l) {
              return '<button type="button" class="level" data-code="' + esc(l.code) + '" aria-pressed="' +
                (input.understanding === l.code ? 'true' : 'false') + '">' + esc(l.label) + '</button>';
            }).join('') +
            '</div><input type="hidden" name="understanding" id="understanding" value="' + esc(input.understanding) + '"></div>';

    html += field('이해도 메모',
      '<textarea name="understandingNote" placeholder="예: 관계대명사는 이해했으나 which·that 구분을 두 번 틀림">' + esc(input.understandingNote) + '</textarea>',
      false, '"학습 상태" 문단에 덧붙습니다.');

    html += field('보완 필요 사항',
      '<textarea name="improve" placeholder="예: which와 that 구분 문제 10문항 추가 연습 필요">' + esc(input.improve) + '</textarea>',
      false, '비워 두면 "보완 사항 없음"으로 안내됩니다. 없는 내용을 지어내지 않습니다.');

    html += field('숙제',
      '<textarea name="homework" placeholder="예: 워크북 p.42~45, 단어 3과 1~40번 암기">' + esc(input.homework) + '</textarea>',
      false, '비워 두면 "숙제 없음"으로 안내됩니다.');

    html += field('선생님 메모 (학부모 전달사항)',
      '<textarea name="memo" placeholder="예: 다음 주 서해고 중간고사 범위 확인 부탁드립니다">' + esc(input.memo) + '</textarea>',
      false, '비워 두면 "전달사항" 문단 자체가 만들어지지 않습니다.');

    html += '</div>';
    html += '<div class="btn-row"><button type="submit" class="btn btn--block">' + (isNew ? '저장하고 피드백 만들기' : '수정 내용 저장') + '</button></div>';
    html += '</form>';

    // 저장 버튼 아래 — 그 학생의 최근 수업 기록 (읽기 전용)
    html += '<h2 class="section-title">최근 수업 기록</h2>';
    html += '<div id="recentBox"></div>';

    view.innerHTML = html;

    // 이해도 버튼 동작
    $$('#levels .level').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('#levels .level').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
        $('#understanding').value = btn.dataset.code;
      });
    });

    // 교사 선택 ↔ 직접 입력 전환
    var tSel = $('#teacherSelect');
    var tInput = $('#teacherInput');
    if (tSel) {
      tSel.addEventListener('change', function () {
        if (tSel.value) { tInput.value = tSel.value; tInput.style.display = 'none'; }
        else { tInput.value = ''; tInput.style.display = ''; tInput.focus(); }
      });
    }

    // 학생을 고르면 담당 교사를 자동으로 채우고, 최근 수업 기록을 불러온다
    var studentSel = $('select[name="studentId"]');
    if (studentSel) studentSel.addEventListener('change', function () {
      var stu = Store.getStudent(studentSel.value);
      if (stu && stu.teacher && !tInput.value.trim()) {
        tInput.value = stu.teacher;
        if (tSel) tSel.value = teachers.indexOf(stu.teacher) !== -1 ? stu.teacher : '';
      }
      renderRecentLessons(studentSel.value, isNew ? null : id);
    });

    // 화면을 열 때도 한 번 (수정 화면은 학생이 이미 정해져 있다)
    renderRecentLessons(studentSel ? studentSel.value : '', isNew ? null : id);

    $('#lessonForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var data = {
        id: isNew ? null : id,
        studentId: fd.get('studentId'),
        date: fd.get('date'),
        teacher: (fd.get('teacher') || '').trim(),
        input: {
          progress: fd.get('progress'),
          understanding: fd.get('understanding'),
          understandingNote: fd.get('understandingNote'),
          improve: fd.get('improve'),
          homework: fd.get('homework'),
          memo: fd.get('memo')
        }
      };
      if (!data.input.understanding) return toast('학습 상태(이해도)를 선택해 주세요.', 'err');
      var r = Store.saveLesson(data);
      if (!r.ok) return toast(r.error, 'err');
      sendToSheet('lesson', Store.getLesson(r.id));
      toast('기록을 저장했습니다.', 'ok');
      go('#/feedback/' + r.id);
    });
  }

  // ───────────────────────── 기록 목록 ─────────────────────────

  var lessonFilter = { studentId: '', status: '', keyword: '' };

  function renderLessons() {
    setHeader('수업 기록', '', false);
    var students = Store.getStudents({ includeArchived: true });
    var list = Store.getLessons(lessonFilter);

    var html = '<div class="filters">';
    html += '<select id="fStudent"><option value="">전체 학생</option>' + students.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (lessonFilter.studentId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('') + '</select>';
    html += '<select id="fStatus"><option value="">전체 상태</option>' +
      Object.keys(STATUS).map(function (k) {
        return '<option value="' + k + '"' + (lessonFilter.status === k ? ' selected' : '') + '>' + esc(STATUS[k].label) + '</option>';
      }).join('') + '</select>';
    html += '<div class="full"><input type="search" id="fKeyword" placeholder="진도·교사 내용으로 검색" value="' + esc(lessonFilter.keyword) + '"></div>';
    html += '</div>';

    html += '<a class="btn btn--block" href="#/lesson/new" style="margin-bottom:16px">+ 새 수업 기록 작성</a>';

    if (!list.length) {
      html += '<div class="empty"><span class="empty__icon">📋</span>조건에 맞는 기록이 없습니다.</div>';
    } else {
      html += '<div class="list__meta" style="margin-bottom:8px">' + list.length + '건</div>';
      html += '<ul class="list">' + list.map(lessonItemHTML).join('') + '</ul>';
    }
    view.innerHTML = html;

    $('#fStudent').addEventListener('change', function (e) { lessonFilter.studentId = e.target.value; renderLessons(); });
    $('#fStatus').addEventListener('change', function (e) { lessonFilter.status = e.target.value; renderLessons(); });
    var kw = $('#fKeyword');
    kw.addEventListener('input', function () {
      lessonFilter.keyword = kw.value;
      var pos = kw.selectionStart;
      renderLessons();
      var k2 = $('#fKeyword'); k2.focus();
      try { k2.setSelectionRange(pos, pos); } catch (e) {}
    });
  }

  // ───────────────────────── 피드백 상세 ─────────────────────────

  var SECTION_LABELS = {
    today: '오늘 학습 내용',
    state: '학습 상태',
    improve: '보완 내용',
    homework: '숙제',
    notice: '전달사항'
  };

  function renderFeedback(id) {
    var lesson = Store.getLesson(id);
    if (!lesson) { toast('기록을 찾을 수 없습니다.', 'err'); return go('#/lessons'); }
    var settings = Store.getSettings();
    var fb = lesson.feedback || {};
    var isFinal = fb.status === 'final';
    setHeader(lesson.studentName + ' 피드백', FeedbackEngine.formatDate(lesson.date), true);

    var html = '';

    // 입력 내용 확인
    var input = lesson.input || {};
    html += '<div class="card"><h3 class="card__title">선생님이 입력한 내용 ' + statusBadge(fb.status) + '</h3><dl class="kv">';
    html += '<dt>날짜</dt><dd>' + esc(FeedbackEngine.formatDate(lesson.date)) + '</dd>';
    html += '<dt>담당 교사</dt><dd>' + esc(lesson.teacher) + '</dd>';
    html += '<dt>진도</dt><dd>' + esc(input.progress || '-') + '</dd>';
    html += '<dt>이해도</dt><dd>' + esc(levelLabel(input.understanding)) + (input.understandingNote ? ' / ' + esc(input.understandingNote) : '') + '</dd>';
    html += '<dt>보완</dt><dd>' + esc(input.improve || '(입력 없음)') + '</dd>';
    html += '<dt>숙제</dt><dd>' + esc(input.homework || '(입력 없음)') + '</dd>';
    html += '<dt>메모</dt><dd>' + esc(input.memo || '(입력 없음)') + '</dd>';
    html += '</dl>';
    if (!isFinal) html += '<div class="btn-row" style="margin-top:12px"><a class="btn btn--ghost btn--sm" href="#/lesson/' + esc(id) + '/edit">입력 내용 수정</a></div>';
    html += '</div>';

    // 생성 버튼
    var engineLabel = settings.engine === 'ai' ? 'AI 다듬기' : '규칙 기반';
    html += '<div class="btn-row">';
    html += '<button class="btn" id="genBtn"' + (isFinal ? ' disabled' : '') + '>피드백 생성 <small style="font-weight:400;opacity:.85">(' + esc(engineLabel) + ')</small></button>';
    html += '</div>';
    if (settings.engine === 'ai' && !AIClient.isConfigured(settings)) {
      html += '<div class="note note--warn" style="margin-top:10px">AI 사용으로 설정돼 있지만 API 키(또는 프록시 주소)가 없습니다. 생성 시 규칙 기반으로 대신 만듭니다.</div>';
    }

    // 경고 영역
    html += '<div id="warnArea"></div>';

    // 편집 영역
    html += '<h2 class="section-title">피드백 문장 (직접 수정할 수 있습니다)</h2>';
    html += '<div class="card' + (isFinal ? ' locked' : '') + '" id="editCard">';
    Object.keys(SECTION_LABELS).forEach(function (k) {
      html += '<div class="fb-section"><label>' + esc(SECTION_LABELS[k]) +
        (k === 'notice' ? '<span class="opt">비우면 문단 생략</span>' : '') + '</label>' +
        '<textarea data-sec="' + k + '"' + (isFinal ? ' readonly' : '') + '>' + esc((fb.sections && fb.sections[k]) || '') + '</textarea></div>';
    });
    html += '</div>';

    // 미리보기
    html += '<h2 class="section-title">학부모 전송용 최종 문장</h2>';
    html += '<div class="fb-preview" id="preview">' + esc(fb.text || '아직 생성되지 않았습니다. 위의 "피드백 생성" 버튼을 눌러 주세요.') + '</div>';

    html += '<div class="btn-row" style="margin-top:14px">';
    html += '<button class="btn btn--ghost" id="copyBtn">복사</button>';
    if (isFinal) {
      html += '<button class="btn btn--ghost" id="unlockBtn">수정 잠금 해제</button>';
    } else {
      html += '<button class="btn btn--ghost" id="saveDraftBtn">임시 저장</button>';
      html += '<button class="btn btn--ok" id="finalBtn">최종 확정</button>';
    }
    html += '</div>';

    if (isFinal) {
      html += '<div class="note note--ok" style="margin-top:14px">' + esc(new Date(fb.confirmedAt || Date.now()).toLocaleString('ko-KR')) + ' 에 확정되었습니다. 수정하려면 잠금을 해제하세요.</div>';
    }

    // 수정 이력
    if (lesson.history && lesson.history.length) {
      html += '<h2 class="section-title">수정 이력 (' + lesson.history.length + '회) — 기록은 삭제되지 않습니다</h2>';
      html += '<ul class="list">' + lesson.history.slice().reverse().slice(0, 5).map(function (h, i) {
        return '<li class="list__item"><div class="list__row"><span class="list__meta">' +
          esc(new Date(h.at).toLocaleString('ko-KR')) + '</span>' + statusBadge(h.status) + '</div>' +
          '<div class="list__excerpt">' + esc(h.text) + '</div></li>';
      }).join('') + '</ul>';
    }

    view.innerHTML = html;
    bindFeedbackEvents(lesson, settings);
  }

  function collectSections() {
    var sections = {};
    $$('#editCard textarea').forEach(function (ta) { sections[ta.dataset.sec] = ta.value; });
    return sections;
  }

  function refreshPreview(lesson, settings) {
    var sections = collectSections();
    var text = FeedbackEngine.composeText(lesson, sections, settings);
    $('#preview').textContent = text;
    return { sections: sections, text: text };
  }

  function renderWarnings(result) { renderWarningsInto('#warnArea', result); }

  function renderWarningsInto(sel, result) {
    var area = $(sel);
    if (!area) return;
    if (!result || (!result.errors.length && !result.warnings.length)) { area.innerHTML = ''; return; }
    var html = '';
    if (result.errors.length) {
      html += '<div class="note note--err"><b>🔴 입력에 없는 내용이 발견되었습니다.</b> 확정하기 전에 반드시 확인하세요.<ul>' +
        result.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul></div>';
    }
    // 표현 규칙(과장 칭찬·부정 단정)과 원문 대조 결과를 따로 보여 준다
    var style = result.warnings.filter(function (w) { return w.type === 'praise' || w.type === 'negative'; });
    var unknown = result.warnings.filter(function (w) { return w.type === 'korean'; });

    if (style.length) {
      html += '<div class="note note--warn"><b>🟡 표현을 다듬어 주세요.</b><ul>' +
        style.map(function (w) { return '<li>' + esc(w.message) + '</li>'; }).join('') + '</ul></div>';
    }
    if (unknown.length) {
      html += '<div class="note note--warn"><b>🟡 입력에서 찾을 수 없는 표현입니다.</b><ul>' +
        unknown.slice(0, 10).map(function (w) { return '<li>' + esc(w.message) + '</li>'; }).join('') +
        (unknown.length > 10 ? '<li>외 ' + (unknown.length - 10) + '건</li>' : '') + '</ul></div>';
    }
    area.innerHTML = html;
  }

  function bindFeedbackEvents(lesson, settings) {
    var id = lesson.id;
    var isFinal = lesson.feedback.status === 'final';

    // 라우터를 거치지 않고 다시 그릴 때도 입력칸 높이가 내용에 맞도록 한다
    bindAutoGrow(view);

    $$('#editCard textarea').forEach(function (ta) {
      ta.addEventListener('input', function () { refreshPreview(lesson, settings); });
    });

    var genBtn = $('#genBtn');
    if (genBtn) genBtn.addEventListener('click', function () {
      var useAI = settings.engine === 'ai' && AIClient.isConfigured(settings);

      function apply(sections, engine) {
        Object.keys(SECTION_LABELS).forEach(function (k) {
          var ta = $('#editCard textarea[data-sec="' + k + '"]');
          if (ta) { ta.value = sections[k] || ''; autoGrow(ta); }
        });
        var res = refreshPreview(lesson, settings);
        var check = FeedbackEngine.verify(res.sections, lesson);
        renderWarnings(engine === 'ai' ? check : null);   // 규칙 기반은 원문 그대로라 검증 불필요
        var r = Store.saveFeedback(id, {
          status: 'generated', engine: engine,
          sections: res.sections, text: res.text,
          warnings: engine === 'ai' ? check.errors.concat(check.warnings) : [],
          generatedAt: new Date().toISOString()
        });
        if (!r.ok) return toast(r.error, 'err');
        lesson = Store.getLesson(id);
        toast('피드백을 생성했습니다.', 'ok');
      }

      if (!useAI) {
        apply(FeedbackEngine.generateRuleBased(lesson, settings), 'rule');
        return;
      }

      genBtn.disabled = true;
      var prev = genBtn.innerHTML;
      genBtn.innerHTML = '<span class="spinner"></span> AI가 문장을 다듬는 중…';
      AIClient.generate(lesson, settings)
        .then(function (sections) { apply(sections, 'ai'); })
        .catch(function (err) {
          console.error(err);
          toast('AI 생성 실패 — 규칙 기반으로 만들었습니다.', 'err');
          apply(FeedbackEngine.generateRuleBased(lesson, settings), 'rule');
        })
        .then(function () { genBtn.disabled = false; genBtn.innerHTML = prev; });
    });

    var saveBtn = $('#saveDraftBtn');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var res = refreshPreview(lesson, settings);
      var r = Store.saveFeedback(id, { status: 'edited', sections: res.sections, text: res.text });
      if (!r.ok) return toast(r.error, 'err');
      lesson = Store.getLesson(id);
      toast('임시 저장했습니다.', 'ok');
    });

    var finalBtn = $('#finalBtn');
    if (finalBtn) finalBtn.addEventListener('click', function () {
      var res = refreshPreview(lesson, settings);
      if (!res.text.trim()) return toast('먼저 피드백을 생성해 주세요.', 'err');

      var check = FeedbackEngine.verify(res.sections, lesson);
      var proceed = Promise.resolve(true);
      if (check.errors.length) {
        renderWarnings(check);
        proceed = confirmBox(
          '입력에 없는 내용이 ' + check.errors.length + '건 발견되었습니다.\n\n' +
          check.errors.slice(0, 3).map(function (e) { return '· ' + e.message; }).join('\n') +
          '\n\n그래도 확정하시겠습니까?', '확인하고 확정');
      }
      proceed.then(function (ok) {
        if (!ok) return;
        var r = Store.saveFeedback(id, {
          status: 'final', sections: res.sections, text: res.text,
          warnings: check.errors.concat(check.warnings)
        });
        if (!r.ok) return toast(r.error, 'err');
        toast('최종 확정했습니다.', 'ok');
        renderFeedback(id);
      });
    });

    var unlockBtn = $('#unlockBtn');
    if (unlockBtn) unlockBtn.addEventListener('click', function () {
      confirmBox('확정을 해제하고 다시 수정할 수 있게 할까요?\n작성된 문장은 그대로 유지됩니다.', '잠금 해제').then(function (ok) {
        if (!ok) return;
        var r = Store.unlockFeedback(id);
        if (!r.ok) return toast(r.error, 'err');
        toast('수정할 수 있습니다.', 'ok');
        renderFeedback(id);
      });
    });

    $('#copyBtn').addEventListener('click', function () {
      var text = isFinal ? lesson.feedback.text : refreshPreview(lesson, settings).text;
      if (!text.trim()) return toast('복사할 문장이 없습니다.', 'err');
      copyText(text).then(function () { toast('복사했습니다. 카톡·문자에 붙여 넣으세요.', 'ok'); })
                    .catch(function () { toast('복사에 실패했습니다. 길게 눌러 직접 복사해 주세요.', 'err'); });
    });
  }

  // ───────────────────────── 숙제 ─────────────────────────

  var HW_STATE_BADGE = {
    none:  { cls: 'draft',     label: '항목 없음' },
    todo:  { cls: 'edited',    label: '미완료' },
    doing: { cls: 'generated', label: '진행중' },
    done:  { cls: 'final',     label: '완료' }
  };

  function hwBadge(hw) {
    var sum = Store.summarize(hw);
    var b = HW_STATE_BADGE[sum.state] || HW_STATE_BADGE.none;
    var html = '<span class="badge badge--' + b.cls + '">' + esc(b.label) + '</span>';
    if (sum.checked) html += ' <span class="badge badge--final">교사확인</span>';
    return html;
  }

  /** 숙제 목록의 한 줄 */
  function homeworkItemHTML(h) {
    var sum = Store.summarize(h);
    var texts = (h.base || []).concat(h.extra || []).map(function (i) { return i.text; }).join(', ');
    var meta = [h.date, h.className, h.teacher].filter(Boolean).join(' · ');
    if (h.dueDate) meta += ' · 제출 ' + h.dueDate;
    return '<a class="list__item" href="#/homework/' + esc(h.id) + '">' +
      '<div class="list__row"><span class="list__name">' + esc(h.studentName) + '</span>' + hwBadge(h) + '</div>' +
      '<div class="list__meta">' + esc(meta) + ' · ' + sum.done + '/' + sum.total + ' 완료</div>' +
      '<div class="list__excerpt">' + esc(texts) + '</div>' +
    '</a>';
  }

  // ── 숙제 목록 (최근 기록 확인) ──
  var hwFilter = { studentId: '', state: '', keyword: '' };

  function renderHomeworks() {
    setHeader('숙제 관리', '', false);
    var students = Store.getStudents({ includeArchived: true });
    var list = Store.getHomeworks(hwFilter);
    var stats = Store.getStats();

    var html = '';
    html += '<div class="stats" style="grid-template-columns:repeat(3,1fr)">';
    html += '<div class="stat"><span class="stat__num">' + stats.homeworksToday + '</span><span class="stat__label">오늘 배정</span></div>';
    html += '<div class="stat ' + (stats.homeworksUnchecked ? 'stat--alert' : '') + '"><span class="stat__num">' + stats.homeworksUnchecked + '</span><span class="stat__label">교사 미확인</span></div>';
    html += '<div class="stat"><span class="stat__num">' + stats.homeworksTotal + '</span><span class="stat__label">전체 기록</span></div>';
    html += '</div>';

    html += '<a class="btn btn--block" href="#/homework/new">+ 숙제 배정하기</a>';

    html += '<div class="filters" style="margin-top:16px">';
    html += '<select id="hwStudent"><option value="">전체 학생</option>' + students.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (hwFilter.studentId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('') + '</select>';
    html += '<select id="hwState"><option value="">전체 상태</option>' +
      ['todo', 'doing', 'done'].map(function (k) {
        return '<option value="' + k + '"' + (hwFilter.state === k ? ' selected' : '') + '>' + esc(HW_STATE_BADGE[k].label) + '</option>';
      }).join('') + '</select>';
    html += '<div class="full"><input type="search" id="hwKeyword" placeholder="숙제 내용·교사로 검색" value="' + esc(hwFilter.keyword) + '"></div>';
    html += '</div>';

    if (!list.length) {
      html += '<div class="empty"><span class="empty__icon">📚</span>' +
        (hwFilter.studentId || hwFilter.state || hwFilter.keyword ? '조건에 맞는 숙제 기록이 없습니다.' : '아직 배정된 숙제가 없습니다.') + '</div>';
    } else {
      html += '<div class="list__meta" style="margin-bottom:8px">' + list.length + '건</div>';
      html += '<ul class="list">' + list.map(homeworkItemHTML).join('') + '</ul>';
    }
    view.innerHTML = html;

    $('#hwStudent').addEventListener('change', function (e) { hwFilter.studentId = e.target.value; renderHomeworks(); });
    $('#hwState').addEventListener('change', function (e) { hwFilter.state = e.target.value; renderHomeworks(); });
    var kw = $('#hwKeyword');
    kw.addEventListener('input', function () {
      hwFilter.keyword = kw.value;
      var pos = kw.selectionStart;
      renderHomeworks();
      var k2 = $('#hwKeyword'); k2.focus();
      try { k2.setSelectionRange(pos, pos); } catch (e) {}
    });
  }

  // ── 숙제 배정 / 수정 ──

  /** 편집용 항목 줄 하나 */
  function hwEditRow(kind, item) {
    return '<div class="hw-edit" data-kind="' + kind + '" data-id="' + esc(item.id || '') + '">' +
      '<input type="text" value="' + esc(item.text || '') + '" placeholder="숙제 내용">' +
      '<button type="button" class="hw-item__del" aria-label="이 항목 빼기">×</button></div>';
  }

  function readEditRows(containerSel) {
    return $$(containerSel + ' .hw-edit').map(function (row) {
      return { id: row.dataset.id || undefined, text: row.querySelector('input').value };
    }).filter(function (i) { return i.text.trim(); });
  }

  function bindEditList(containerSel, addBtnSel, kind) {
    var box = $(containerSel);
    box.addEventListener('click', function (e) {
      if (e.target.classList.contains('hw-item__del')) {
        e.target.closest('.hw-edit').remove();
        if (!box.querySelector('.hw-edit')) box.insertAdjacentHTML('beforeend', hwEditRow(kind, {}));
      }
    });
    $(addBtnSel).addEventListener('click', function () {
      box.insertAdjacentHTML('beforeend', hwEditRow(kind, {}));
      var rows = $$(containerSel + ' .hw-edit');
      rows[rows.length - 1].querySelector('input').focus();
    });
  }

  function renderHomeworkForm(id) {
    var isNew = !id;
    var record = isNew ? null : Store.getHomework(id);
    if (!isNew && !record) { toast('숙제 기록을 찾을 수 없습니다.', 'err'); return go('#/homeworks'); }

    var students = Store.getStudents();
    if (!students.length) {
      setHeader('숙제 배정', '', true);
      view.innerHTML = '<div class="empty"><span class="empty__icon">👥</span>먼저 학생을 등록해야 숙제를 배정할 수 있습니다.</div>' +
                       '<a class="btn btn--block" href="#/student/new">+ 학생 추가하러 가기</a>';
      return;
    }

    setHeader(isNew ? '숙제 배정' : '숙제 수정', '', true);
    var teachers = Store.getTeachers();
    var curStudentId = record ? record.studentId : '';
    var baseItems = record ? record.base : [];
    var extraItems = record ? record.extra : [];

    var html = '<form id="hwForm"><div class="card">';

    html += field('학생', '<select name="studentId" id="hwStudentSel" required><option value="">— 학생 선택 —</option>' +
      students.map(function (s) {
        var meta = [s.className, s.grade].filter(Boolean).join(' ');
        return '<option value="' + esc(s.id) + '"' + (curStudentId === s.id ? ' selected' : '') + '>' +
          esc(s.name) + (meta ? ' (' + esc(meta) + ')' : '') + '</option>';
      }).join('') + '</select>', true, '학생을 고르면 기본 숙제가 자동으로 채워집니다.');

    html += '<div class="filters">';
    html += '<div><label class="field__label">반 / 레벨</label>' +
            '<input type="text" name="className" id="hwClass" value="' + esc(record ? record.className : '') + '" placeholder="자동 입력"></div>';
    html += '<div><label class="field__label">담당 교사</label>' +
            '<input type="text" name="teacher" id="hwTeacher" value="' + esc(record ? record.teacher : '') + '" list="teacherList" placeholder="자동 입력"></div>';
    html += '<datalist id="teacherList">' + teachers.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>';
    html += '<div><label class="field__label">숙제 날짜<span class="req">*</span></label>' +
            '<input type="date" name="date" value="' + esc(record ? record.date : Store.todayStr()) + '" required></div>';
    html += '<div><label class="field__label">제출 예정일</label>' +
            '<input type="date" name="dueDate" value="' + esc(record ? record.dueDate : '') + '"></div>';
    html += '</div></div>';

    // 기본 숙제
    html += '<div class="card"><h3 class="card__title">기본 숙제 <small>학생에게 등록된 반복 숙제</small></h3>';
    html += '<div id="baseList">' + (baseItems.length ? baseItems.map(function (i) { return hwEditRow('base', i); }).join('') : hwEditRow('base', {})) + '</div>';
    html += '<div class="btn-row" style="margin-top:8px"><button type="button" class="btn btn--ghost btn--sm" id="addBase">+ 기본 숙제 줄 추가</button>';
    html += '<button type="button" class="btn btn--ghost btn--sm" id="reloadBase">기본 숙제 다시 불러오기</button></div>';
    html += '<label class="check-label check-label--help" style="margin-top:16px">' +
            '<input type="checkbox" id="saveAsDefault" style="width:auto;margin-top:3px">' +
            '<span>여기서 고친 내용을 <b>이 학생의 기본 숙제로도 저장</b>합니다.<br>' +
            '체크하지 않으면 오늘 기록에만 반영되고 학생의 기본 숙제는 그대로 유지됩니다.</span></label>';
    html += '</div>';

    // 오늘 추가 숙제
    html += '<div class="card"><h3 class="card__title">오늘 추가 숙제 <small>이 날짜에만 해당</small></h3>';
    html += '<div id="extraList">' + (extraItems.length ? extraItems.map(function (i) { return hwEditRow('extra', i); }).join('') : hwEditRow('extra', {})) + '</div>';
    html += '<div class="btn-row" style="margin-top:8px"><button type="button" class="btn btn--ghost btn--sm" id="addExtra">+ 추가 숙제 줄 추가</button></div>';
    html += '</div>';

    html += '<div class="btn-row"><button type="submit" class="btn btn--block">' + (isNew ? '저장하기' : '수정 내용 저장') + '</button></div>';
    html += '</form>';
    view.innerHTML = html;

    bindEditList('#baseList', '#addBase', 'base');
    bindEditList('#extraList', '#addExtra', 'extra');

    /** 학생의 기본 숙제를 폼에 채운다 (기능 1) */
    function loadDefaults(studentId, opts) {
      var student = Store.getStudent(studentId);
      if (!student) return;
      if (opts && opts.fillMeta) {
        if (!$('#hwClass').value.trim()) $('#hwClass').value = student.className || '';
        if (!$('#hwTeacher').value.trim()) $('#hwTeacher').value = student.teacher || '';
      }
      var defaults = Store.getDefaultHomework(studentId);
      var box = $('#baseList');
      if (!defaults.length) {
        box.innerHTML = hwEditRow('base', {});
        toast('이 학생은 등록된 기본 숙제가 없습니다.', 'err');
        return;
      }
      box.innerHTML = defaults.map(function (i) { return hwEditRow('base', i); }).join('');
      toast('기본 숙제 ' + defaults.length + '개를 불러왔습니다.', 'ok');
    }

    $('#hwStudentSel').addEventListener('change', function (e) {
      var sid = e.target.value;
      if (!sid) return;
      var student = Store.getStudent(sid);
      $('#hwClass').value = student.className || '';
      $('#hwTeacher').value = student.teacher || '';
      loadDefaults(sid, { fillMeta: false });
    });

    $('#reloadBase').addEventListener('click', function () {
      var sid = $('#hwStudentSel').value;
      if (!sid) return toast('먼저 학생을 선택해 주세요.', 'err');
      confirmBox('지금 입력한 기본 숙제를 버리고,\n이 학생에게 등록된 기본 숙제를 다시 불러올까요?', '다시 불러오기').then(function (ok) {
        if (ok) loadDefaults(sid, { fillMeta: true });
      });
    });

    // 새로 만들 때 학생이 이미 선택돼 있으면 곧바로 채운다
    if (isNew && curStudentId) loadDefaults(curStudentId, { fillMeta: true });

    $('#hwForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var base = readEditRows('#baseList');
      var extra = readEditRows('#extraList');
      var data = {
        id: isNew ? null : id,
        studentId: fd.get('studentId'),
        className: fd.get('className'),
        teacher: fd.get('teacher'),
        date: fd.get('date'),
        dueDate: fd.get('dueDate'),
        base: base,
        extra: extra
      };
      var r = Store.saveHomework(data);
      if (!r.ok) return toast(r.error, 'err');
      sendToSheet('homework', Store.getHomework(r.id));

      // 기본 숙제 마스터 갱신은 체크했을 때만 (기능 2)
      if ($('#saveAsDefault').checked) {
        var r2 = Store.setDefaultHomework(data.studentId, base);
        if (!r2.ok) toast(r2.error, 'err');
        else toast('저장했습니다. 기본 숙제도 갱신했습니다.', 'ok');
      } else {
        toast('저장했습니다.', 'ok');
      }
      go('#/homework/' + r.id);
    });
  }

  // ── 숙제 상세 (완료 체크 · 교사 확인 · 학부모 문장) ──

  function hwCheckRow(hw, kind, item) {
    return '<div class="hw-item">' +
      '<input type="checkbox" class="hw-item__check" data-kind="' + kind + '" data-id="' + esc(item.id) + '"' +
        (item.done ? ' checked' : '') + ' aria-label="완료 표시">' +
      '<span class="hw-item__text' + (item.done ? ' done' : '') + '">' + esc(item.text) +
      '<span class="hw-origin hw-origin--' + kind + '">' + (kind === 'base' ? '기본' : '추가') + '</span></span>' +
    '</div>';
  }

  /** 진행률·상태 배지만 다시 계산해 갱신한다 */
  function refreshHomeworkProgress(id) {
    var hw = Store.getHomework(id);
    if (!hw) return;
    var sum = Store.summarize(hw);
    var pct = sum.total ? Math.round(sum.done / sum.total * 100) : 0;
    var bar = $('#hwProgressBar');
    var text = $('#hwProgressText');
    var badge = $('#hwStateBadge');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = '전체 ' + sum.total + '개 중 ' + sum.done + '개 완료 (' + pct + '%)';
    if (badge) badge.innerHTML = hwBadge(hw);
  }

  function renderHomeworkDetail(id) {
    var hw = Store.getHomework(id);
    if (!hw) { toast('숙제 기록을 찾을 수 없습니다.', 'err'); return go('#/homeworks'); }
    var settings = Store.getSettings();
    var sum = Store.summarize(hw);
    setHeader(hw.studentName + ' 숙제', FeedbackEngine.formatDate(hw.date), true);

    var html = '';

    html += '<div class="card"><h3 class="card__title">숙제 현황 <span id="hwStateBadge">' + hwBadge(hw) + '</span></h3>';
    html += '<dl class="kv">';
    html += '<dt>반 / 레벨</dt><dd>' + esc(hw.className || '-') + '</dd>';
    html += '<dt>담당 교사</dt><dd>' + esc(hw.teacher || '-') + '</dd>';
    html += '<dt>숙제 날짜</dt><dd>' + esc(FeedbackEngine.formatDate(hw.date)) + '</dd>';
    html += '<dt>제출 예정일</dt><dd>' + (hw.dueDate ? esc(FeedbackEngine.formatDate(hw.dueDate)) : '지정 안 함') + '</dd>';
    html += '</dl>';
    var pct = sum.total ? Math.round(sum.done / sum.total * 100) : 0;
    html += '<div class="progress"><div class="progress__bar" id="hwProgressBar" style="width:' + pct + '%"></div></div>';
    html += '<div class="list__meta" id="hwProgressText">전체 ' + sum.total + '개 중 ' + sum.done + '개 완료 (' + pct + '%)</div>';
    html += '<div class="btn-row" style="margin-top:12px"><a class="btn btn--ghost btn--sm" href="#/homework/' + esc(id) + '/edit">숙제 수정</a></div>';
    html += '</div>';

    html += '<div class="card"><h3 class="card__title">기본 숙제 <small>' + (hw.base || []).length + '개</small></h3>';
    html += (hw.base || []).length
      ? (hw.base).map(function (i) { return hwCheckRow(hw, 'base', i); }).join('')
      : '<div class="list__meta">등록된 기본 숙제가 없습니다.</div>';
    html += '</div>';

    html += '<div class="card"><h3 class="card__title">오늘 추가 숙제 <small>' + (hw.extra || []).length + '개</small></h3>';
    html += (hw.extra || []).length
      ? (hw.extra).map(function (i) { return hwCheckRow(hw, 'extra', i); }).join('')
      : '<div class="list__meta">오늘 추가된 숙제가 없습니다.</div>';
    html += '</div>';

    // 교사 확인
    var tc = hw.teacherCheck || {};
    html += '<div class="card"><h3 class="card__title">교사 확인</h3>';
    html += '<div class="field"><textarea id="checkNote" placeholder="확인 메모 (선택)">' + esc(tc.note || '') + '</textarea></div>';
    if (tc.checked) {
      html += '<div class="note note--ok">' + esc(tc.by || '담당 교사') + ' · ' +
              esc(new Date(tc.at || Date.now()).toLocaleString('ko-KR')) + ' 확인 완료</div>';
      html += '<button class="btn btn--ghost btn--block" id="uncheckBtn">확인 표시 해제</button>';
    } else {
      html += '<button class="btn btn--ok btn--block" id="checkBtn">확인 완료로 표시</button>';
    }
    html += '</div>';

    // 학부모 전송 문장
    html += '<h2 class="section-title">학부모에게 보낼 숙제 문장</h2>';
    html += '<div id="hwWarnArea"></div>';
    html += '<div class="fb-preview" id="hwMessage">' + esc(hw.message && hw.message.text ? hw.message.text : '아래 "문장 만들기" 버튼을 눌러 주세요.') + '</div>';
    html += '<div class="btn-row" style="margin-top:12px">';
    html += '<button class="btn" id="hwGenBtn">문장 만들기</button>';
    html += '<button class="btn btn--ghost" id="hwCopyBtn">복사</button>';
    html += '</div>';

    view.innerHTML = html;

    // 완료 체크 — 화면 전체를 다시 그리면 보던 위치를 잃어버리므로 해당 부분만 갱신한다
    $$('.hw-item__check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var r = Store.setHomeworkItemDone(id, cb.dataset.kind, cb.dataset.id, cb.checked);
        if (!r.ok) { toast(r.error, 'err'); cb.checked = !cb.checked; return; }
        var label = cb.parentNode.querySelector('.hw-item__text');
        if (label) label.classList.toggle('done', cb.checked);
        refreshHomeworkProgress(id);
      });
    });

    var checkBtn = $('#checkBtn');
    if (checkBtn) checkBtn.addEventListener('click', function () {
      var r = Store.setTeacherCheck(id, { checked: true, by: hw.teacher, note: $('#checkNote').value });
      if (!r.ok) return toast(r.error, 'err');
      toast('확인 완료로 표시했습니다.', 'ok');
      renderHomeworkDetail(id);
    });

    var uncheckBtn = $('#uncheckBtn');
    if (uncheckBtn) uncheckBtn.addEventListener('click', function () {
      var r = Store.setTeacherCheck(id, { checked: false, note: $('#checkNote').value });
      if (!r.ok) return toast(r.error, 'err');
      toast('확인 표시를 해제했습니다.', 'ok');
      renderHomeworkDetail(id);
    });

    $('#hwGenBtn').addEventListener('click', function () {
      var latest = Store.getHomework(id);
      var text = HomeworkEngine.buildMessage(latest, settings);
      $('#hwMessage').textContent = text;
      var check = HomeworkEngine.verifyMessage(text, latest);
      renderWarningsInto('#hwWarnArea', check);
      var r = Store.saveHomeworkMessage(id, text);
      if (!r.ok) return toast(r.error, 'err');
      toast('문장을 만들었습니다.', 'ok');
    });

    $('#hwCopyBtn').addEventListener('click', function () {
      var text = $('#hwMessage').textContent;
      if (!text.trim() || text.indexOf('버튼을 눌러') !== -1) return toast('먼저 문장을 만들어 주세요.', 'err');
      copyText(text).then(function () { toast('복사했습니다. 카톡·문자에 붙여 넣으세요.', 'ok'); })
                    .catch(function () { toast('복사에 실패했습니다. 길게 눌러 직접 복사해 주세요.', 'err'); });
    });
  }

  // ───────────────────────── 상담 기록 ─────────────────────────

  function cnsTargetLabel(code) { return CounselEngine.targetLabel(code); }
  function cnsTypeLabel(code) { return CounselEngine.typeLabel(code); }

  /** 후속조치·확인일 상태를 배지로 (기능 4·5) */
  function counselBadges(c) {
    var html = '<span class="badge">' + esc(cnsTypeLabel(c.type)) + '</span>';
    var fu = c.followUp || {};
    if (fu.needed && !fu.done) html += ' <span class="badge badge--edited">후속조치 필요</span>';
    else if (fu.needed && fu.done) html += ' <span class="badge badge--final">후속조치 완료</span>';
    if (c.nextCheckDate && !(fu.needed && fu.done)) {
      var d = Store.diffDays(Store.todayStr(), c.nextCheckDate);
      if (d < 0) html += ' <span class="badge badge--archived">확인일 ' + (-d) + '일 지남</span>';
      else if (d === 0) html += ' <span class="badge badge--archived">오늘 확인</span>';
      else if (d <= 3) html += ' <span class="badge badge--edited">D-' + d + '</span>';
    }
    return html;
  }

  function counselItemHTML(c) {
    var meta = [c.date, c.className, cnsTargetLabel(c.target), c.counselor].filter(Boolean).join(' · ');
    var excerpt = (c.summary && c.summary.text) ? c.summary.text.replace(/\n/g, ' ') : c.content;
    return '<a class="list__item" href="#/counsel/' + esc(c.id) + '">' +
      '<div class="list__row"><span class="list__name">' + esc(c.studentName) + '</span>' +
      (c.summary && c.summary.text ? '<span class="badge badge--generated">요약 있음</span>' : '') + '</div>' +
      '<div class="list__meta">' + esc(meta) + '</div>' +
      '<div style="margin:6px 0 2px">' + counselBadges(c) + '</div>' +
      '<div class="list__excerpt">' + esc(excerpt) + '</div>' +
    '</a>';
  }

  // ── 상담 목록 (기능 1·2) ──
  var cnsFilter = { studentId: '', type: '', followUp: false, dueWithin: null, keyword: '' };

  function renderCounsels() {
    var students = Store.getStudents({ includeArchived: true });
    var filter = { keyword: cnsFilter.keyword };
    if (cnsFilter.studentId) filter.studentId = cnsFilter.studentId;
    if (cnsFilter.type) filter.type = cnsFilter.type;
    if (cnsFilter.followUp) filter.followUp = true;
    if (cnsFilter.dueWithin != null) filter.dueWithin = cnsFilter.dueWithin;
    var list = Store.getCounsels(filter);
    var stats = Store.getStats();

    var who = cnsFilter.studentId ? (Store.getStudent(cnsFilter.studentId) || {}).name : '';
    setHeader('상담 기록', who ? who + ' 학생' : '', !!cnsFilter.studentId);

    var html = '';
    html += '<div class="stats" style="grid-template-columns:repeat(3,1fr)">';
    html += '<div class="stat"><span class="stat__num">' + stats.counselsTotal + '</span><span class="stat__label">전체 상담</span></div>';
    html += '<div class="stat ' + (stats.counselsFollowUp ? 'stat--alert' : '') + '"><span class="stat__num">' + stats.counselsFollowUp + '</span><span class="stat__label">후속조치 필요</span></div>';
    html += '<div class="stat ' + (stats.counselsDueSoon ? 'stat--alert' : '') + '"><span class="stat__num">' + stats.counselsDueSoon + '</span><span class="stat__label">확인일 임박</span></div>';
    html += '</div>';

    html += '<a class="btn btn--block" href="#/counsel/new' + (cnsFilter.studentId ? '?student=' + esc(cnsFilter.studentId) : '') + '">+ 상담 기록 작성</a>';

    html += '<div class="filters" style="margin-top:16px">';
    html += '<select id="cnsStudent"><option value="">전체 학생</option>' + students.map(function (st) {
      return '<option value="' + esc(st.id) + '"' + (cnsFilter.studentId === st.id ? ' selected' : '') + '>' + esc(st.name) + '</option>';
    }).join('') + '</select>';
    html += '<select id="cnsType"><option value="">전체 유형</option>' + Store.COUNSEL_TYPES.map(function (t) {
      return '<option value="' + esc(t.code) + '"' + (cnsFilter.type === t.code ? ' selected' : '') + '>' + esc(t.label) + '</option>';
    }).join('') + '</select>';
    html += '<div class="full"><input type="search" id="cnsKeyword" placeholder="상담 내용·요청사항으로 검색" value="' + esc(cnsFilter.keyword) + '"></div>';
    html += '</div>';

    html += '<div class="chip-row" style="margin-bottom:14px">';
    html += '<button class="btn btn--sm ' + (cnsFilter.followUp ? '' : 'btn--ghost') + '" id="cnsFollowBtn">후속조치 필요만</button>';
    html += '<button class="btn btn--sm ' + (cnsFilter.dueWithin != null ? '' : 'btn--ghost') + '" id="cnsDueBtn">확인일 임박만</button>';
    html += '</div>';

    if (!list.length) {
      html += '<div class="empty"><span class="empty__icon">💬</span>조건에 맞는 상담 기록이 없습니다.</div>';
    } else {
      html += '<div class="list__meta" style="margin-bottom:8px">' + list.length + '건 · 최신순</div>';
      html += '<ul class="list">' + list.map(counselItemHTML).join('') + '</ul>';
    }
    view.innerHTML = html;

    $('#cnsStudent').addEventListener('change', function (e) { cnsFilter.studentId = e.target.value; renderCounsels(); });
    $('#cnsType').addEventListener('change', function (e) { cnsFilter.type = e.target.value; renderCounsels(); });
    $('#cnsFollowBtn').addEventListener('click', function () { cnsFilter.followUp = !cnsFilter.followUp; renderCounsels(); });
    $('#cnsDueBtn').addEventListener('click', function () { cnsFilter.dueWithin = cnsFilter.dueWithin == null ? 3 : null; renderCounsels(); });
    var kw = $('#cnsKeyword');
    kw.addEventListener('input', function () {
      cnsFilter.keyword = kw.value;
      var pos = kw.selectionStart;
      renderCounsels();
      var k2 = $('#cnsKeyword'); k2.focus();
      try { k2.setSelectionRange(pos, pos); } catch (e) {}
    });
  }

  // ── 상담 작성 / 수정 ──
  function renderCounselForm(id, presetStudentId) {
    var isNew = !id;
    var c = isNew ? null : Store.getCounsel(id);
    if (!isNew && !c) { toast('상담 기록을 찾을 수 없습니다.', 'err'); return go('#/counsels'); }

    var students = Store.getStudents();
    if (!students.length) {
      setHeader('상담 기록', '', true);
      view.innerHTML = '<div class="empty"><span class="empty__icon">👥</span>먼저 학생을 등록해야 상담을 기록할 수 있습니다.</div>' +
                       '<a class="btn btn--block" href="#/student/new">+ 학생 추가하러 가기</a>';
      return;
    }

    setHeader(isNew ? '상담 기록 작성' : '상담 기록 수정', '', true);
    var teachers = Store.getTeachers();
    var curStudent = c ? c.studentId : (presetStudentId || '');
    var fu = (c && c.followUp) || { needed: false, text: '' };

    var html = '<form id="cnsForm"><div class="card">';

    html += field('학생', '<select name="studentId" id="cnsStudentSel" required><option value="">— 학생 선택 —</option>' +
      students.map(function (st) {
        var meta = [st.className, st.grade].filter(Boolean).join(' ');
        return '<option value="' + esc(st.id) + '"' + (curStudent === st.id ? ' selected' : '') + '>' +
          esc(st.name) + (meta ? ' (' + esc(meta) + ')' : '') + '</option>';
      }).join('') + '</select>', true);

    html += '<div class="filters">';
    html += '<div><label class="field__label">상담일<span class="req">*</span></label>' +
            '<input type="date" name="date" value="' + esc(c ? c.date : Store.todayStr()) + '" required></div>';
    html += '<div><label class="field__label">상담 교사</label>' +
            '<input type="text" name="counselor" id="cnsCounselor" value="' + esc(c ? c.counselor : '') + '" list="cnsTeacherList" placeholder="자동 입력">' +
            '<datalist id="cnsTeacherList">' + teachers.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist></div>';
    html += '<div><label class="field__label">상담 대상<span class="req">*</span></label>' +
            '<select name="target">' + Store.COUNSEL_TARGETS.map(function (t) {
              return '<option value="' + esc(t.code) + '"' + ((c ? c.target : 'parent') === t.code ? ' selected' : '') + '>' + esc(t.label) + '</option>';
            }).join('') + '</select></div>';
    html += '<div><label class="field__label">상담 유형<span class="req">*</span></label>' +
            '<select name="type">' + Store.COUNSEL_TYPES.map(function (t) {
              return '<option value="' + esc(t.code) + '"' + ((c ? c.type : 'regular') === t.code ? ' selected' : '') + '>' + esc(t.label) + '</option>';
            }).join('') + '</select></div>';
    html += '</div></div>';

    html += '<div class="card">';
    html += field('상담 내용 (원문)',
      '<textarea name="content" required placeholder="오간 이야기를 그대로 적어 주세요. 요약은 따로 만들어 줍니다.">' + esc(c ? c.content : '') + '</textarea>',
      true, '여기 적은 원문은 요약을 다시 만들어도 절대 바뀌지 않습니다.');
    html += field('학부모 요청사항',
      '<textarea name="parentRequest" placeholder="예: 단어 시험을 매주 봐 주셨으면 합니다">' + esc(c ? c.parentRequest : '') + '</textarea>');
    html += field('학원 답변',
      '<textarea name="academyReply" placeholder="예: 다음 주부터 매주 금요일 단어 시험 진행하기로 안내">' + esc(c ? c.academyReply : '') + '</textarea>');
    html += '</div>';

    html += '<div class="card"><h3 class="card__title">후속조치 · 다음 확인일</h3>';
    html += '<label class="check-label" style="margin-bottom:14px">' +
            '<input type="checkbox" name="followUpNeeded" id="fuNeeded" style="width:auto"' + (fu.needed ? ' checked' : '') + '> 후속조치가 필요합니다</label>';
    html += '<div id="fuBox"' + (fu.needed ? '' : ' hidden') + '>';
    html += field('후속조치 내용', '<textarea name="followUpText" placeholder="예: 2주 뒤 단어 시험 결과 정리해서 다시 연락">' + esc(fu.text || '') + '</textarea>');
    html += '</div>';
    html += field('다음 확인일', '<input type="date" name="nextCheckDate" value="' + esc(c ? c.nextCheckDate : '') + '">',
      false, '이 날짜가 다가오면 홈 화면에 표시됩니다.');
    html += '</div>';

    html += '<div class="btn-row"><button type="submit" class="btn btn--block">' + (isNew ? '저장하기' : '수정 내용 저장') + '</button></div>';
    html += '</form>';
    view.innerHTML = html;

    // 학생을 고르면 담당 교사를 자동으로 채운다
    $('#cnsStudentSel').addEventListener('change', function (e) {
      var st = Store.getStudent(e.target.value);
      if (st && st.teacher && !$('#cnsCounselor').value.trim()) $('#cnsCounselor').value = st.teacher;
    });
    if (isNew && curStudent) {
      var st0 = Store.getStudent(curStudent);
      if (st0 && st0.teacher) $('#cnsCounselor').value = st0.teacher;
    }

    $('#fuNeeded').addEventListener('change', function (e) { $('#fuBox').hidden = !e.target.checked; });

    $('#cnsForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var r = Store.saveCounsel({
        id: isNew ? null : id,
        studentId: fd.get('studentId'),
        date: fd.get('date'),
        counselor: fd.get('counselor'),
        target: fd.get('target'),
        type: fd.get('type'),
        content: fd.get('content'),
        parentRequest: fd.get('parentRequest'),
        academyReply: fd.get('academyReply'),
        nextCheckDate: fd.get('nextCheckDate'),
        followUp: { needed: !!fd.get('followUpNeeded'), text: fd.get('followUpText') }
      });
      if (!r.ok) return toast(r.error, 'err');
      sendToSheet('counsel', Store.getCounsel(r.id));
      toast(isNew ? '상담 기록을 저장했습니다.' : (r.changed.length ? '수정했습니다 — ' + r.changed.join(', ') : '바뀐 내용이 없습니다.'), 'ok');
      go('#/counsel/' + r.id);
    });
  }

  // ── 상담 상세 (원문 + 요약 + 후속조치 + 수정 이력) ──
  function renderCounselDetail(id) {
    var c = Store.getCounsel(id);
    if (!c) { toast('상담 기록을 찾을 수 없습니다.', 'err'); return go('#/counsels'); }
    var settings = Store.getSettings();
    var fu = c.followUp || {};
    setHeader(c.studentName + ' 상담', FeedbackEngine.formatDate(c.date), true);

    var html = '';

    html += '<div class="card"><h3 class="card__title">상담 개요</h3>';
    html += '<div style="margin-bottom:12px">' + counselBadges(c) + '</div>';
    html += '<dl class="kv">';
    html += '<dt>상담일</dt><dd>' + esc(FeedbackEngine.formatDate(c.date)) + '</dd>';
    html += '<dt>상담 대상</dt><dd>' + esc(cnsTargetLabel(c.target)) + '</dd>';
    html += '<dt>상담 유형</dt><dd>' + esc(cnsTypeLabel(c.type)) + '</dd>';
    html += '<dt>상담 교사</dt><dd>' + esc(c.counselor || '-') + '</dd>';
    html += '<dt>다음 확인일</dt><dd>' + (c.nextCheckDate ? esc(FeedbackEngine.formatDate(c.nextCheckDate)) : '지정 안 함') + '</dd>';
    html += '</dl>';
    html += '<div class="btn-row" style="margin-top:12px">';
    html += '<a class="btn btn--ghost btn--sm" href="#/counsel/' + esc(id) + '/edit">기록 수정</a>';
    html += '<a class="btn btn--ghost btn--sm" href="#/counsels?student=' + esc(c.studentId) + '">이 학생 상담 기록</a>';
    html += '</div></div>';

    // AI 요약 — 원문과 별도 필드
    html += '<h2 class="section-title">상담 요약 <small style="font-weight:400">3~5줄</small></h2>';
    html += '<div id="cnsWarnArea"></div>';
    html += '<div class="card">';
    html += '<textarea id="cnsSummary" placeholder="아래 버튼을 눌러 요약을 만들어 주세요.">' + esc((c.summary && c.summary.text) || '') + '</textarea>';
    if (c.summary && c.summary.generatedAt) {
      html += '<div class="list__meta" style="margin-top:6px">' +
        (c.summary.engine === 'ai' ? 'AI' : '규칙 기반') + ' · ' +
        esc(new Date(c.summary.generatedAt).toLocaleString('ko-KR')) +
        (c.summary.edited ? ' · 직접 수정함' : '') + '</div>';
    }
    html += '<div class="btn-row" style="margin-top:12px">';
    html += '<button class="btn" id="cnsGenBtn">요약 만들기</button>';
    html += '<button class="btn btn--ghost" id="cnsSaveSummaryBtn">요약 저장</button>';
    html += '</div></div>';

    // 원문 — 절대 바뀌지 않음
    html += '<h2 class="section-title">상담 내용 원문 <small style="font-weight:400">요약을 다시 만들어도 바뀌지 않습니다</small></h2>';
    html += '<div class="fb-preview">' + esc(c.content) + '</div>';

    if (c.parentRequest || c.academyReply) {
      html += '<div class="card" style="margin-top:14px">';
      if (c.parentRequest) html += '<h3 class="card__title">학부모 요청사항</h3><div class="fb-preview" style="margin-bottom:14px">' + esc(c.parentRequest) + '</div>';
      if (c.academyReply) html += '<h3 class="card__title">학원 답변</h3><div class="fb-preview">' + esc(c.academyReply) + '</div>';
      html += '</div>';
    }

    // 후속조치
    if (fu.needed) {
      html += '<div class="card"><h3 class="card__title">후속조치 ' +
        (fu.done ? '<span class="badge badge--final">완료</span>' : '<span class="badge badge--edited">진행 필요</span>') + '</h3>';
      html += '<div class="fb-preview" style="margin-bottom:12px">' + esc(fu.text || '(내용 없음)') + '</div>';
      if (fu.done) {
        html += '<div class="note note--ok">' + esc(new Date(fu.doneAt || Date.now()).toLocaleString('ko-KR')) + ' 완료 처리</div>';
        html += '<button class="btn btn--ghost btn--block" id="fuUndoBtn">완료 표시 해제</button>';
      } else {
        html += '<button class="btn btn--ok btn--block" id="fuDoneBtn">후속조치 완료로 표시</button>';
      }
      html += '</div>';
    }

    // 작성·수정 이력 (기능 6)
    html += '<div class="card"><h3 class="card__title">작성 · 수정 이력</h3><dl class="kv">';
    html += '<dt>최초 작성</dt><dd>' + esc(new Date(c.createdAt).toLocaleString('ko-KR')) + '</dd>';
    html += '<dt>마지막 수정</dt><dd>' + (c.updatedAt && c.updatedAt !== c.createdAt
      ? esc(new Date(c.updatedAt).toLocaleString('ko-KR')) : '수정한 적 없음') + '</dd>';
    html += '</dl>';
    if (c.history && c.history.length) {
      html += '<div style="margin-top:12px">' + c.history.slice().reverse().slice(0, 10).map(function (h) {
        return '<div class="hw-item"><span class="hw-item__text"><b>' +
          esc(new Date(h.at).toLocaleString('ko-KR')) + '</b><br><span style="color:var(--text-dim)">' +
          esc((h.changed || []).join(', ')) + ' 수정</span></span></div>';
      }).join('') + '</div>';
    }
    html += '</div>';

    view.innerHTML = html;
    bindAutoGrow(view);

    $('#cnsGenBtn').addEventListener('click', function () {
      var latest = Store.getCounsel(id);
      var btn = $('#cnsGenBtn');
      var useAI = settings.engine === 'ai' && AIClient.isConfigured(settings);

      function apply(lines, engine) {
        var text = CounselEngine.formatLines(lines);
        $('#cnsSummary').value = text;
        autoGrow($('#cnsSummary'));
        var check = CounselEngine.verifySummary(lines, latest);
        renderWarningsInto('#cnsWarnArea', engine === 'ai' ? check : { errors: [], warnings: check.warnings });
        var r = Store.saveCounselSummary(id, { text: text, lines: lines, engine: engine });
        if (!r.ok) return toast(r.error, 'err');
        toast(lines.length + '줄로 요약했습니다.', 'ok');
      }

      if (!useAI) return apply(CounselEngine.summarizeRuleBased(latest), 'rule');

      btn.disabled = true;
      var prev = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> 요약하는 중…';
      AIClient.summarizeCounsel(latest, settings)
        .then(function (lines) { apply(lines, 'ai'); })
        .catch(function (err) {
          console.error(err);
          toast('AI 요약 실패 — 규칙 기반으로 만들었습니다.', 'err');
          apply(CounselEngine.summarizeRuleBased(latest), 'rule');
        })
        .then(function () { btn.disabled = false; btn.innerHTML = prev; });
    });

    $('#cnsSaveSummaryBtn').addEventListener('click', function () {
      var text = $('#cnsSummary').value;
      var lines = text.split('\n').map(function (l) { return l.replace(/^[-·*•]\s*/, '').trim(); }).filter(Boolean);
      var r = Store.saveCounselSummary(id, { text: text, lines: lines, edited: true });
      if (!r.ok) return toast(r.error, 'err');
      renderWarningsInto('#cnsWarnArea', CounselEngine.verifySummary(lines, Store.getCounsel(id)));
      toast('요약을 저장했습니다.', 'ok');
    });

    var fuDone = $('#fuDoneBtn');
    if (fuDone) fuDone.addEventListener('click', function () {
      var r = Store.setFollowUpDone(id, true);
      if (!r.ok) return toast(r.error, 'err');
      toast('후속조치를 완료로 표시했습니다.', 'ok');
      renderCounselDetail(id);
    });
    var fuUndo = $('#fuUndoBtn');
    if (fuUndo) fuUndo.addEventListener('click', function () {
      var r = Store.setFollowUpDone(id, false);
      if (!r.ok) return toast(r.error, 'err');
      renderCounselDetail(id);
    });
  }

  // ───────────────────────── 내신 관리 ─────────────────────────

  /** 남은 기간 배지 (기능 3) */
  function ddayBadge(exam) {
    var d = Store.examDday(exam);
    if (d == null) return '';
    if (d < 0) return '<span class="badge">종료</span>';
    if (d === 0) return '<span class="badge badge--archived">오늘 시험</span>';
    if (d <= 7) return '<span class="badge badge--archived">D-' + d + '</span>';
    if (d <= 14) return '<span class="badge badge--edited">D-' + d + '</span>';
    return '<span class="badge badge--generated">D-' + d + '</span>';
  }

  // ── 시험 목록 ──
  function renderExams() {
    setHeader('내신 관리', '', false);
    var list = Store.getExams();
    var html = '';

    html += '<a class="btn btn--block" href="#/exam/new">+ 학교 시험 정보 등록</a>';
    html += '<div class="note note--info" style="margin-top:14px">학교·학년별로 <b>한 번만 등록</b>하면 그 학교 학생들에게 자동으로 연결됩니다.</div>';

    if (!list.length) {
      html += '<div class="empty"><span class="empty__icon">📝</span>등록된 시험 정보가 없습니다.</div>';
    } else {
      html += '<h2 class="section-title">등록된 시험</h2><ul class="list">' + list.map(function (e) {
        var students = Store.getExamStudents(e.id);
        var ready = students.filter(function (st) {
          return Store.prepProgress(e, Store.getPrep(e.id, st.id)).ready;
        }).length;
        var meta = [e.school, e.grade, e.textbook].filter(Boolean).join(' · ');
        return '<a class="list__item" href="#/exam/' + esc(e.id) + '">' +
          '<div class="list__row"><span class="list__name">' + esc(e.term) + '</span>' + ddayBadge(e) + '</div>' +
          '<div class="list__meta">' + esc(meta) + '</div>' +
          '<div class="list__meta">' + esc(FeedbackEngine.formatDate(e.examDate)) +
            ' · 연결 학생 ' + students.length + '명' + (students.length ? ' (준비 완료 ' + ready + '명)' : '') + '</div>' +
        '</a>';
      }).join('') + '</ul>';
    }
    view.innerHTML = html;
  }

  // ── 학교 공통 시험 정보 입력 ──
  function renderExamForm(id) {
    var isNew = !id;
    var e = isNew ? null : Store.getExam(id);
    if (!isNew && !e) { toast('시험 정보를 찾을 수 없습니다.', 'err'); return go('#/exams'); }
    setHeader(isNew ? '학교 시험 정보 등록' : '시험 정보 수정', '', true);

    var allStudents = Store.getStudents();
    var schools = {}, grades = {};
    allStudents.forEach(function (st) {
      if (st.school) schools[st.school] = true;
      if (st.grade) grades[st.grade] = true;
    });

    var units = (e && e.units) || [];
    var grammar = (e && e.grammarPoints) || [];

    var html = '<form id="examForm"><div class="card"><h3 class="card__title">학교 공통 정보 <small>이 학교 학생 모두에게 적용</small></h3>';
    html += '<div class="filters">';
    html += '<div><label class="field__label">학교명<span class="req">*</span></label>' +
            '<input type="text" name="school" id="exSchool" value="' + esc(e ? e.school : '') + '" list="schoolList" required placeholder="예: 정왕중">' +
            '<datalist id="schoolList">' + Object.keys(schools).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></div>';
    html += '<div><label class="field__label">학년</label>' +
            '<input type="text" name="grade" id="exGrade" value="' + esc(e ? e.grade : '') + '" list="gradeList" placeholder="비우면 학교 전체">' +
            '<datalist id="gradeList">' + Object.keys(grades).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></div>';
    html += '</div>';
    html += '<div class="note note--info" id="matchNote" style="margin-bottom:14px"></div>';

    html += field('시험 이름', '<input type="text" name="term" value="' + esc(e ? e.term : '') + '" required placeholder="예: 2학기 중간고사">', true);
    html += field('교과서 / 출판사', '<input type="text" name="textbook" value="' + esc(e ? e.textbook : '') + '" placeholder="예: 천재(이재영)">');
    html += field('시험일', '<input type="date" name="examDate" value="' + esc(e ? e.examDate : '') + '" required>', true);
    html += '</div>';

    // 시험범위 = 단원 목록
    html += '<div class="card"><h3 class="card__title">시험범위 (단원) <small>학생별 준비 상태의 기준이 됩니다</small></h3>';
    html += '<div id="unitList">' + (units.length ? units.map(function (u) { return hwEditRow('unit', { id: u.id, text: u.name }); }).join('') : hwEditRow('unit', {})) + '</div>';
    html += '<div class="btn-row" style="margin-top:8px"><button type="button" class="btn btn--ghost btn--sm" id="addUnit">+ 단원 추가</button></div>';
    html += field('시험범위 참고 메모', '<textarea name="rangeNote" placeholder="예: 교과서 본문 + 워크북 문제, 부교재 3~4과">' + esc(e ? e.rangeNote : '') + '</textarea>');
    html += '</div>';

    // 문법 범위
    html += '<div class="card"><h3 class="card__title">문법 범위 <small>학생별 취약 문법 선택지가 됩니다</small></h3>';
    html += '<div id="grammarList">' + (grammar.length ? grammar.map(function (g) { return hwEditRow('grammar', { id: g.id, text: g.name }); }).join('') : hwEditRow('grammar', {})) + '</div>';
    html += '<div class="btn-row" style="margin-top:8px"><button type="button" class="btn btn--ghost btn--sm" id="addGrammar">+ 문법 추가</button></div>';
    html += '</div>';

    html += '<div class="card"><h3 class="card__title">수행평가 · 서술형</h3>';
    html += field('안내 내용', '<textarea name="performance" placeholder="예: 서술형 30% · 본문 요약 쓰기 수행평가 10월 8일">' + esc(e ? e.performance : '') + '</textarea>');
    html += '</div>';

    html += '<div class="btn-row"><button type="submit" class="btn btn--block">' + (isNew ? '등록하기' : '수정 내용 저장') + '</button></div>';
    html += '</form>';

    if (!isNew) {
      html += '<button class="btn btn--ghost btn--block" id="exArchiveBtn" style="margin-top:12px">' +
              (e.archived ? '보관 해제하기' : '이 시험 정보 보관하기') + '</button>';
    }
    view.innerHTML = html;

    bindEditList('#unitList', '#addUnit', 'unit');
    bindEditList('#grammarList', '#addGrammar', 'grammar');

    /** 지금 조건에 몇 명이 걸리는지 바로 보여 준다 (연결이 맞는지 확인용) */
    function refreshMatch() {
      var school = $('#exSchool').value.trim();
      var grade = $('#exGrade').value.trim();
      var n = school ? allStudents.filter(function (st) {
        if (String(st.school || '').trim() !== school) return false;
        if (grade && String(st.grade || '').trim() !== grade) return false;
        return true;
      }).length : 0;
      var box = $('#matchNote');
      if (!school) { box.textContent = '학교명을 입력하면 연결될 학생 수를 알려 드립니다.'; box.className = 'note note--info'; return; }
      if (n === 0) {
        box.innerHTML = '이 조건에 맞는 학생이 <b>없습니다.</b> 학생 화면의 학교·학년 표기와 같은지 확인해 주세요.';
        box.className = 'note note--warn';
      } else {
        box.innerHTML = '이 조건에 맞는 학생 <b>' + n + '명</b>이 자동으로 연결됩니다.';
        box.className = 'note note--ok';
      }
    }
    $('#exSchool').addEventListener('input', refreshMatch);
    $('#exGrade').addEventListener('input', refreshMatch);
    refreshMatch();

    $('#examForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var r = Store.saveExam({
        id: isNew ? null : id,
        school: fd.get('school'), grade: fd.get('grade'), term: fd.get('term'),
        textbook: fd.get('textbook'), examDate: fd.get('examDate'),
        units: readEditRows('#unitList').map(function (x) { return { id: x.id, name: x.text }; }),
        rangeNote: fd.get('rangeNote'),
        grammarPoints: readEditRows('#grammarList').map(function (x) { return { id: x.id, name: x.text }; }),
        performance: fd.get('performance')
      });
      if (!r.ok) return toast(r.error, 'err');
      toast('저장했습니다.', 'ok');
      go('#/exam/' + r.id);
    });

    var ab = $('#exArchiveBtn');
    if (ab) ab.addEventListener('click', function () {
      confirmBox(e.archived ? '이 시험 정보를 다시 표시할까요?' : '이 시험 정보를 보관할까요?\n학생 준비 기록은 삭제되지 않습니다.',
                 e.archived ? '보관 해제' : '보관하기').then(function (ok) {
        if (!ok) return;
        var r = Store.setExamArchived(id, !e.archived);
        if (!r.ok) return toast(r.error, 'err');
        go('#/exams');
      });
    });
  }

  // ── 시험 상세 : 공통 정보 + 연결된 학생 진행률 ──
  function renderExamDetail(id) {
    var e = Store.getExam(id);
    if (!e) { toast('시험 정보를 찾을 수 없습니다.', 'err'); return go('#/exams'); }
    var students = Store.getExamStudents(id);
    var dday = Store.examDday(e);
    setHeader(e.term, [e.school, e.grade].filter(Boolean).join(' '), true);

    var html = '';

    html += '<div class="card"><h3 class="card__title">시험 정보 ' + ddayBadge(e) + '</h3><dl class="kv">';
    html += '<dt>학교 · 학년</dt><dd>' + esc([e.school, e.grade].filter(Boolean).join(' ')) + '</dd>';
    html += '<dt>교과서</dt><dd>' + esc(e.textbook || '-') + '</dd>';
    html += '<dt>시험일</dt><dd>' + esc(FeedbackEngine.formatDate(e.examDate)) + ' · <b>' + esc(ExamEngine.ddayLabel(dday)) + '</b></dd>';
    html += '<dt>시험범위</dt><dd>' + (e.units.length ? esc(e.units.map(function (u) { return u.name; }).join(', ')) : '입력 없음') + '</dd>';
    if (e.rangeNote) html += '<dt>범위 메모</dt><dd>' + esc(e.rangeNote) + '</dd>';
    html += '<dt>문법 범위</dt><dd>' + (e.grammarPoints.length ? esc(e.grammarPoints.map(function (g) { return g.name; }).join(', ')) : '입력 없음') + '</dd>';
    if (e.performance) html += '<dt>수행 · 서술형</dt><dd>' + esc(e.performance) + '</dd>';
    html += '</dl>';
    html += '<div class="btn-row" style="margin-top:12px"><a class="btn btn--ghost btn--sm" href="#/exam/' + esc(id) + '/edit">시험 정보 수정</a></div>';
    html += '</div>';

    html += '<h2 class="section-title">연결된 학생 ' + students.length + '명</h2>';
    if (!students.length) {
      html += '<div class="note note--warn">이 학교·학년에 해당하는 학생이 없습니다.<br>' +
              '학생 화면에서 학교·학년 표기가 <b>' + esc(e.school) + (e.grade ? ' / ' + esc(e.grade) : '') + '</b> 와 같은지 확인해 주세요.</div>';
    } else if (!e.units.length) {
      html += '<div class="note note--warn">시험범위(단원)를 먼저 등록해야 학생별 준비 상태를 체크할 수 있습니다.</div>';
    } else {
      html += '<ul class="list">' + students.map(function (st) {
        var prep = Store.getPrep(id, st.id);
        var pg = Store.prepProgress(e, prep);
        var flags = '';
        if (pg.ready) flags += '<span class="badge badge--final">준비 완료</span>';
        else flags += '<span class="badge badge--edited">남은 항목 ' + pg.remain + '</span>';
        if (pg.weakGrammarCount) flags += ' <span class="badge badge--archived">취약 문법 ' + pg.weakGrammarCount + '</span>';
        if (pg.needsExtra) flags += ' <span class="badge badge--archived">보강 필요</span>';
        return '<a class="list__item" href="#/prep/' + esc(id) + '/' + esc(st.id) + '">' +
          '<div class="list__row"><span class="list__name">' + esc(st.name) + '</span>' +
            (prep.targetScore ? '<span class="badge">목표 ' + esc(prep.targetScore) + '점</span>' : '') + '</div>' +
          '<div class="progress"><div class="progress__bar" style="width:' + pg.percent + '%"></div></div>' +
          '<div class="list__meta">준비 ' + pg.done + '/' + pg.total + ' (' + pg.percent + '%)' +
            (pg.wrongCount ? ' · 오답 ' + pg.wrongCount + '문항' : '') + '</div>' +
          '<div style="margin-top:6px">' + flags + '</div>' +
        '</a>';
      }).join('') + '</ul>';
    }
    view.innerHTML = html;
  }

  // ── 학생별 준비 상태 체크 + 체크리스트 ──
  function statePicker(kind, unitId, cur) {
    return '<div class="seg" data-kind="' + kind + '" data-unit="' + esc(unitId) + '">' +
      Store.PREP_STATES.map(function (st) {
        return '<button type="button" class="seg__btn" data-state="' + st.code + '" aria-pressed="' +
          ((cur || 'todo') === st.code ? 'true' : 'false') + '">' + esc(st.label) + '</button>';
      }).join('') + '</div>';
  }

  function renderPrep(examId, studentId) {
    var e = Store.getExam(examId);
    var st = Store.getStudent(studentId);
    if (!e || !st) { toast('기록을 찾을 수 없습니다.', 'err'); return go('#/exams'); }
    var prep = Store.getPrep(examId, studentId);
    var settings = Store.getSettings();
    var pg = Store.prepProgress(e, prep);
    var dday = Store.examDday(e);
    setHeader(st.name + ' 시험 준비', e.term, true);

    var html = '';

    html += '<div class="card"><h3 class="card__title">' + esc(e.school) + ' ' + esc(e.grade) + ' ' + esc(e.term) + ' ' + ddayBadge(e) + '</h3>';
    html += '<div class="list__meta">' + esc(FeedbackEngine.formatDate(e.examDate)) + ' · <b>' + esc(ExamEngine.ddayLabel(dday)) + '</b>' +
            (e.textbook ? ' · ' + esc(e.textbook) : '') + '</div>';
    html += '<div class="progress"><div class="progress__bar" id="prepBar" style="width:' + pg.percent + '%"></div></div>';
    html += '<div class="list__meta" id="prepText">준비 ' + pg.done + '/' + pg.total + ' 완료 (' + pg.percent + '%)</div>';
    html += '</div>';

    html += '<form id="prepForm">';

    html += '<div class="card">';
    html += field('목표 점수', '<input type="number" name="targetScore" min="0" max="100" value="' + esc(prep.targetScore) + '" placeholder="예: 95">');
    html += '</div>';

    // 단원별 준비 상태 + 본문 암기 상태
    html += '<div class="card"><h3 class="card__title">단원별 준비 · 본문 암기</h3>';
    if (!e.units.length) {
      html += '<div class="note note--warn">시험 정보에 단원이 등록되어 있지 않습니다.</div>';
    } else {
      html += e.units.map(function (u) {
        var us = (prep.units || {})[u.id] || 'todo';
        var ms = (prep.memorize || {})[u.id] || 'todo';
        var incomplete = us !== 'done' || ms !== 'done';
        return '<div class="unit-row' + (incomplete ? ' unit-row--pending' : '') + '">' +
          '<div class="unit-row__name">' + esc(u.name) +
            (incomplete ? '<span class="badge badge--edited" style="margin-left:6px">미완료</span>' : '<span class="badge badge--final" style="margin-left:6px">완료</span>') + '</div>' +
          '<div class="unit-row__line"><span class="unit-row__label">단원 준비</span>' + statePicker('units', u.id, us) + '</div>' +
          '<div class="unit-row__line"><span class="unit-row__label">본문 암기</span>' + statePicker('memorize', u.id, ms) + '</div>' +
        '</div>';
      }).join('');
    }
    html += '</div>';

    // 취약 문법
    html += '<div class="card"><h3 class="card__title">취약 문법</h3>';
    if (e.grammarPoints.length) {
      html += '<div class="chip-row" style="margin-bottom:12px">' + e.grammarPoints.map(function (g) {
        var on = (prep.weakGrammar || []).indexOf(g.id) !== -1;
        return '<button type="button" class="btn btn--sm ' + (on ? '' : 'btn--ghost') + ' grammar-chip" data-id="' + esc(g.id) + '" aria-pressed="' + on + '">' + esc(g.name) + '</button>';
      }).join('') + '</div>';
    } else {
      html += '<div class="list__meta" style="margin-bottom:12px">시험 정보에 문법 범위가 등록되어 있지 않습니다.</div>';
    }
    html += field('그 밖에 약한 부분', '<textarea name="weakGrammarNote" placeholder="예: 관계대명사 what 용법">' + esc(prep.weakGrammarNote) + '</textarea>');
    html += '</div>';

    html += '<div class="card"><h3 class="card__title">오답 · 보강</h3>';
    html += field('오답 수', '<input type="number" name="wrongCount" min="0" value="' + esc(prep.wrongCount || 0) + '">', false, '시험 대비 문제집에서 틀린 문항 수');
    html += '<label class="check-label" style="margin-bottom:14px">' +
            '<input type="checkbox" name="needsExtra" id="needsExtra" style="width:auto"' + (prep.needsExtra ? ' checked' : '') + '> 보강이 필요합니다</label>';
    html += '<div id="extraBox"' + (prep.needsExtra ? '' : ' hidden') + '>';
    html += field('보강 내용', '<textarea name="extraNote" placeholder="예: 주말 보강 1회 — 관계대명사 집중">' + esc(prep.extraNote) + '</textarea>');
    html += '</div></div>';

    html += '<div class="btn-row"><button type="submit" class="btn btn--block">준비 상태 저장</button></div>';
    html += '</form>';

    // 체크리스트 (기능 5)
    html += '<h2 class="section-title">시험 전 최종 체크리스트</h2>';
    html += '<div id="prepWarnArea"></div>';
    html += '<div class="fb-preview" id="checklistBox">' + esc((prep.checklist && prep.checklist.text) || '아래 버튼을 눌러 체크리스트를 만들어 주세요.') + '</div>';
    html += '<div class="btn-row" style="margin-top:12px">';
    html += '<button class="btn" id="checklistBtn">체크리스트 만들기</button>';
    html += '<button class="btn btn--ghost" id="checklistCopyBtn">복사</button>';
    html += '</div>';
    html += '<label class="check-label check-label--help" style="margin-top:14px">' +
            '<input type="checkbox" id="includeDone" style="width:auto"> 이미 끝낸 항목도 함께 넣기</label>';

    view.innerHTML = html;
    bindAutoGrow(view);

    // 3단계 선택 버튼
    $$('.seg').forEach(function (seg) {
      seg.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.seg__btn');
        if (!btn) return;
        $$('.seg__btn', seg).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
      });
    });

    $$('.grammar-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var on = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', String(!on));
        chip.classList.toggle('btn--ghost', on);
      });
    });

    $('#needsExtra').addEventListener('change', function (ev) { $('#extraBox').hidden = !ev.target.checked; });

    function collect() {
      var fd = new FormData($('#prepForm'));
      var units = {}, memorize = {};
      $$('.seg').forEach(function (seg) {
        var on = seg.querySelector('.seg__btn[aria-pressed="true"]');
        var code = on ? on.dataset.state : 'todo';
        (seg.dataset.kind === 'units' ? units : memorize)[seg.dataset.unit] = code;
      });
      return {
        examId: examId, studentId: studentId,
        targetScore: fd.get('targetScore'),
        units: units, memorize: memorize,
        weakGrammar: $$('.grammar-chip').filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; })
          .map(function (c) { return c.dataset.id; }),
        weakGrammarNote: fd.get('weakGrammarNote'),
        wrongCount: fd.get('wrongCount'),
        needsExtra: !!fd.get('needsExtra'),
        extraNote: fd.get('extraNote')
      };
    }

    $('#prepForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var r = Store.savePrep(collect());
      if (!r.ok) return toast(r.error, 'err');
      toast('준비 상태를 저장했습니다.', 'ok');
      renderPrep(examId, studentId);
    });

    $('#checklistBtn').addEventListener('click', function () {
      var r = Store.savePrep(collect());       // 화면에서 바꾼 내용을 먼저 반영한다
      if (!r.ok) return toast(r.error, 'err');
      var latest = Store.getPrep(examId, studentId);
      var text = ExamEngine.buildChecklist(e, latest, settings, { includeDone: $('#includeDone').checked });
      $('#checklistBox').textContent = text;
      renderWarningsInto('#prepWarnArea', ExamEngine.verifyChecklist(text, e, latest));
      Store.savePrepChecklist(examId, studentId, text);
      toast('체크리스트를 만들었습니다.', 'ok');
    });

    $('#checklistCopyBtn').addEventListener('click', function () {
      var text = $('#checklistBox').textContent;
      if (!text.trim() || text.indexOf('버튼을 눌러') !== -1) return toast('먼저 체크리스트를 만들어 주세요.', 'err');
      copyText(text).then(function () { toast('복사했습니다.', 'ok'); })
                    .catch(function () { toast('복사에 실패했습니다.', 'err'); });
    });
  }

  // ───────────────────────── 월간 학습 리포트 ─────────────────────────

  function reportBadge(st) {
    var m = Store.REPORT_STATUS[st] || Store.REPORT_STATUS.generated;
    return '<span class="badge badge--' + m.code + '">' + esc(m.label) + '</span>';
  }

  // ── 리포트 목록 ──
  var rptFilter = { studentId: '' };

  function renderReports() {
    var students = Store.getStudents({ includeArchived: true });
    var list = Store.getReports(rptFilter.studentId ? { studentId: rptFilter.studentId } : {});
    var who = rptFilter.studentId ? (Store.getStudent(rptFilter.studentId) || {}).name : '';
    setHeader('월간 리포트', who ? who + ' 학생' : '', !!rptFilter.studentId);

    var html = '';
    html += '<a class="btn btn--block" href="#/report/new' + (rptFilter.studentId ? '?student=' + esc(rptFilter.studentId) : '') + '">+ 월간 리포트 만들기</a>';
    html += '<div class="note note--info" style="margin-top:14px">한 달치 <b>수업 · 숙제 · 상담 기록</b>을 모아 초안을 만들어 드립니다. 만든 뒤 직접 고칠 수 있습니다.</div>';

    html += '<div class="field"><select id="rptStudent"><option value="">전체 학생</option>' + students.map(function (st) {
      return '<option value="' + esc(st.id) + '"' + (rptFilter.studentId === st.id ? ' selected' : '') + '>' + esc(st.name) + '</option>';
    }).join('') + '</select></div>';

    if (!list.length) {
      html += '<div class="empty"><span class="empty__icon">📊</span>아직 만든 리포트가 없습니다.</div>';
    } else {
      html += '<ul class="list">' + list.map(function (r) {
        var c = (r.source && r.source.counts) || {};
        return '<a class="list__item" href="#/report/' + esc(r.id) + '">' +
          '<div class="list__row"><span class="list__name">' + esc(r.studentName) + ' · ' + esc(r.period.label) + '</span>' +
            reportBadge(r.status) + '</div>' +
          '<div class="list__meta">' + esc(r.period.from) + ' ~ ' + esc(r.period.to) +
            ' · 수업 ' + (c.lessons || 0) + '회 · 숙제 ' + (c.homeworks || 0) + '회 · 상담 ' + (c.counsels || 0) + '건</div>' +
        '</a>';
      }).join('') + '</ul>';
    }
    view.innerHTML = html;
    $('#rptStudent').addEventListener('change', function (e) { rptFilter.studentId = e.target.value; renderReports(); });
  }

  // ── 리포트 만들기 : 학생 · 기간 선택 → 집계 미리보기 ──
  function renderReportNew(presetStudent) {
    var students = Store.getStudents();
    if (!students.length) {
      setHeader('월간 리포트', '', true);
      view.innerHTML = '<div class="empty"><span class="empty__icon">👥</span>먼저 학생을 등록해야 리포트를 만들 수 있습니다.</div>' +
                       '<a class="btn btn--block" href="#/student/new">+ 학생 추가하러 가기</a>';
      return;
    }
    setHeader('월간 리포트 만들기', '', true);

    var html = '<div class="card">';
    html += field('학생', '<select id="rptNewStudent" required><option value="">— 학생 선택 —</option>' +
      students.map(function (st) {
        return '<option value="' + esc(st.id) + '"' + (presetStudent === st.id ? ' selected' : '') + '>' + esc(st.name) + '</option>';
      }).join('') + '</select>', true);
    html += field('기간 (월)', '<input type="month" id="rptMonth" value="' + esc(Store.thisMonth()) + '">', true,
      '그 달 1일부터 마지막 날까지의 기록을 모읍니다.');
    html += '</div>';
    html += '<div id="rptPreview"></div>';
    html += '<div class="btn-row"><button class="btn btn--block" id="rptMakeBtn" disabled>집계해서 초안 만들기</button></div>';
    view.innerHTML = html;

    function refresh() {
      var sid = $('#rptNewStudent').value;
      var month = $('#rptMonth').value;
      var box = $('#rptPreview');
      var btn = $('#rptMakeBtn');
      if (!sid || !month) {
        box.innerHTML = '<div class="note note--info">학생과 기간을 고르면 모을 기록을 미리 보여 드립니다.</div>';
        btn.disabled = true;
        return;
      }
      var period = Store.monthRange(month);
      var data = ReportEngine.collect(sid, period);
      var c = data.stats;
      var existing = Store.findReport(sid, period.month);

      var h = '<div class="card"><h3 class="card__title">모을 기록 <small>' + esc(period.from) + ' ~ ' + esc(period.to) + '</small></h3>';
      h += '<div class="stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:0">';
      h += '<div class="stat"><span class="stat__num">' + c.lessonCount + '</span><span class="stat__label">수업 기록</span></div>';
      h += '<div class="stat"><span class="stat__num">' + c.homework.records + '</span><span class="stat__label">숙제 기록</span></div>';
      h += '<div class="stat"><span class="stat__num">' + data.counsels.length + '</span><span class="stat__label">상담 기록</span></div>';
      h += '</div></div>';

      if (!c.lessonCount && !c.homework.records && !data.counsels.length) {
        h += '<div class="note note--warn">이 기간에 저장된 기록이 없습니다. 기록이 없으면 <b>내용이 거의 없는 리포트</b>가 만들어집니다.</div>';
      }
      if (existing) {
        h += '<div class="note note--warn">이 학생의 <b>' + esc(period.label) + ' 리포트가 이미 있습니다.</b> 계속하면 그 리포트를 다시 만듭니다.' +
             (existing.status === 'final' ? '<br>확정된 리포트라 먼저 잠금을 해제해야 합니다.' : '') + '</div>';
      }
      box.innerHTML = h;
      btn.disabled = !!(existing && existing.status === 'final');
    }

    $('#rptNewStudent').addEventListener('change', refresh);
    $('#rptMonth').addEventListener('change', refresh);
    refresh();

    $('#rptMakeBtn').addEventListener('click', function () {
      var sid = $('#rptNewStudent').value;
      var period = Store.monthRange($('#rptMonth').value);
      var student = Store.getStudent(sid);
      if (!student) return toast('학생을 선택해 주세요.', 'err');
      var settings = Store.getSettings();

      // 다가오는 시험이 있으면 다음 달 목표에 반영한다
      var upcoming = Store.getExams({ upcoming: true }).filter(function (ex) {
        if (String(student.school || '').trim() !== ex.school) return false;
        if (ex.grade && String(student.grade || '').trim() !== ex.grade) return false;
        return true;
      })[0];

      var res = ReportEngine.generate(student, period, settings, { upcomingExam: upcoming });
      var r = Store.saveReport({
        studentId: sid, period: period,
        source: res.source, stats: res.stats,
        sections: res.sections, text: res.text, status: 'generated'
      });
      if (!r.ok) return toast(r.error, 'err');
      toast('리포트 초안을 만들었습니다.', 'ok');
      go('#/report/' + r.id);
    });
  }

  // ── 리포트 상세 : 문단별 수정 + 확정 ──
  function renderReportDetail(id) {
    var rep = Store.getReport(id);
    if (!rep) { toast('리포트를 찾을 수 없습니다.', 'err'); return go('#/reports'); }
    var settings = Store.getSettings();
    var isFinal = rep.status === 'final';
    setHeader(rep.studentName + ' 리포트', rep.period.label, true);

    var src = rep.source || {};
    var counts = src.counts || {};
    var st = rep.stats || {};

    var html = '';

    // 어떤 기록으로 만들었는지 (원본 기간과 함께 저장)
    html += '<div class="card"><h3 class="card__title">집계 근거 ' + reportBadge(rep.status) + '</h3><dl class="kv">';
    html += '<dt>기간</dt><dd>' + esc(rep.period.from) + ' ~ ' + esc(rep.period.to) + ' (' + esc(rep.period.label) + ')</dd>';
    html += '<dt>수업</dt><dd>' + (counts.lessons || 0) + '회' + (st.lessonCount != null ? '' : '') + '</dd>';
    html += '<dt>숙제</dt><dd>' + (counts.homeworks || 0) + '회' +
            (st.homework && st.homework.totalItems ? ' · ' + st.homework.doneItems + '/' + st.homework.totalItems + '개 완료' : '') + '</dd>';
    html += '<dt>상담</dt><dd>' + (counts.counsels || 0) + '건</dd>';
    if (src.collectedAt) html += '<dt>집계 시각</dt><dd>' + esc(new Date(src.collectedAt).toLocaleString('ko-KR')) + '</dd>';
    html += '</dl>';
    html += '<div class="note note--info" style="margin-top:12px">이 리포트는 <b>위 기간의 기록</b>으로 만들었습니다. 이후에 원본 기록이 바뀌어도 이 리포트는 그대로 남습니다.</div>';
    html += '<div class="btn-row" style="margin-top:12px">';
    html += '<button class="btn btn--ghost btn--sm" id="rptRegenBtn"' + (isFinal ? ' disabled' : '') + '>다시 집계해서 초안 새로 만들기</button>';
    html += '</div></div>';

    html += '<div id="rptWarnArea"></div>';

    // 문단별 편집 (규칙 4 — 교사가 최종 수정)
    html += '<h2 class="section-title">리포트 문단 <small style="font-weight:400">직접 고칠 수 있습니다</small></h2>';
    html += '<div class="card' + (isFinal ? ' locked' : '') + '" id="rptEditCard">';
    ReportEngine.SECTION_ORDER.forEach(function (sec) {
      html += '<div class="fb-section"><label>' + esc(sec.title) +
        (sec.key === 'counsel' ? '<span class="opt">비우면 문단 생략</span>' : '') + '</label>' +
        '<textarea data-sec="' + sec.key + '"' + (isFinal ? ' readonly' : '') + '>' +
        esc((rep.sections && rep.sections[sec.key]) || '') + '</textarea></div>';
    });
    html += '</div>';

    html += '<h2 class="section-title">학부모 전송용 최종 문장</h2>';
    html += '<div class="fb-preview" id="rptPreviewBox">' + esc(rep.text || '문단을 채운 뒤 아래 버튼을 눌러 주세요.') + '</div>';

    html += '<div class="btn-row" style="margin-top:14px">';
    html += '<button class="btn btn--ghost" id="rptCopyBtn">복사</button>';
    if (isFinal) {
      html += '<button class="btn btn--ghost" id="rptUnlockBtn">수정 잠금 해제</button>';
    } else {
      html += '<button class="btn btn--ghost" id="rptSaveBtn">임시 저장</button>';
      html += '<button class="btn btn--ok" id="rptFinalBtn">최종 확정</button>';
    }
    html += '</div>';

    if (isFinal && rep.confirmedAt) {
      html += '<div class="note note--ok" style="margin-top:14px">' +
        esc(new Date(rep.confirmedAt).toLocaleString('ko-KR')) + ' 에 확정되었습니다.</div>';
    }

    if (rep.history && rep.history.length) {
      html += '<h2 class="section-title">수정 이력 (' + rep.history.length + '회)</h2>';
      html += '<ul class="list">' + rep.history.slice().reverse().slice(0, 5).map(function (h) {
        return '<li class="list__item"><div class="list__row"><span class="list__meta">' +
          esc(new Date(h.at).toLocaleString('ko-KR')) + '</span>' + reportBadge(h.status) + '</div>' +
          '<div class="list__excerpt">' + esc(h.text) + '</div></li>';
      }).join('') + '</ul>';
    }

    view.innerHTML = html;
    bindAutoGrow(view);

    function collectSections() {
      var out = {};
      $$('#rptEditCard textarea').forEach(function (ta) { out[ta.dataset.sec] = ta.value; });
      return out;
    }
    function refreshPreview() {
      var sections = collectSections();
      var text = ReportEngine.composeText(rep, sections, settings);
      $('#rptPreviewBox').textContent = text;
      return { sections: sections, text: text };
    }
    $$('#rptEditCard textarea').forEach(function (ta) {
      ta.addEventListener('input', refreshPreview);
    });

    // 생성 직후 검증 결과를 보여 준다
    (function showCheck() {
      var data = ReportEngine.collect(rep.studentId, rep.period);
      var check = ReportEngine.verify(rep.sections || {}, data, rep);
      renderWarningsInto('#rptWarnArea', check);
    })();

    var regen = $('#rptRegenBtn');
    if (regen) regen.addEventListener('click', function () {
      confirmBox('지금 저장된 기록으로 초안을 다시 만들까요?\n직접 고치신 문장은 사라집니다.', '다시 만들기').then(function (ok) {
        if (!ok) return;
        var student = Store.getStudent(rep.studentId);
        if (!student) return toast('학생을 찾을 수 없습니다.', 'err');
        var upcoming = Store.getExams({ upcoming: true }).filter(function (ex) {
          if (String(student.school || '').trim() !== ex.school) return false;
          if (ex.grade && String(student.grade || '').trim() !== ex.grade) return false;
          return true;
        })[0];
        var res = ReportEngine.generate(student, rep.period, settings, { upcomingExam: upcoming });
        var r = Store.saveReport({
          id: rep.id, studentId: rep.studentId, period: rep.period,
          source: res.source, stats: res.stats, sections: res.sections, text: res.text, status: 'generated'
        });
        if (!r.ok) return toast(r.error, 'err');
        toast('초안을 다시 만들었습니다.', 'ok');
        renderReportDetail(id);
      });
    });

    var saveBtn = $('#rptSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var res = refreshPreview();
      var r = Store.saveReport({
        id: rep.id, studentId: rep.studentId, period: rep.period,
        source: rep.source, stats: rep.stats,
        sections: res.sections, text: res.text, status: 'edited'
      });
      if (!r.ok) return toast(r.error, 'err');
      toast('임시 저장했습니다.', 'ok');
      rep = Store.getReport(id);
    });

    var finalBtn = $('#rptFinalBtn');
    if (finalBtn) finalBtn.addEventListener('click', function () {
      var res = refreshPreview();
      if (!res.text.trim()) return toast('내용이 비어 있습니다.', 'err');
      var data = ReportEngine.collect(rep.studentId, rep.period);
      var check = ReportEngine.verify(res.sections, data, rep);
      renderWarningsInto('#rptWarnArea', check);
      var proceed = Promise.resolve(true);
      if (check.errors.length) {
        proceed = confirmBox('기록에 없는 내용이 ' + check.errors.length + '건 있습니다.\n\n' +
          check.errors.slice(0, 3).map(function (e) { return '· ' + e.message; }).join('\n') +
          '\n\n그래도 확정하시겠습니까?', '확인하고 확정');
      }
      proceed.then(function (ok) {
        if (!ok) return;
        var r = Store.saveReport({
          id: rep.id, studentId: rep.studentId, period: rep.period,
          source: rep.source, stats: rep.stats,
          sections: res.sections, text: res.text, status: 'final'
        });
        if (!r.ok) return toast(r.error, 'err');
        toast('최종 확정했습니다.', 'ok');
        renderReportDetail(id);
      });
    });

    var unlockBtn = $('#rptUnlockBtn');
    if (unlockBtn) unlockBtn.addEventListener('click', function () {
      confirmBox('확정을 해제하고 다시 수정할 수 있게 할까요?', '잠금 해제').then(function (ok) {
        if (!ok) return;
        var r = Store.unlockReport(id);
        if (!r.ok) return toast(r.error, 'err');
        renderReportDetail(id);
      });
    });

    $('#rptCopyBtn').addEventListener('click', function () {
      var text = isFinal ? rep.text : refreshPreview().text;
      if (!text.trim()) return toast('복사할 내용이 없습니다.', 'err');
      copyText(text).then(function () { toast('복사했습니다.', 'ok'); })
                    .catch(function () { toast('복사에 실패했습니다.', 'err'); });
    });
  }

  // ───────────────────────── 구글 시트 전송 ─────────────────────────

  /**
   * 저장이 끝난 뒤 시트로 한 벌 더 보낸다.
   * 실패해도 기기에 저장된 기록은 그대로이므로, 대기줄에 적어 두고 조용히 넘어간다.
   * (수업 중에 인터넷이 끊겼다고 저장 흐름을 막으면 안 된다)
   */
  function sendToSheet(type, record) {
    var settings = Store.getSettings();
    if (!SheetsClient.isConfigured(settings)) return;
    if (!settings.sheets.autoSend) return;
    if (!record || !record.id) return;

    Store.queueForSheet(type, record.id);
    SheetsClient.send(type, [record], settings)
      .then(function (r) {
        if (r && r.ok) Store.unqueueForSheet(type, record.id);
        else console.warn('구글 시트가 거부했습니다:', r && r.message);
      })
      .catch(function (err) {
        console.warn('구글 시트로 보내지 못했습니다:', err.message);
      });
  }

  /** 대기줄에 남은 기록을 한꺼번에 다시 보낸다 */
  function flushSheetQueue() {
    var settings = Store.getSettings();
    if (!SheetsClient.isConfigured(settings)) {
      return Promise.resolve({ sent: 0, failed: 0, message: '구글 시트가 설정되어 있지 않습니다.' });
    }
    var pending = Store.getQueuedRecords();
    if (!pending.length) return Promise.resolve({ sent: 0, failed: 0, message: '보낼 기록이 없습니다.' });

    var byType = {};
    pending.forEach(function (p) { (byType[p.type] = byType[p.type] || []).push(p.record); });

    var sent = 0, failed = 0, firstError = '';
    var jobs = Object.keys(byType).map(function (type) {
      return SheetsClient.send(type, byType[type], settings)
        .then(function (r) {
          if (r && r.ok) {
            byType[type].forEach(function (rec) { Store.unqueueForSheet(type, rec.id); });
            sent += byType[type].length;
          } else {
            failed += byType[type].length;
            if (!firstError) firstError = (r && r.message) || '거부되었습니다.';
          }
        })
        .catch(function (err) {
          failed += byType[type].length;
          if (!firstError) firstError = err.message;
        });
    });

    return Promise.all(jobs).then(function () {
      return { sent: sent, failed: failed, message: firstError };
    });
  }

  // ───────────────────────── 설정 ─────────────────────────

  function renderSettings() {
    setHeader('설정', '', false);
    var s = Store.getSettings();
    var teachers = Store.getTeachers();
    var stats = Store.getStats();

    var html = '';

    html += '<div class="card"><h3 class="card__title">학원 정보</h3>';
    html += field('학원 이름', '<input type="text" id="academyName" value="' + esc(s.academyName) + '">', true);
    html += field('문장 끝 서명', '<input type="text" id="signature" value="' + esc(s.signature) + '" placeholder="비우면 학원 이름이 들어갑니다">');
    html += '</div>';

    html += '<div class="card"><h3 class="card__title">문장 만들기 방식</h3>';
    html += field('말투(톤)', '<select id="tone">' +
      [['concise', '간결 — 군더더기 없이 짧게'], ['default', '기본 — 정중한 안내문'], ['warm', '따뜻함 — 친근한 표현 추가']]
        .map(function (t) { return '<option value="' + t[0] + '"' + (s.tone === t[0] ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') +
      '</select>', true);
    html += field('생성 엔진', '<select id="engine">' +
      [['rule', '규칙 기반 (권장 · 안전) — 입력 원문만 사용'], ['ai', 'AI 다듬기 — 문장을 자연스럽게 정리']]
        .map(function (t) { return '<option value="' + t[0] + '"' + (s.engine === t[0] ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') +
      '</select>', true);
    html += '<div class="note note--info">‘규칙 기반’은 선생님이 쓴 글에 연결어만 붙이므로 <b>없는 내용이 들어갈 수 없습니다</b>. ‘AI 다듬기’를 써도 생성 후 자동으로 원문과 대조 검사를 합니다.</div>';
    html += '</div>';

    html += '<div class="card"><h3 class="card__title">AI 연결 <small>선택 사항</small></h3>';
    html += field('모델', '<input type="text" id="aiModel" value="' + esc(s.ai.model || AIClient.DEFAULT_MODEL) + '">', false);
    html += field('프록시 주소', '<input type="text" id="aiProxy" value="' + esc(s.ai.proxyUrl) + '" placeholder="https://학원서버/api/feedback">', false,
      '학원 서버를 통해 부르는 방식입니다. 키가 기기에 남지 않아 가장 안전합니다.');
    html += field('API 키', '<input type="password" id="aiKey" value="' + esc(s.ai.apiKey) + '" placeholder="sk-ant-..." autocomplete="off">', false,
      '이 기기 안에만 저장됩니다. 공용 PC에서는 입력하지 마세요.');
    html += '<div class="note note--warn">API 키를 브라우저에 넣으면 그 기기를 쓰는 사람이 볼 수 있습니다. 여러 선생님이 함께 쓰는 기기라면 <b>프록시 주소</b> 방식을 사용하세요.</div>';
    html += '</div>';

    // ── 구글 시트 ──
    var sh = s.sheets || { url: '', secret: '', autoSend: true };
    var queued = Store.getSheetQueue().length;
    html += '<div class="card"><h3 class="card__title">구글 시트 연결 <small>선택 사항</small></h3>';
    html += field('웹 앱 주소', '<input type="text" id="shUrl" value="' + esc(sh.url) + '" placeholder="복사한 주소 붙여넣기 (끝이 /exec)">', false,
      'Apps Script 에서 배포하고 받은 주소입니다. /exec 로 끝납니다.');
    html += field('비밀번호', '<input type="password" id="shSecret" value="' + esc(sh.secret) + '" autocomplete="off" placeholder="Apps Script 의 SECRET 과 같은 값">', false);
    html += '<label class="check-label check-label--help" style="margin-bottom:14px">' +
            '<input type="checkbox" id="shAuto"' + (sh.autoSend ? ' checked' : '') + '> ' +
            '기록을 저장할 때 시트에도 자동으로 보냅니다</label>';
    html += '<div class="btn-row"><button class="btn btn--ghost btn--sm" id="shTestBtn">연결 시험</button></div>';
    html += '<div id="shResult"></div>';
    if (queued) {
      html += '<div class="note note--warn" style="margin-top:12px">아직 시트로 보내지 못한 기록이 <b>' + queued + '건</b> 있습니다.' +
              '<br>기록은 이 기기에 그대로 저장되어 있습니다.</div>';
      html += '<div class="btn-row"><button class="btn btn--sm" id="shFlushBtn">지금 다시 보내기</button></div>';
    }
    html += '<div class="note note--info" style="margin-top:12px">시트로 보내는 것은 <b>덤</b>입니다. 전송이 실패해도 기록은 이 기기에 그대로 남고, 나중에 다시 보낼 수 있습니다.</div>';
    html += '</div>';

    html += '<div class="card"><h3 class="card__title">교사 목록</h3>';
    html += '<div class="inline-form" style="margin-bottom:12px"><input type="text" id="newTeacher" placeholder="교사 이름"><button class="btn btn--sm" id="addTeacherBtn">추가</button></div>';
    if (teachers.length) {
      html += '<div class="chip-row">' + teachers.map(function (t) {
        return '<span class="chip">' + esc(t) + '<button data-teacher="' + esc(t) + '" aria-label="삭제">×</button></span>';
      }).join('') + '</div>';
      html += '<div class="hint" style="margin-top:10px;color:var(--text-dim);font-size:12px">교사를 목록에서 빼도 기존 수업 기록의 교사 이름은 그대로 남습니다.</div>';
    } else {
      html += '<div class="list__meta">등록된 교사가 없습니다.</div>';
    }
    html += '</div>';

    html += '<div class="btn-row" style="margin-bottom:20px"><button class="btn btn--block" id="saveSettings">설정 저장</button></div>';

    html += '<div class="card"><h3 class="card__title">백업 / 복원</h3>';
    html += '<div class="list__meta" style="margin-bottom:12px">현재 저장된 데이터: 학생 ' + stats.students + '명 · 수업 기록 ' + stats.lessonsTotal + '건 (확정 ' + stats.finalized + '건)</div>';
    html += '<div class="btn-row">';
    html += '<button class="btn btn--ghost" id="exportBtn">백업 파일 내려받기</button>';
    html += '<button class="btn btn--ghost" id="importBtn">백업 파일 가져오기</button>';
    html += '</div>';
    html += '<input type="file" id="importFile" accept="application/json,.json" hidden>';
    html += '<div class="note note--info" style="margin-top:12px">가져오기는 <b>병합</b>입니다. 기존 데이터를 지우지 않고, 없는 기록만 추가합니다.</div>';
    html += '<div class="note note--info">이 앱의 데이터는 이 기기의 브라우저 안에만 저장됩니다. <b>주 1회 백업 파일을 내려받아</b> 두시기를 권합니다.</div>';
    html += '</div>';

    html += '<div class="card"><h3 class="card__title" style="color:var(--danger)">전체 초기화</h3>';
    html += '<div class="list__meta" style="margin-bottom:12px">모든 학생과 수업 기록이 사라집니다. 되돌릴 수 없으니 먼저 백업을 내려받으세요.</div>';
    html += '<button class="btn btn--danger btn--block" id="resetBtn">전체 초기화</button></div>';

    view.innerHTML = html;

    $('#saveSettings').addEventListener('click', function () {
      var r = Store.updateSettings({
        academyName: $('#academyName').value.trim() || '히든 아카데미',
        signature: $('#signature').value.trim(),
        tone: $('#tone').value,
        engine: $('#engine').value,
        ai: {
          model: $('#aiModel').value.trim() || AIClient.DEFAULT_MODEL,
          proxyUrl: $('#aiProxy').value.trim(),
          apiKey: $('#aiKey').value.trim()
        },
        sheets: {
          url: $('#shUrl').value.trim(),
          secret: $('#shSecret').value.trim(),
          autoSend: $('#shAuto').checked
        }
      });
      if (!r.ok) return toast(r.error, 'err');
      toast('설정을 저장했습니다.', 'ok');
    });

    $('#shTestBtn').addEventListener('click', function () {
      var btn = $('#shTestBtn');
      var box = $('#shResult');
      var settings = Object.assign({}, Store.getSettings(), {
        sheets: { url: $('#shUrl').value.trim(), secret: $('#shSecret').value.trim(), autoSend: $('#shAuto').checked }
      });
      if (!SheetsClient.isConfigured(settings)) {
        box.innerHTML = '<div class="note note--warn" style="margin-top:12px">주소와 비밀번호를 모두 입력해 주세요.</div>';
        return;
      }
      btn.disabled = true;
      var prev = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span> 확인하는 중…';
      box.innerHTML = '';
      SheetsClient.test(settings)
        .then(function (r) {
          box.innerHTML = '<div class="note note--lines note--' + (r.ok ? 'ok' : 'err') + '" style="margin-top:12px">' + esc(r.message) + '</div>';
        })
        .catch(function (err) {
          box.innerHTML = '<div class="note note--lines note--err" style="margin-top:12px">' + esc(err.message) + '</div>';
        })
        .then(function () { btn.disabled = false; btn.textContent = prev; });
    });

    var flushBtn = $('#shFlushBtn');
    if (flushBtn) flushBtn.addEventListener('click', function () {
      flushBtn.disabled = true;
      var prev = flushBtn.textContent;
      flushBtn.innerHTML = '<span class="spinner"></span> 보내는 중…';
      flushSheetQueue().then(function (r) {
        if (r.sent && !r.failed) toast(r.sent + '건을 시트로 보냈습니다.', 'ok');
        else if (r.sent) toast(r.sent + '건 성공 · ' + r.failed + '건 실패', 'err');
        else toast('보내지 못했습니다. ' + (r.message || ''), 'err');
        renderSettings();
      });
    });

    $('#addTeacherBtn').addEventListener('click', function () {
      var r = Store.addTeacher($('#newTeacher').value);
      if (!r.ok) return toast(r.error, 'err');
      renderSettings();
    });
    $$('.chip button').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmBox('"' + b.dataset.teacher + '" 을(를) 교사 목록에서 뺄까요?\n기존 수업 기록은 그대로 유지됩니다.', '목록에서 빼기').then(function (ok) {
          if (!ok) return;
          Store.removeTeacher(b.dataset.teacher);
          renderSettings();
        });
      });
    });

    $('#exportBtn').addEventListener('click', function () {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '수업피드백_백업_' + Store.todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('백업 파일을 내려받았습니다.', 'ok');
    });

    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var r = Store.importJSON(String(reader.result), 'merge');
        if (!r.ok) return toast(r.error, 'err');
        toast('학생 ' + r.added.students + '명, 기록 ' + r.added.lessons + '건을 추가했습니다.', 'ok');
        renderSettings();
      };
      reader.onerror = function () { toast('파일을 읽지 못했습니다.', 'err'); };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#resetBtn').addEventListener('click', function () {
      confirmBox('정말 모든 데이터를 지울까요?\n학생 ' + stats.students + '명, 기록 ' + stats.lessonsTotal + '건이 사라집니다.', '계속').then(function (ok) {
        if (!ok) return;
        return confirmBox('마지막 확인입니다.\n백업 파일을 내려받으셨나요? 이 작업은 되돌릴 수 없습니다.', '초기화 실행').then(function (ok2) {
          if (!ok2) return;
          Store.resetAll();
          toast('초기화했습니다.', 'ok');
          go('#/home');
        });
      });
    });
  }

  // ───────────────────────── 라우팅 ─────────────────────────

  function currentRoute() {
    var h = (global.location.hash || '#/home').replace(/^#/, '').split('?')[0];
    return h.split('/').filter(Boolean);
  }

  /** #/경로?key=value 형태의 값을 읽는다 */
  function routeQuery(key) {
    var h = (global.location.hash || '').split('?')[1];
    if (!h) return '';
    var found = '';
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (decodeURIComponent(kv[0]) === key) found = decodeURIComponent(kv[1] || '');
    });
    return found;
  }

  function render() {
    var p = currentRoute();
    view.scrollTop = 0;
    global.scrollTo(0, 0);

    try {
      switch (p[0]) {
        case 'students': renderStudents(); setTab('students'); break;
        case 'student':
          if (p[1] === 'new') renderStudentForm(null); else renderStudentForm(p[1]);
          setTab('students'); break;
        case 'lesson':
          if (p[1] === 'new') renderLessonForm(null);
          else if (p[2] === 'edit') renderLessonForm(p[1]);
          else return go('#/lessons');
          setTab('lessons'); break;
        case 'lessons': renderLessons(); setTab('lessons'); break;
        case 'feedback':
          if (!p[1]) return go('#/lessons');
          renderFeedback(p[1]); setTab('lessons'); break;
        case 'reports':
          rptFilter.studentId = routeQuery('student') || rptFilter.studentId;
          renderReports(); setTab('students'); break;
        case 'report':
          if (p[1] === 'new') renderReportNew(routeQuery('student'));
          else if (p[1]) renderReportDetail(p[1]);
          else return go('#/reports');
          setTab('students'); break;
        case 'exams': renderExams(); setTab('students'); break;
        case 'exam':
          if (p[1] === 'new') renderExamForm(null);
          else if (p[2] === 'edit') renderExamForm(p[1]);
          else if (p[1]) renderExamDetail(p[1]);
          else return go('#/exams');
          setTab('students'); break;
        case 'prep':
          if (p[1] && p[2]) renderPrep(p[1], p[2]);
          else return go('#/exams');
          setTab('students'); break;
        case 'counsels':
          cnsFilter.studentId = routeQuery('student') || cnsFilter.studentId;
          renderCounsels(); setTab('students'); break;
        case 'counsel':
          if (p[1] === 'new') renderCounselForm(null, routeQuery('student'));
          else if (p[2] === 'edit') renderCounselForm(p[1]);
          else if (p[1]) renderCounselDetail(p[1]);
          else return go('#/counsels');
          setTab('students'); break;
        case 'homeworks': renderHomeworks(); setTab('homeworks'); break;
        case 'homework':
          if (p[1] === 'new') renderHomeworkForm(null);
          else if (p[2] === 'edit') renderHomeworkForm(p[1]);
          else if (p[1]) renderHomeworkDetail(p[1]);
          else return go('#/homeworks');
          setTab('homeworks'); break;
        case 'settings': renderSettings(); setTab('settings'); break;
        case 'home':
        default: renderHome(); setTab('home'); break;
      }
      bindAutoGrow(view);
    } catch (err) {
      console.error(err);
      view.innerHTML = '<div class="note note--err">화면을 여는 중 문제가 발생했습니다.<br>' + esc(err.message) + '</div>' +
                       '<a class="btn btn--block" href="#/home">홈으로 돌아가기</a>';
    }
  }

  function setTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      if (t.dataset.tab === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
  }

  backBtn.addEventListener('click', function () {
    if (global.history.length > 1) global.history.back();
    else go('#/home');
  });

  global.addEventListener('hashchange', render);
  global.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
})(window);
