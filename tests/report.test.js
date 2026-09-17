const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const mem = {};
const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k,v)=>{mem[k]=String(v)}, removeItem: k=>{delete mem[k]} };
const ctx = { console, localStorage, Date, JSON, Math, Object, Array, String, Number, isNaN, parseInt };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['assets/js/store.js','assets/js/feedback.js','assets/js/homework.js','assets/js/counsel.js','assets/js/exam.js','assets/js/report.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, {filename:f});
const { Store, ReportEngine, FeedbackEngine } = ctx;

let pass=0, fail=0;
function check(n,c,e){ if(c){pass++;console.log('  ✅ '+n)} else {fail++;console.log('  ❌ '+n+(e?'\n     → '+e:''))} }

// 이번 달 안쪽 날짜를 만든다
const P = Store.monthRange(Store.thisMonth());
const D = n => P.month + '-' + String(n).padStart(2,'0');

console.log('\n[1] 한 달치 기록 만들기');
const sid = Store.saveStudent({ name:'김민준', school:'정왕중', grade:'중3', className:'예비 고1반', teacher:'김선생' }).id;
// 수업 8회 — 같은 진도가 여러 번 반복되도록
const LESSONS = [
  { d:2,  prog:'Lesson 5 본문 해석, 관계대명사 which 정리', lv:'good',       note:'which·that 구분을 두 번 틀림', imp:'which와 that 구분 문제 추가 연습' },
  { d:5,  prog:'Lesson 5 본문 해석, 단어 5과 암기 테스트',   lv:'good',       note:'', imp:'which와 that 구분 문제 추가 연습' },
  { d:9,  prog:'Lesson 5 본문 해석, 수동태 정리',            lv:'excellent',  note:'', imp:'' },
  { d:12, prog:'Lesson 6 본문 해석, 수동태 정리',            lv:'average',    note:'수동태 시제 변환에서 실수', imp:'수동태 시제 변환 반복' },
  { d:16, prog:'Lesson 6 본문 해석',                        lv:'needs_work', note:'', imp:'수동태 시제 변환 반복' },
  { d:19, prog:'Lesson 6 본문 해석, 단어 6과 암기 테스트',   lv:'good',       note:'', imp:'' },
  { d:23, prog:'서술형 대비 문장 쓰기',                      lv:'good',       note:'', imp:'' },
  { d:26, prog:'서술형 대비 문장 쓰기',                      lv:'excellent',  note:'', imp:'' }
];
LESSONS.forEach(x => Store.saveLesson({ studentId:sid, date:D(x.d), teacher:'김선생',
  input:{ progress:x.prog, understanding:x.lv, understandingNote:x.note, improve:x.imp, homework:'', memo:'' }}));
check('수업 8회 저장', Store.getLessons({studentId:sid}).length === 8);

// 숙제 4회 (일부 미완료, 같은 항목이 반복 미완료)
[[3,['워크북 p.42~45','단어 5과 암기'],[0]],
 [10,['워크북 p.46~50','단어 5과 암기'],[0,1]],
 [17,['워크북 p.51~55','오답노트 정리'],[0]],
 [24,['서술형 문장 쓰기 5문항','오답노트 정리'],[0,1]]].forEach(([d,items,doneIdx])=>{
  const h = Store.saveHomework({ studentId:sid, date:D(d), dueDate:D(d+2), base:items, extra:[] });
  const rec = Store.getHomework(h.id);
  doneIdx.forEach(i => Store.setHomeworkItemDone(h.id,'base',rec.base[i].id,true));
  if (d <= 10) Store.setTeacherCheck(h.id, { checked:true, by:'김선생' });
});
check('숙제 4회 저장', Store.getHomeworks({studentId:sid}).length === 4);

Store.saveCounsel({ studentId:sid, date:D(14), counselor:'김선생', target:'parent', type:'grade',
  content:'중간고사 성적을 걱정하셨습니다.', parentRequest:'단어 시험을 매주 봐 주세요',
  academyReply:'금요일마다 단어 시험을 보기로 했습니다', nextCheckDate:D(28),
  followUp:{ needed:true, text:'2주 뒤 단어 시험 결과 정리' } });
check('상담 1건 저장', Store.getCounsels({studentId:sid}).length === 1);

console.log('\n[2] 집계 항목 6가지');
const student = Store.getStudent(sid);
const data = ReportEngine.collect(sid, P);
const st = data.stats;
check('총 수업 횟수', st.lessonCount === 8);
check('주요 진도 묶임', st.progress.length > 0);
check('반복 진도에 횟수', st.progress[0].count === 3 && st.progress[0].text.includes('Lesson'), JSON.stringify(st.progress.slice(0,3)));
check('이해도 분포 집계', st.goodCount === 6 && st.lowCount === 1, JSON.stringify(st.levelCounts));
check('보완 항목 묶임', st.improve.length === 2, JSON.stringify(st.improve));
check('반복 보완에 횟수', st.improve.every(i => i.count === 2));
check('숙제 집계', st.homework.records === 4 && st.homework.totalItems === 8 && st.homework.doneItems === 6,
  JSON.stringify({r:st.homework.records,t:st.homework.totalItems,d:st.homework.doneItems}));
check('숙제 완료율', st.homework.rate === 75, String(st.homework.rate));
check('교사 확인 횟수', st.homework.checkedRecords === 2);
check('미완료 숙제 묶임', st.homework.pending.length === 2, JSON.stringify(st.homework.pending));
check('상담/특이사항 집계', st.counsels.length === 1 && st.counsels[0].reply.includes('금요일'));

console.log('\n[3] 원본 기간과 근거 기록을 함께 저장 (규칙 5)');
const src = ReportEngine.buildSource(data, P);
check('기간 저장', src.from === P.from && src.to === P.to);
check('근거 기록 id 저장', src.lessonIds.length === 8 && src.homeworkIds.length === 4 && src.counselIds.length === 1);
check('건수 저장', src.counts.lessons === 8 && src.counts.homeworks === 4 && src.counts.counsels === 1);
check('집계 시각 저장', !!src.collectedAt);

console.log('\n[4] 리포트 구조 5단 + 상담 문단');
const res = ReportEngine.generate(student, P, Store.getSettings());
console.log('\n--- 생성된 리포트 ---\n' + res.text + '\n---------------------');
['이번 달 학습 내용','잘한 점','보완할 점','학습 습관 · 숙제','다음 달 목표'].forEach(t =>
  check('"' + t + '" 문단 있음', res.text.includes('■ ' + t)));
check('상담 문단 있음', res.text.includes('■ 상담 · 특이사항'));
check('기간이 머리말에 표시', res.text.includes(P.from + ' ~ ' + P.to));

console.log('\n[5] 규칙 1 — 같은 내용을 반복하지 않는다');
const bodyLines = res.text.split('\n').map(l=>l.trim().replace(/^·\s*/,'')).filter(l=>l && !l.startsWith('■') && !l.startsWith('[') && !l.startsWith('-'));
const keys = bodyLines.map(ReportEngine.normKey);
const dups = keys.filter((k,i)=>keys.indexOf(k)!==i);
check('같은 문장이 두 번 나오지 않음', dups.length === 0, JSON.stringify(dups));
check('8회 수업의 진도가 한 줄로 묶임', (res.text.match(/Lesson 5 본문 해석/g)||[]).length === 1);
check('반복 항목에 횟수 표시', res.text.includes('(3회)'));
check('1회짜리에는 횟수 안 붙음', !res.text.includes('(1회)'));
check('검증기도 중복 없다고 판단', res.check.warnings.filter(w=>w.type==='duplicate').length === 0);

console.log('\n[6] 규칙 2 — 데이터에 없는 내용을 만들지 않는다');
check('오류 0건', res.check.errors.length === 0, JSON.stringify(res.check.errors));
check('경고 0건', res.check.warnings.length === 0, res.check.warnings.map(w=>w.token).join(', '));
check('원본에 없는 교재명 없음', !/Reading Tutor|능률/.test(res.text));

console.log('\n[7] 규칙 3 — 지나친 평가 표현을 피한다');
const style = FeedbackEngine.checkStyle(res.text, '');
check('과장 칭찬·부정 단정 없음', style.length === 0, JSON.stringify(style.map(s=>s.token)));
check('숫자로 서술함', res.text.includes('8회 중 6회'));

console.log('\n[8] 다음 달 목표는 데이터에서만 끌어온다');
check('반복 보완 항목이 목표에', res.sections.goal.includes('반복 연습'));
check('미완료 숙제 개수 반영', res.sections.goal.includes('2개 마무리'), res.sections.goal);
check('상담 후속조치 반영', res.sections.goal.includes('단어 시험 결과 정리'));
const ex = Store.saveExam({ school:'정왕중', grade:'중3', term:'2학기 중간고사', examDate: Store.dayOffset(20), units:['Lesson 7'] });
const res2 = ReportEngine.generate(student, P, Store.getSettings(), { upcomingExam: Store.getExam(ex.id) });
check('다가오는 시험이 목표에 반영', res2.sections.goal.includes('2학기 중간고사'));
check('시험 반영 후에도 검증 통과', res2.check.errors.length === 0, JSON.stringify(res2.check.errors));

console.log('\n[9] 기록이 없는 달');
const EMPTY = Store.monthRange('2020-01');
const resE = ReportEngine.generate(student, EMPTY, Store.getSettings());
console.log('\n--- 기록 없는 달 ---\n' + resE.text + '\n--------------------');
check('없는 내용을 지어내지 않음', resE.text.includes('저장된 수업 기록이 없습니다'));
check('숙제 없음 안내', resE.text.includes('배정된 숙제 기록이 없습니다'));
check('상담 문단은 아예 생략', !resE.text.includes('■ 상담 · 특이사항'));
check('목표는 선생님께 넘김', resE.sections.goal.includes('직접 적어'));
check('검증 통과', resE.check.errors.length === 0 && resE.check.warnings.length === 0,
  JSON.stringify(resE.check.errors) + ' / ' + resE.check.warnings.map(w=>w.token).join(','));

console.log('\n[10] 저장 / 규칙 4 — 교사가 최종 수정');
const R = Store.saveReport({ studentId:sid, period:P, source:res.source, stats:res.stats,
  sections:res.sections, text:res.text, status:'generated' });
check('리포트 저장', R.ok);
let rep = Store.getReport(R.id);
check('기간이 함께 저장됨', rep.period.from === P.from && rep.period.to === P.to && rep.period.label === P.label);
check('근거 기록이 함께 저장됨', rep.source.lessonIds.length === 8 && rep.source.counts.lessons === 8);
check('집계 결과도 저장됨', rep.stats.lessonCount === 8);
check('문단별로 저장됨', Object.keys(rep.sections).length === 6 && rep.sections.learning.length > 0);

// 교사가 고친다
const edited = Object.assign({}, rep.sections, { goal: '· 겨울방학 전까지 Lesson 7 예습' });
Store.saveReport({ id:R.id, studentId:sid, period:P, source:rep.source, stats:rep.stats,
  sections:edited, text:'수정된 리포트 본문', status:'edited' });
rep = Store.getReport(R.id);
check('수정 내용 반영', rep.sections.goal.includes('겨울방학') && rep.status === 'edited');
check('수정 표시', rep.edited === true);
check('이전 문장이 이력에 남음', rep.history.length === 1 && rep.history[0].text.includes('이번 달 학습 내용'));

Store.saveReport({ id:R.id, studentId:sid, period:P, source:rep.source, stats:rep.stats,
  sections:rep.sections, text:rep.text, status:'final' });
rep = Store.getReport(R.id);
check('확정 상태', rep.status === 'final' && !!rep.confirmedAt);
check('확정 후 저장 거부', !Store.saveReport({ studentId:sid, period:P, sections:{}, text:'x' }).ok);
Store.unlockReport(R.id);
check('잠금 해제 후 수정 가능', Store.saveReport({ id:R.id, studentId:sid, period:P, sections:rep.sections, text:'다시 수정', status:'edited' }).ok);

console.log('\n[11] 같은 달 중복 방지 / 목록 / 보관 / 백업');
check('같은 달 리포트 찾기', !!Store.findReport(sid, P.month));
const before = Store.getReports().length;
Store.saveReport({ studentId:sid, period:P, sections:{learning:'재생성'}, text:'재생성', status:'generated' });
check('같은 달은 새로 만들지 않고 덮어씀', Store.getReports().length === before);
const P2 = Store.monthRange('2026-01');
Store.saveReport({ studentId:sid, period:P2, sections:{learning:'1월'}, text:'1월', status:'generated' });
check('다른 달은 따로 생김', Store.getReports().length === before + 1);
check('최근 달이 먼저', Store.getReports()[0].period.month >= Store.getReports()[1].period.month);
Store.setReportArchived(R.id, true);
check('보관하면 목록에서 숨김', Store.getReports().every(r=>r.id!==R.id));
check('보관해도 데이터는 남음', !!Store.getReport(R.id));
const backup = Store.exportJSON();
check('백업에 리포트 포함', JSON.parse(backup).reports.length === 2);
const n0 = Store.getReports({includeArchived:true}).length;
Store.importJSON(backup,'merge');
check('중복 추가 안 됨', Store.getReports({includeArchived:true}).length === n0);
check('리포트 기능 이전 백업도 읽힘',
  Store.importJSON(JSON.stringify({schemaVersion:1,students:[{id:'old4',name:'예전',archived:false}],lessons:[],teachers:[]}),'merge').ok);

console.log('\n[12] 원본 기록이 바뀌어도 저장된 리포트는 그대로');
const keptText = Store.getReport(R.id).text;
const keptCounts = Store.getReport(R.id).source.counts.lessons;
Store.saveLesson({ studentId:sid, date:D(28), teacher:'김선생',
  input:{ progress:'새로 추가한 수업', understanding:'good', understandingNote:'', improve:'', homework:'', memo:'' }});
check('새 수업이 추가됨', Store.getLessons({studentId:sid}).length === 9);
check('저장된 리포트 본문은 그대로', Store.getReport(R.id).text === keptText);
check('근거 건수도 그대로', Store.getReport(R.id).source.counts.lessons === keptCounts);
check('다시 집계하면 새 기록이 반영됨', ReportEngine.collect(sid, P).stats.lessonCount === 9);

console.log('\n════════════════════════════════');
console.log(`통과 ${pass}건 / 실패 ${fail}건`);
console.log('════════════════════════════════');
process.exit(fail?1:0);
