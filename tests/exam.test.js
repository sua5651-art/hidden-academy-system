const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const mem = {};
const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k,v)=>{mem[k]=String(v)}, removeItem: k=>{delete mem[k]} };
const ctx = { console, localStorage, Date, JSON, Math, Object, Array, String, Number, isNaN, parseInt };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['assets/js/store.js','assets/js/feedback.js','assets/js/homework.js','assets/js/counsel.js','assets/js/exam.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, {filename:f});
const { Store, ExamEngine } = ctx;

let pass=0, fail=0;
function check(n,c,e){ if(c){pass++;console.log('  ✅ '+n)} else {fail++;console.log('  ❌ '+n+(e?'\n     → '+e:''))} }
const day = o => Store.dayOffset(o);

console.log('\n[1] 학생 등록 (학교·학년이 연결 기준이 된다)');
const a = Store.saveStudent({ name:'김민준', school:'정왕중', grade:'중3', className:'예비 고1반', teacher:'김선생' }).id;
const b = Store.saveStudent({ name:'이서연', school:'정왕중', grade:'중3', className:'예비 고1반', teacher:'김선생' }).id;
const c = Store.saveStudent({ name:'박지후', school:'정왕중', grade:'중2', className:'중등 B반', teacher:'박선생' }).id;
const d = Store.saveStudent({ name:'최유나', school:'군자중', grade:'중3', className:'중등 A반', teacher:'박선생' }).id;
check('학생 4명 등록', Store.getStudents().length === 4);

console.log('\n[2] 학교 공통 시험 정보 등록');
const E = Store.saveExam({
  school:'정왕중', grade:'중3', term:'2학기 중간고사',
  textbook:'천재(이재영)', examDate: day(9),
  units:['Lesson 5','Lesson 6'],
  rangeNote:'교과서 본문 + 워크북, 부교재 3~4과',
  grammarPoints:['관계대명사 which/that','수동태','현재완료'],
  performance:'서술형 30% · 본문 요약 쓰기 수행평가'
});
check('저장 성공', E.ok);
let exam = Store.getExam(E.id);
check('단원에 id 부여', exam.units.length === 2 && exam.units.every(u=>u.id && u.name));
check('문법 범위 3개', exam.grammarPoints.length === 3);
check('교과서·수행평가 저장', exam.textbook === '천재(이재영)' && exam.performance.includes('서술형 30%'));
check('학교명 없으면 거부', !Store.saveExam({ term:'중간', examDate:day(5) }).ok);
check('시험 이름 없으면 거부', !Store.saveExam({ school:'정왕중', examDate:day(5) }).ok);
check('시험일 없으면 거부', !Store.saveExam({ school:'정왕중', term:'중간' }).ok);

console.log('\n[3] 기능 1 — 한 번 등록하면 해당 학교 학생에게 연결');
let linked = Store.getExamStudents(E.id);
check('정왕중 중3만 연결', linked.length === 2, linked.map(s=>s.name+'/'+s.grade).join(', '));
check('같은 학교 다른 학년은 제외', !linked.some(s=>s.id===c));
check('다른 학교는 제외', !linked.some(s=>s.id===d));
const e2 = Store.saveStudent({ name:'정하준', school:'정왕중', grade:'중3', className:'예비 고1반' }).id;
check('학생을 나중에 등록해도 자동 연결', Store.getExamStudents(E.id).length === 3);
Store.setStudentArchived(e2, true);
check('보관한 학생은 빠짐', Store.getExamStudents(E.id).length === 2);
const ALL = Store.saveExam({ school:'정왕중', term:'기말고사', examDate: day(60) });  // 학년 비움
check('학년을 비우면 학교 전체', Store.getExamStudents(ALL.id).length === 3);

console.log('\n[4] 학교 공통 정보와 학생별 기록의 분리');
let prep = Store.getPrep(E.id, a);
check('저장 전에도 빈 기록을 돌려줌', prep.id === '' && prep.studentId === a);
check('빈 기록의 진행률은 0', Store.prepProgress(exam, prep).done === 0);
Store.savePrep({
  examId: E.id, studentId: a, targetScore: 95,
  units: { [exam.units[0].id]:'done', [exam.units[1].id]:'doing' },
  memorize: { [exam.units[0].id]:'done', [exam.units[1].id]:'todo' },
  weakGrammar: [exam.grammarPoints[0].id, exam.grammarPoints[1].id],
  weakGrammarNote: '관계대명사 what 용법',
  wrongCount: 12, needsExtra: true, extraNote: '주말 보강 1회 — 관계대명사 집중'
});
prep = Store.getPrep(E.id, a);
check('학생별 기록 저장', prep.id !== '' && prep.targetScore === '95');
check('취약 문법 2개 저장', prep.weakGrammar.length === 2);
check('오답 수·보강 저장', prep.wrongCount === 12 && prep.needsExtra === true);

// 시험 정보를 고쳐도 학생 기록은 그대로
Store.saveExam({ id: E.id, school:'정왕중', grade:'중3', term:'2학기 중간고사',
  textbook:'천재(이재영)', examDate: day(12),   // 시험일만 미룸
  units: exam.units, rangeNote: exam.rangeNote, grammarPoints: exam.grammarPoints, performance: exam.performance });
check('시험일 변경이 반영됨', Store.getExam(E.id).examDate === day(12));
check('학생 준비 기록은 그대로', Store.getPrep(E.id, a).wrongCount === 12);
check('다른 학생 기록에도 영향 없음', Store.getPrep(E.id, b).id === '');
// 학생 기록을 고쳐도 시험 정보는 그대로
Store.savePrep({ examId:E.id, studentId:a, targetScore:90, units:{}, memorize:{}, weakGrammar:[], wrongCount:0 });
check('학생 기록 수정이 시험 정보를 바꾸지 않음', Store.getExam(E.id).units.length === 2);

console.log('\n[5] 기능 2·4 — 준비 상태 집계와 미완료 항목');
exam = Store.getExam(E.id);
Store.savePrep({
  examId: E.id, studentId: a, targetScore: 95,
  units: { [exam.units[0].id]:'done', [exam.units[1].id]:'doing' },
  memorize: { [exam.units[0].id]:'done', [exam.units[1].id]:'todo' },
  weakGrammar: [exam.grammarPoints[0].id], weakGrammarNote: '',
  wrongCount: 12, needsExtra: true, extraNote: '주말 보강 1회'
});
prep = Store.getPrep(E.id, a);
let pg = Store.prepProgress(exam, prep);
check('전체 항목 = 단원 2 × 2', pg.total === 4);
check('완료 2건', pg.done === 2);
check('진행률 50%', pg.percent === 50);
check('미완료 2건 목록', pg.pending.length === 2, JSON.stringify(pg.pending.map(p=>p.unit+'/'+p.kind+'/'+p.state)));
check('미완료에 단원명과 종류가 있음',
  pg.pending.some(p=>p.unit==='Lesson 6' && p.kind==='단원 준비' && p.state==='doing') &&
  pg.pending.some(p=>p.unit==='Lesson 6' && p.kind==='본문 암기' && p.state==='todo'));
check('취약 문법 수 집계', pg.weakGrammarCount === 1);
check('준비 완료 아님', pg.ready === false);

Store.savePrep({ examId:E.id, studentId:b,
  units: { [exam.units[0].id]:'done', [exam.units[1].id]:'done' },
  memorize: { [exam.units[0].id]:'done', [exam.units[1].id]:'done' },
  weakGrammar: [], wrongCount: 0, needsExtra: false });
check('전부 끝내면 준비 완료', Store.prepProgress(exam, Store.getPrep(E.id,b)).ready === true);

console.log('\n[6] 입력 검증');
check('목표 점수 범위 밖 거부', !Store.savePrep({ examId:E.id, studentId:a, targetScore:120 }).ok);
check('음수 오답 수 거부', !Store.savePrep({ examId:E.id, studentId:a, wrongCount:-3 }).ok);
check('없는 시험 거부', !Store.savePrep({ examId:'없음', studentId:a }).ok);
check('없는 학생 거부', !Store.savePrep({ examId:E.id, studentId:'없음' }).ok);
Store.savePrep({ examId:E.id, studentId:a, units:{ 'itm_없는단원':'done' }, memorize:{}, weakGrammar:['없는문법'], wrongCount:0 });
check('시험에 없는 단원·문법은 걸러짐',
  Object.keys(Store.getPrep(E.id,a).units).length === 0 && Store.getPrep(E.id,a).weakGrammar.length === 0);

console.log('\n[7] 기능 3 — 시험일까지 남은 기간');
check('D-day 계산', Store.examDday(Store.getExam(E.id)) === 12);
check('D-day 표기', ExamEngine.ddayLabel(12) === 'D-12');
check('당일 표기', ExamEngine.ddayLabel(0).includes('오늘'));
check('지난 시험 표기', ExamEngine.ddayLabel(-3).includes('3일 지남'));
const past = Store.saveExam({ school:'정왕중', grade:'중3', term:'1학기 기말', examDate: day(-20) });
check('지난 시험은 다가오는 목록에서 빠짐', !Store.getExams({upcoming:true}).some(x=>x.id===past.id));
check('시험일 가까운 순 정렬', (function(){ var l=Store.getExams({upcoming:true}); return l[0].examDate <= l[l.length-1].examDate; })());

console.log('\n[8] 기능 5 — 시험 전 최종 체크리스트');
exam = Store.getExam(E.id);
Store.savePrep({
  examId: E.id, studentId: a, targetScore: 95,
  units: { [exam.units[0].id]:'done', [exam.units[1].id]:'doing' },
  memorize: { [exam.units[0].id]:'done', [exam.units[1].id]:'todo' },
  weakGrammar: [exam.grammarPoints[0].id, exam.grammarPoints[1].id],
  weakGrammarNote: '관계대명사 what 용법',
  wrongCount: 12, needsExtra: true, extraNote: '주말 보강 1회 — 관계대명사 집중'
});
prep = Store.getPrep(E.id, a);
const list = ExamEngine.buildChecklist(exam, prep, Store.getSettings());
console.log('\n--- 생성된 체크리스트 ---\n' + list + '\n-------------------------');
check('학교·학년·시험 이름 포함', list.includes('정왕중 중3 2학기 중간고사'));
check('D-day 포함', list.includes('D-12'));
check('목표 점수 포함', list.includes('목표 점수 95점'));
check('진행률 포함', list.includes('준비 2/4 완료 (50%)'));
check('남은 단원 준비만 표시', list.includes('■ 아직 남은 단원 준비') && list.includes('Lesson 6 (진행중)'));
check('남은 본문 암기 표시', list.includes('■ 아직 남은 본문 암기') && list.includes('Lesson 6 (시작 전)'));
check('끝낸 Lesson 5는 안 나옴', !list.includes('Lesson 5 (완료)'));
check('취약 문법 표시', list.includes('관계대명사 which/that') && list.includes('수동태'));
check('고르지 않은 문법은 안 나옴', !list.includes('현재완료'));
check('직접 입력한 약점도 표시', list.includes('관계대명사 what 용법'));
check('오답 수 표시', list.includes('오답 12문항'));
check('보강 내용 표시', list.includes('주말 보강 1회'));
check('수행평가 정보 표시', list.includes('서술형 30%'));
check('지어낸 내용 없음', ExamEngine.verifyChecklist(list, exam, prep).errors.length === 0,
  JSON.stringify(ExamEngine.verifyChecklist(list, exam, prep).errors));
check('경고 없음', ExamEngine.verifyChecklist(list, exam, prep).warnings.length === 0,
  ExamEngine.verifyChecklist(list, exam, prep).warnings.map(w=>w.token).join(', '));

console.log('\n[9] 전부 끝낸 학생의 체크리스트');
const done = ExamEngine.buildChecklist(exam, Store.getPrep(E.id,b), Store.getSettings());
console.log('\n--- 준비 완료 학생 ---\n' + done + '\n----------------------');
check('남은 항목 문단이 없음', !done.includes('■ 아직 남은'));
check('완료 안내 문구', done.includes('모두 끝냈습니다'));
check('오답·보강 문단 생략', !done.includes('■ 오답 정리') && !done.includes('■ 보강'));
check('검증 통과', ExamEngine.verifyChecklist(done, exam, Store.getPrep(E.id,b)).errors.length === 0);

console.log('\n[10] 끝낸 항목도 함께 넣기');
const withDone = ExamEngine.buildChecklist(exam, prep, Store.getSettings(), { includeDone:true });
check('이미 끝낸 항목 문단', withDone.includes('■ 이미 끝낸 항목') && withDone.includes('Lesson 5 단원 준비'));
check('검증 통과', ExamEngine.verifyChecklist(withDone, exam, prep).errors.length === 0);

console.log('\n[11] 체크리스트 저장 / 통계 / 백업');
Store.savePrepChecklist(E.id, a, list);
check('체크리스트 저장', Store.getPrep(E.id,a).checklist.text === list);
check('준비 기록 없으면 저장 거부', !Store.savePrepChecklist(E.id, c, 'x').ok);
const stats = Store.getStats();
check('통계에 시험 수', stats.examsTotal >= 3 && stats.examsUpcoming >= 2);
check('가장 가까운 시험', !!stats.nextExam && stats.nextExam.examDate === day(12));
const backup = Store.exportJSON();
check('백업에 시험·준비 기록 포함', JSON.parse(backup).exams.length >= 3 && JSON.parse(backup).preps.length >= 2);
const n0 = Store.getExams({includeArchived:true}).length, p0 = Store.getPreps().length;
Store.importJSON(backup,'merge');
check('중복 추가 안 됨', Store.getExams({includeArchived:true}).length === n0 && Store.getPreps().length === p0);
const old = JSON.stringify({ schemaVersion:1, students:[{id:'old3',name:'예전',archived:false}], lessons:[], teachers:[] });
check('내신 기능 이전 백업도 읽힘', Store.importJSON(old,'merge').ok);
check('기존 시험 유지', !!Store.getExam(E.id));
Store.setExamArchived(E.id, true);
check('보관해도 데이터는 남음', !!Store.getExam(E.id) && Store.getExams().every(x=>x.id!==E.id));
check('보관해도 학생 준비 기록은 남음', Store.getPrep(E.id,a).wrongCount === 12);

console.log('\n════════════════════════════════');
console.log(`통과 ${pass}건 / 실패 ${fail}건`);
console.log('════════════════════════════════');
process.exit(fail?1:0);
