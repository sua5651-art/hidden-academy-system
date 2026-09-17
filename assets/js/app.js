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

    html += '<a class="btn btn--block" href="#/lesson/new">✏️ 새 수업 기록 작성</a>';

    html += '<h2 class="section-title">최근 기록</h2>';
    if (!recent.length) {
      html += '<div class="empty"><span class="empty__icon">📭</span>아직 저장된 수업 기록이 없습니다.<br>위 버튼으로 첫 기록을 남겨 보세요.</div>';
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
    html += '<a class="btn btn--block" href="#/student/new">＋ 학생 추가</a>';
    html += '<label class="field" style="display:flex;align-items:center;gap:8px;margin:14px 0 8px;font-size:13px;color:var(--text-dim)">' +
            '<input type="checkbox" id="showArchived" style="width:auto" ' + (showArchivedStudents ? 'checked' : '') + '> 보관된 학생도 보기</label>';

    if (!list.length) {
      html += '<div class="empty"><span class="empty__icon">👥</span>' + (studentKeyword ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.') + '</div>';
    } else {
      html += '<ul class="list">' + list.map(function (s) {
        var meta = [s.school, s.grade, s.className].filter(Boolean).join(' · ');
        var count = Store.getLessons({ studentId: s.id }).length;
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
    var s = isNew ? { name: '', school: '', grade: '', className: '', parentContact: '', note: '', archived: false }
                  : Store.getStudent(id);
    if (!s) { toast('학생을 찾을 수 없습니다.', 'err'); return go('#/students'); }
    setHeader(isNew ? '학생 추가' : '학생 수정', '', true);

    var html = '<form id="stuForm"><div class="card">';
    html += field('이름', '<input type="text" name="name" value="' + esc(s.name) + '" required autocomplete="off">', true);
    html += field('학교', '<input type="text" name="school" value="' + esc(s.school) + '" placeholder="예: 서해고">');
    html += field('학년', '<input type="text" name="grade" value="' + esc(s.grade) + '" placeholder="예: 고2">');
    html += field('반(클래스)', '<input type="text" name="className" value="' + esc(s.className) + '" placeholder="예: 내신 A반">');
    html += field('학부모 연락처', '<input type="text" name="parentContact" value="' + esc(s.parentContact) + '" inputmode="tel" placeholder="선택 입력">');
    html += field('비고', '<textarea name="note" placeholder="선택 입력">' + esc(s.note) + '</textarea>');
    html += '</div>';
    html += '<div class="btn-row"><button type="submit" class="btn btn--block">저장</button></div>';
    html += '</form>';

    if (!isNew) {
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
      (required ? '<span class="req">*</span>' : '<span class="opt">선택</span>') +
      (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') +
      '</label>' + control + '</div>';
  }

  // ───────────────────────── 수업 기록 작성/수정 ─────────────────────────

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
                       '<a class="btn btn--block" href="#/student/new">＋ 학생 추가하러 가기</a>';
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
      toast('기록을 저장했습니다.', 'ok');
      go('#/feedback/' + r.id);
    });
  }

  // ───────────────────────── 기록 목록 ─────────────────────────

  var lessonFilter = { studentId: '', status: '', keyword: '' };

  function renderLessons() {
    setHeader('기록 · 피드백', '', false);
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
    html += '<button class="btn" id="genBtn"' + (isFinal ? ' disabled' : '') + '>🤖 피드백 생성 <small style="font-weight:400;opacity:.85">(' + esc(engineLabel) + ')</small></button>';
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
    html += '<button class="btn btn--ghost" id="copyBtn">📋 복사</button>';
    if (isFinal) {
      html += '<button class="btn btn--ghost" id="unlockBtn">🔓 수정 잠금 해제</button>';
    } else {
      html += '<button class="btn btn--ghost" id="saveDraftBtn">임시 저장</button>';
      html += '<button class="btn btn--ok" id="finalBtn">✅ 최종 확정</button>';
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

  function renderWarnings(result) {
    var area = $('#warnArea');
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
    html += '<button class="btn btn--ghost" id="exportBtn">⬇ 백업 파일 내려받기</button>';
    html += '<button class="btn btn--ghost" id="importBtn">⬆ 백업 파일 가져오기</button>';
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
        }
      });
      if (!r.ok) return toast(r.error, 'err');
      toast('설정을 저장했습니다.', 'ok');
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
    var h = (global.location.hash || '#/home').replace(/^#/, '');
    return h.split('/').filter(Boolean);
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
          setTab('new'); break;
        case 'lessons': renderLessons(); setTab('lessons'); break;
        case 'feedback':
          if (!p[1]) return go('#/lessons');
          renderFeedback(p[1]); setTab('lessons'); break;
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
