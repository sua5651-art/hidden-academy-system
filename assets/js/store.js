/**
 * store.js — 데이터 저장소 (브라우저 localStorage 기반)
 *
 * 설계 원칙
 *  1) 기록은 절대 삭제하지 않는다. 숨기기(archived)만 한다.
 *  2) 피드백 문장이 바뀔 때마다 history 에 이전 내용을 남긴다.
 *  3) 저장 실패(용량 초과 등)가 나면 이전 상태로 되돌린다.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'hiddenAcademy.feedback.v1';
  var BACKUP_KEY = 'hiddenAcademy.feedback.v1.backup';
  var SCHEMA_VERSION = 1;

  var DEFAULT_STATE = {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      academyName: '히든 아카데미',
      tone: 'default',      // concise | default | warm
      engine: 'rule',       // rule | ai
      signature: '',
      ai: { model: 'claude-sonnet-5', apiKey: '', proxyUrl: '' }
    },
    teachers: [],
    students: [],
    lessons: []
  };

  /** 이해도 5단계 정의 — 화면 표시와 고정 문장을 한 곳에서 관리 */
  var UNDERSTANDING_LEVELS = [
    { code: 'excellent',  label: '매우 우수', short: '매우우수', order: 5 },
    { code: 'good',       label: '우수',      short: '우수',     order: 4 },
    { code: 'average',    label: '보통',      short: '보통',     order: 3 },
    { code: 'needs_work', label: '보완 필요', short: '보완필요', order: 2 },
    { code: 'weak',       label: '많이 부족', short: '부족',     order: 1 }
  ];

  var FEEDBACK_STATUS = {
    draft:     { code: 'draft',     label: '작성중' },
    generated: { code: 'generated', label: '생성됨' },
    edited:    { code: 'edited',    label: '수정됨' },
    final:     { code: 'final',     label: '확정' }
  };

  // ────────────────────────────── 유틸 ──────────────────────────────

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nowISO() { return new Date().toISOString(); }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /** 깊은 병합: 기본값에 저장된 값을 덮어씌워 누락 필드를 채운다 */
  function mergeDefaults(base, saved) {
    var out = clone(base);
    if (!saved || typeof saved !== 'object') return out;
    Object.keys(saved).forEach(function (k) {
      var v = saved[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = mergeDefaults(out[k], v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    });
    return out;
  }

  // ────────────────────────────── 상태 ──────────────────────────────

  var state = null;
  var listeners = [];

  function available() {
    try {
      var k = '__has_test__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    if (state) return state;
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }

    if (!raw) {
      // 저장본이 손상돼 지워졌을 가능성에 대비해 백업본을 먼저 확인한다
      try { raw = global.localStorage.getItem(BACKUP_KEY); } catch (e) { raw = null; }
    }

    if (raw) {
      try {
        state = migrate(mergeDefaults(DEFAULT_STATE, JSON.parse(raw)));
      } catch (e) {
        console.error('저장 데이터를 읽지 못했습니다. 백업본을 확인하세요.', e);
        state = clone(DEFAULT_STATE);
      }
    } else {
      state = clone(DEFAULT_STATE);
    }
    return state;
  }

  /** 앞으로 데이터 구조가 바뀌면 여기에 변환 규칙을 추가한다 */
  function migrate(s) {
    if (!s.schemaVersion || s.schemaVersion < 1) s.schemaVersion = 1;
    s.students = Array.isArray(s.students) ? s.students : [];
    s.lessons = Array.isArray(s.lessons) ? s.lessons : [];
    s.teachers = Array.isArray(s.teachers) ? s.teachers : [];
    return s;
  }

  function persist() {
    if (!state) return { ok: false, error: '저장할 데이터가 없습니다.' };
    var prev = null;
    try { prev = global.localStorage.getItem(STORAGE_KEY); } catch (e) { prev = null; }
    try {
      var json = JSON.stringify(state);
      global.localStorage.setItem(STORAGE_KEY, json);
      // 직전 정상 저장본을 백업 키에 남겨둔다 (덮어쓰기 사고 대비)
      if (prev) { try { global.localStorage.setItem(BACKUP_KEY, prev); } catch (e) {} }
      emit();
      return { ok: true };
    } catch (e) {
      // 저장 실패 시 이전 상태로 되돌린다 — 데이터 유실 방지
      if (prev !== null) { try { global.localStorage.setItem(STORAGE_KEY, prev); } catch (e2) {} }
      console.error('저장 실패', e);
      return { ok: false, error: '저장 공간이 부족하거나 브라우저가 저장을 막고 있습니다. 설정에서 백업을 내려받아 주세요.' };
    }
  }

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  // ────────────────────────────── 설정 ──────────────────────────────

  function getSettings() { return clone(load().settings); }

  function updateSettings(patch) {
    load();
    state.settings = mergeDefaults(state.settings, patch || {});
    return persist();
  }

  // ────────────────────────────── 교사 ──────────────────────────────

  function getTeachers() { return load().teachers.slice(); }

  function addTeacher(name) {
    load();
    var n = String(name || '').trim();
    if (!n) return { ok: false, error: '교사 이름을 입력해 주세요.' };
    if (state.teachers.indexOf(n) !== -1) return { ok: false, error: '이미 등록된 교사입니다.' };
    state.teachers.push(n);
    return persist();
  }

  function removeTeacher(name) {
    load();
    state.teachers = state.teachers.filter(function (t) { return t !== name; });
    return persist(); // 기존 수업 기록의 교사 이름은 그대로 보존된다
  }

  // ────────────────────────────── 학생 ──────────────────────────────

  function getStudents(opts) {
    opts = opts || {};
    var list = load().students.slice();
    if (!opts.includeArchived) list = list.filter(function (s) { return !s.archived; });
    if (opts.keyword) {
      var kw = String(opts.keyword).trim().toLowerCase();
      list = list.filter(function (s) {
        return [s.name, s.school, s.grade, s.className].join(' ').toLowerCase().indexOf(kw) !== -1;
      });
    }
    return list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });
  }

  function getStudent(id) {
    var found = load().students.filter(function (s) { return s.id === id; })[0];
    return found ? clone(found) : null;
  }

  function saveStudent(data) {
    load();
    var name = String(data.name || '').trim();
    if (!name) return { ok: false, error: '학생 이름은 반드시 입력해야 합니다.' };

    if (data.id) {
      var idx = -1;
      state.students.forEach(function (s, i) { if (s.id === data.id) idx = i; });
      if (idx === -1) return { ok: false, error: '해당 학생을 찾을 수 없습니다.' };
      var cur = state.students[idx];
      state.students[idx] = Object.assign({}, cur, {
        name: name,
        school: String(data.school || '').trim(),
        grade: String(data.grade || '').trim(),
        className: String(data.className || '').trim(),
        parentContact: String(data.parentContact || '').trim(),
        note: String(data.note || '').trim(),
        updatedAt: nowISO()
      });
      var r = persist();
      return r.ok ? { ok: true, id: data.id } : r;
    }

    var student = {
      id: uid('stu'),
      name: name,
      school: String(data.school || '').trim(),
      grade: String(data.grade || '').trim(),
      className: String(data.className || '').trim(),
      parentContact: String(data.parentContact || '').trim(),
      note: String(data.note || '').trim(),
      archived: false,
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    state.students.push(student);
    var res = persist();
    return res.ok ? { ok: true, id: student.id } : res;
  }

  /** 삭제 대신 보관/복구 — 데이터는 그대로 남는다 */
  function setStudentArchived(id, archived) {
    load();
    var s = state.students.filter(function (x) { return x.id === id; })[0];
    if (!s) return { ok: false, error: '해당 학생을 찾을 수 없습니다.' };
    s.archived = !!archived;
    s.updatedAt = nowISO();
    return persist();
  }

  // ────────────────────────────── 수업 기록 ──────────────────────────────

  function emptyInput() {
    return { progress: '', understanding: '', understandingNote: '', improve: '', homework: '', memo: '' };
  }

  function emptyFeedback() {
    return {
      status: 'draft',
      engine: '',
      sections: { today: '', state: '', improve: '', homework: '', notice: '' },
      text: '',
      generatedAt: '',
      confirmedAt: '',
      warnings: []
    };
  }

  function getLessons(filter) {
    filter = filter || {};
    var list = load().lessons.slice();
    if (!filter.includeArchived) list = list.filter(function (l) { return !l.archived; });
    if (filter.studentId) list = list.filter(function (l) { return l.studentId === filter.studentId; });
    if (filter.status) list = list.filter(function (l) { return (l.feedback && l.feedback.status) === filter.status; });
    if (filter.from) list = list.filter(function (l) { return l.date >= filter.from; });
    if (filter.to) list = list.filter(function (l) { return l.date <= filter.to; });
    if (filter.keyword) {
      var kw = String(filter.keyword).trim().toLowerCase();
      list = list.filter(function (l) {
        return [l.studentName, l.teacher, l.input && l.input.progress].join(' ').toLowerCase().indexOf(kw) !== -1;
      });
    }
    return list.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;      // 최근 날짜 먼저
      return (a.createdAt < b.createdAt) ? 1 : -1;
    });
  }

  function getLesson(id) {
    var found = load().lessons.filter(function (l) { return l.id === id; })[0];
    return found ? clone(found) : null;
  }

  /** 수업 기록 저장 (신규/수정). 피드백 문장은 건드리지 않는다. */
  function saveLesson(data) {
    load();
    var studentId = String(data.studentId || '').trim();
    var student = state.students.filter(function (s) { return s.id === studentId; })[0];
    if (!student) return { ok: false, error: '학생을 선택해 주세요.' };
    if (!data.date) return { ok: false, error: '수업 날짜를 입력해 주세요.' };
    if (!String(data.teacher || '').trim()) return { ok: false, error: '담당 교사를 입력해 주세요.' };
    if (!String((data.input && data.input.progress) || '').trim()) return { ok: false, error: '오늘 수업 진도를 입력해 주세요.' };
    if (!String((data.input && data.input.understanding) || '').trim()) return { ok: false, error: '학습 상태(이해도)를 선택해 주세요.' };

    var input = Object.assign(emptyInput(), data.input || {});
    Object.keys(input).forEach(function (k) { input[k] = String(input[k] == null ? '' : input[k]).trim(); });

    if (data.id) {
      var idx = -1;
      state.lessons.forEach(function (l, i) { if (l.id === data.id) idx = i; });
      if (idx === -1) return { ok: false, error: '해당 수업 기록을 찾을 수 없습니다.' };
      var cur = state.lessons[idx];
      if (cur.feedback && cur.feedback.status === 'final') {
        return { ok: false, error: '확정된 기록입니다. 먼저 "수정 잠금 해제"를 눌러 주세요.' };
      }
      state.lessons[idx] = Object.assign({}, cur, {
        studentId: studentId,
        studentName: student.name,
        date: data.date,
        teacher: String(data.teacher).trim(),
        input: input,
        updatedAt: nowISO()
      });
      var r = persist();
      return r.ok ? { ok: true, id: data.id } : r;
    }

    var lesson = {
      id: uid('les'),
      studentId: studentId,
      studentName: student.name,
      date: data.date,
      teacher: String(data.teacher).trim(),
      input: input,
      feedback: emptyFeedback(),
      history: [],
      archived: false,
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    state.lessons.push(lesson);
    var res = persist();
    return res.ok ? { ok: true, id: lesson.id } : res;
  }

  /**
   * 피드백 문장 저장.
   * 기존 문장이 있으면 반드시 history 에 남긴 뒤 교체한다 (되돌리기 가능).
   */
  function saveFeedback(lessonId, payload) {
    load();
    var lesson = state.lessons.filter(function (l) { return l.id === lessonId; })[0];
    if (!lesson) return { ok: false, error: '해당 수업 기록을 찾을 수 없습니다.' };
    if (lesson.feedback.status === 'final' && payload.status !== 'final' && !payload.unlocked) {
      return { ok: false, error: '확정된 기록입니다. 먼저 "수정 잠금 해제"를 눌러 주세요.' };
    }

    if (lesson.feedback.text) {
      lesson.history = lesson.history || [];
      lesson.history.push({
        at: nowISO(),
        status: lesson.feedback.status,
        engine: lesson.feedback.engine,
        text: lesson.feedback.text,
        sections: clone(lesson.feedback.sections)
      });
      if (lesson.history.length > 50) lesson.history = lesson.history.slice(-50);
    }

    lesson.feedback = Object.assign({}, lesson.feedback, {
      status: payload.status || 'edited',
      engine: payload.engine || lesson.feedback.engine,
      sections: Object.assign({}, lesson.feedback.sections, payload.sections || {}),
      text: payload.text != null ? payload.text : lesson.feedback.text,
      warnings: payload.warnings || [],
      generatedAt: payload.generatedAt || lesson.feedback.generatedAt || nowISO()
    });
    if (payload.status === 'final') lesson.feedback.confirmedAt = nowISO();
    lesson.updatedAt = nowISO();
    return persist();
  }

  /** 확정 잠금 해제 — 확정 상태만 풀고 문장은 그대로 둔다 */
  function unlockFeedback(lessonId) {
    load();
    var lesson = state.lessons.filter(function (l) { return l.id === lessonId; })[0];
    if (!lesson) return { ok: false, error: '해당 수업 기록을 찾을 수 없습니다.' };
    if (lesson.feedback.status !== 'final') return { ok: true };
    lesson.feedback.status = 'edited';
    lesson.updatedAt = nowISO();
    return persist();
  }

  function setLessonArchived(id, archived) {
    load();
    var l = state.lessons.filter(function (x) { return x.id === id; })[0];
    if (!l) return { ok: false, error: '해당 수업 기록을 찾을 수 없습니다.' };
    l.archived = !!archived;
    l.updatedAt = nowISO();
    return persist();
  }

  // ────────────────────────────── 통계 ──────────────────────────────

  function getStats() {
    var s = load();
    var today = todayStr();
    var active = s.lessons.filter(function (l) { return !l.archived; });
    return {
      students: s.students.filter(function (x) { return !x.archived; }).length,
      lessonsTotal: active.length,
      lessonsToday: active.filter(function (l) { return l.date === today; }).length,
      pending: active.filter(function (l) { return !l.feedback || l.feedback.status !== 'final'; }).length,
      finalized: active.filter(function (l) { return l.feedback && l.feedback.status === 'final'; }).length
    };
  }

  // ────────────────────────────── 백업 / 복원 ──────────────────────────────

  function exportJSON() {
    return JSON.stringify(Object.assign({}, load(), { exportedAt: nowISO() }), null, 2);
  }

  /**
   * 가져오기.
   * mode = 'merge'(기본) : 기존 데이터를 지우지 않고, 없는 항목만 추가한다.
   * mode = 'replace'     : 전체 교체 (화면에서 2단계 확인을 거친 경우에만 호출)
   */
  function importJSON(jsonText, mode) {
    load();
    var incoming;
    try { incoming = JSON.parse(jsonText); } catch (e) { return { ok: false, error: '파일 형식이 올바르지 않습니다(JSON 아님).' }; }
    if (!incoming || typeof incoming !== 'object') return { ok: false, error: '파일 내용을 읽을 수 없습니다.' };

    if (mode === 'replace') {
      state = migrate(mergeDefaults(DEFAULT_STATE, incoming));
      var r0 = persist();
      return r0.ok ? { ok: true, added: { students: state.students.length, lessons: state.lessons.length }, mode: 'replace' } : r0;
    }

    var addedStudents = 0, addedLessons = 0;
    var studentIds = {};
    state.students.forEach(function (s) { studentIds[s.id] = true; });
    (incoming.students || []).forEach(function (s) {
      if (s && s.id && !studentIds[s.id]) { state.students.push(s); studentIds[s.id] = true; addedStudents++; }
    });

    var lessonIds = {};
    state.lessons.forEach(function (l) { lessonIds[l.id] = true; });
    (incoming.lessons || []).forEach(function (l) {
      if (l && l.id && !lessonIds[l.id]) { state.lessons.push(l); lessonIds[l.id] = true; addedLessons++; }
    });

    (incoming.teachers || []).forEach(function (t) {
      if (t && state.teachers.indexOf(t) === -1) state.teachers.push(t);
    });

    var r = persist();
    return r.ok ? { ok: true, added: { students: addedStudents, lessons: addedLessons }, mode: 'merge' } : r;
  }

  /** 전체 초기화 — 화면에서 두 번 확인한 뒤에만 호출된다 */
  function resetAll() {
    try { global.localStorage.setItem(BACKUP_KEY, JSON.stringify(load())); } catch (e) {}
    state = clone(DEFAULT_STATE);
    return persist();
  }

  global.Store = {
    STORAGE_KEY: STORAGE_KEY,
    UNDERSTANDING_LEVELS: UNDERSTANDING_LEVELS,
    FEEDBACK_STATUS: FEEDBACK_STATUS,
    available: available,
    load: load,
    subscribe: subscribe,
    uid: uid,
    todayStr: todayStr,
    getSettings: getSettings,
    updateSettings: updateSettings,
    getTeachers: getTeachers,
    addTeacher: addTeacher,
    removeTeacher: removeTeacher,
    getStudents: getStudents,
    getStudent: getStudent,
    saveStudent: saveStudent,
    setStudentArchived: setStudentArchived,
    getLessons: getLessons,
    getLesson: getLesson,
    saveLesson: saveLesson,
    saveFeedback: saveFeedback,
    unlockFeedback: unlockFeedback,
    setLessonArchived: setLessonArchived,
    getStats: getStats,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
    emptyInput: emptyInput
  };
})(window);
