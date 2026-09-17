// 브라우저 없이 store.js / feedback.js 동작을 검증하는 테스트
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

const mem = {};
const localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
const ctx = { console, localStorage, Date, JSON, Math, Object, Array, String, Number, isNaN, parseInt };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['assets/js/store.js', 'assets/js/feedback.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const { Store, FeedbackEngine } = ctx;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '\n     → ' + extra : '')); }
}

console.log('\n[1] 학생 등록');
const s = Store.saveStudent({ name: '김민준', school: '서해고', grade: '고2', className: '내신 A반' });
check('학생 저장 성공', s.ok);
check('이름 없으면 거부', !Store.saveStudent({ name: '  ' }).ok);
check('목록에 1명', Store.getStudents().length === 1);

console.log('\n[2] 수업 기록 저장 (필수값 검증)');
check('진도 없으면 거부', !Store.saveLesson({ studentId: s.id, date: '2026-09-17', teacher: '김선생', input: { understanding: 'good' } }).ok);
check('이해도 없으면 거부', !Store.saveLesson({ studentId: s.id, date: '2026-09-17', teacher: '김선생', input: { progress: 'x' } }).ok);
const L = Store.saveLesson({
  studentId: s.id, date: '2026-09-17', teacher: '김선생',
  input: {
    progress: '능률(김) 3과 본문 1~2문단 해석, 관계대명사 which 정리',
    understanding: 'good',
    understandingNote: 'which·that 구분을 두 번 틀림',
    improve: 'which와 that 구분 문제 10문항 추가 연습 필요',
    homework: '워크북 p.42~45, 단어 3과 1~40번 암기',
    memo: '다음 주 서해고 중간고사 범위 확인 부탁드립니다'
  }
});
check('수업 기록 저장 성공', L.ok);

console.log('\n[3] 규칙 기반 피드백 생성');
let lesson = Store.getLesson(L.id);
const settings = Store.getSettings();
const sections = FeedbackEngine.generateRuleBased(lesson, settings);
const text = FeedbackEngine.composeText(lesson, sections, settings);
console.log('\n--- 생성 결과 ---\n' + text + '\n-----------------');
check('진도 원문 포함', text.includes('능률(김) 3과 본문 1~2문단 해석'));
check('이해도 고정문장 포함', text.includes('오늘 수업 내용을 잘 이해하고 있습니다'));
check('숙제 원문 포함', text.includes('워크북 p.42~45'));
check('전달사항 포함', text.includes('중간고사 범위 확인'));
check('5개 문단 모두 있음', ['오늘 학습 내용','학습 상태','보완 내용','숙제','전달사항'].every(t => text.includes('■ ' + t)));

console.log('\n[4] 사실 검증기 — 규칙 기반 결과는 경고 0건이어야 함');
const v1 = FeedbackEngine.verify(text, lesson);
check('오류 0건', v1.errors.length === 0, JSON.stringify(v1.errors));
check('경고 0건', v1.warnings.length === 0, v1.warnings.map(w => w.token).join(', '));

const v1b = FeedbackEngine.verify(sections, lesson);
check('문단 객체로 검사해도 0건', v1b.errors.length === 0 && v1b.warnings.length === 0, v1b.warnings.map(w=>w.token).join(', '));

console.log('\n[5] 사실 검증기 — 지어낸 내용은 반드시 잡아야 함');
const fake = text + '\n오늘 단어 시험에서 95점을 받았고 Reading Tutor 교재도 병행했습니다. 집중력이 매우 뛰어났습니다.';
const v2 = FeedbackEngine.verify(fake, lesson);
check('없는 숫자(95) 잡음', v2.errors.some(e => e.token === '95'), JSON.stringify(v2.errors));
check('없는 영어(Reading) 잡음', v2.errors.some(e => e.token === 'Reading'));
check('없는 한글 표현 잡음', v2.warnings.length > 0, v2.warnings.map(w => w.token).join(', '));

console.log('\n[6] 빈 항목 — 없는 내용을 지어내지 않는지');
const L2 = Store.saveLesson({
  studentId: s.id, date: '2026-09-18', teacher: '김선생',
  input: { progress: '4과 어휘 정리', understanding: 'average' }
});
const lesson2 = Store.getLesson(L2.id);
const t2 = FeedbackEngine.composeText(lesson2, FeedbackEngine.generateRuleBased(lesson2, settings), settings);
console.log('\n--- 빈 항목 결과 ---\n' + t2 + '\n--------------------');
check('보완 없음 안내', t2.includes('별도로 기록된 보완 사항은 없습니다'));
check('숙제 없음 안내', t2.includes('따로 부여된 숙제가 없습니다'));
check('전달사항 문단 자체가 생략됨', !t2.includes('■ 전달사항'));
check('빈 기록도 검증 통과', FeedbackEngine.verify(t2, lesson2).errors.length === 0);

console.log('\n[7] 피드백 저장 / 이력 / 확정 잠금');
Store.saveFeedback(L.id, { status: 'generated', engine: 'rule', sections, text });
Store.saveFeedback(L.id, { status: 'edited', sections, text: text + '\n(수정함)' });
lesson = Store.getLesson(L.id);
check('이력 1건 쌓임', lesson.history.length === 1, 'history=' + lesson.history.length);
Store.saveFeedback(L.id, { status: 'final', sections, text: text });
lesson = Store.getLesson(L.id);
check('확정 상태', lesson.feedback.status === 'final');
check('확정 시각 기록', !!lesson.feedback.confirmedAt);
check('확정 후 입력 수정 차단', !Store.saveLesson({ id: L.id, studentId: s.id, date: '2026-09-17', teacher: '김선생', input: { progress: 'x', understanding: 'good' } }).ok);
Store.unlockFeedback(L.id);
check('잠금 해제 후 수정 가능', Store.saveLesson({ id: L.id, studentId: s.id, date: '2026-09-17', teacher: '김선생', input: { progress: '수정된 진도', understanding: 'good' } }).ok);

console.log('\n[8] 데이터 보호 — 삭제 없이 보관');
Store.setLessonArchived(L2.id, true);
check('보관하면 목록에서 숨김', Store.getLessons().every(l => l.id !== L2.id));
check('보관해도 데이터는 남음', !!Store.getLesson(L2.id));
check('보관 포함 조회 가능', Store.getLessons({ includeArchived: true }).some(l => l.id === L2.id));

console.log('\n[9] 백업 / 복원 (병합이라 기존 데이터가 지워지지 않아야 함)');
const backup = Store.exportJSON();
const before = Store.getLessons({ includeArchived: true }).length;
const imp = Store.importJSON(backup, 'merge');
check('가져오기 성공', imp.ok);
check('중복 추가 안 됨', Store.getLessons({ includeArchived: true }).length === before);
check('기존 기록 유지', Store.getLesson(L.id) !== null);
const extra = JSON.parse(backup);
extra.lessons = [{ id: 'les_new1', studentId: s.id, studentName: '김민준', date: '2026-09-19', teacher: '박선생',
  input: Store.emptyInput(), feedback: { status: 'draft', sections: {}, text: '', warnings: [] }, history: [], archived: false }];
const imp2 = Store.importJSON(JSON.stringify(extra), 'merge');
check('새 기록만 1건 추가', imp2.added.lessons === 1, JSON.stringify(imp2.added));
check('기존 기록 여전히 존재', Store.getLesson(L.id) !== null);
check('잘못된 파일 거부', !Store.importJSON('이건 JSON이 아님', 'merge').ok);

console.log('\n[10] 통계');
const st = Store.getStats();
check('통계 계산됨', typeof st.pending === 'number' && st.students === 1, JSON.stringify(st));

console.log('\n════════════════════════════════');
console.log(`통과 ${pass}건 / 실패 ${fail}건`);
console.log('════════════════════════════════');
process.exit(fail ? 1 : 0);
