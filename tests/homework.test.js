const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const mem = {};
const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k,v)=>{mem[k]=String(v)}, removeItem: k=>{delete mem[k]} };
const ctx = { console, localStorage, Date, JSON, Math, Object, Array, String, Number, isNaN, parseInt };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['assets/js/store.js','assets/js/feedback.js','assets/js/homework.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, {filename:f});
const { Store, HomeworkEngine } = ctx;

let pass=0, fail=0;
function check(n,c,e){ if(c){pass++;console.log('  ✅ '+n)} else {fail++;console.log('  ❌ '+n+(e?'\n     → '+e:''))} }

console.log('\n[1] 학생 등록 (반/레벨 · 담당교사)');
const s = Store.saveStudent({ name:'김민준', school:'서해고', grade:'고2', className:'내신 A반', teacher:'김선생' });
check('학생 저장', s.ok);
check('담당교사 저장됨', Store.getStudent(s.id).teacher === '김선생');
check('반/레벨 저장됨', Store.getStudent(s.id).className === '내신 A반');
check('기본 숙제는 빈 배열로 시작', Array.isArray(Store.getStudent(s.id).defaultHomework));

console.log('\n[2] 기능 2 — 기본 숙제 등록·수정');
Store.setDefaultHomework(s.id, ['워크북 p.42~45','단어 3과 1~40번 암기','오답노트 정리']);
let defs = Store.getDefaultHomework(s.id);
check('기본 숙제 3개 저장', defs.length === 3);
check('항목마다 id 부여', defs.every(d => d.id && d.text));
Store.setDefaultHomework(s.id, [{id:defs[0].id, text:'워크북 p.42~50'}, defs[1]]);
defs = Store.getDefaultHomework(s.id);
check('기본 숙제 수정 반영', defs.length===2 && defs[0].text==='워크북 p.42~50');
check('수정해도 id 유지', defs[0].id === Store.getDefaultHomework(s.id)[0].id);

console.log('\n[3] 기능 1·3 — 기본 숙제 자동 표시 + 당일 추가 숙제');
const H = Store.saveHomework({
  studentId: s.id, className:'내신 A반', teacher:'김선생',
  date:'2026-09-17', dueDate:'2026-09-19',
  base: Store.getDefaultHomework(s.id),                 // 자동으로 불러온 기본 숙제
  extra: ['서술형 대비 문제 5번~8번']                     // 당일 추가
});
check('숙제 기록 저장', H.ok);
let hw = Store.getHomework(H.id);
check('기본 숙제 2개', hw.base.length === 2);
check('당일 추가 숙제 1개', hw.extra.length === 1);
check('데이터 구조상 완전히 분리됨', hw.base.every(i=>i.text!=='서술형 대비 문제 5번~8번') && hw.extra.every(i=>i.text!=='워크북 p.42~50'));
check('제출 예정일 저장', hw.dueDate === '2026-09-19');
check('완료 여부 기본값 false', hw.base.concat(hw.extra).every(i => i.done === false));
check('교사 확인 기본값 false', hw.teacherCheck.checked === false);

console.log('\n[4] 기본 숙제와 당일 기록의 독립성 (가장 중요)');
Store.saveHomework({ id:H.id, studentId:s.id, date:'2026-09-17', dueDate:'2026-09-19',
  base:[{id:hw.base[0].id, text:'워크북 p.42~50 (오늘만 절반)'}], extra: hw.extra });
check('오늘 기록만 바뀜', Store.getHomework(H.id).base[0].text.includes('오늘만 절반'));
check('학생의 기본 숙제는 그대로', Store.getDefaultHomework(s.id)[0].text === '워크북 p.42~50');
check('기본 숙제 개수도 그대로', Store.getDefaultHomework(s.id).length === 2);

console.log('\n[5] 완료 여부 · 교사 확인');
hw = Store.getHomework(H.id);
Store.setHomeworkItemDone(H.id, 'base', hw.base[0].id, true);
let sum = Store.summarize(Store.getHomework(H.id));
check('완료 1건 반영', sum.done === 1 && sum.total === 2);
check('상태 = 진행중', sum.state === 'doing');
Store.setHomeworkItemDone(H.id, 'extra', hw.extra[0].id, true);
sum = Store.summarize(Store.getHomework(H.id));
check('전부 완료 시 상태 = 완료', sum.state === 'done' && sum.remain === 0);
Store.setTeacherCheck(H.id, { checked:true, by:'김선생', note:'단어 암기 상태 양호' });
hw = Store.getHomework(H.id);
check('교사 확인 기록', hw.teacherCheck.checked === true && hw.teacherCheck.by === '김선생');
check('확인 시각 기록', !!hw.teacherCheck.at);
Store.setTeacherCheck(H.id, { checked:false });
check('확인 해제 시 시각 비움', Store.getHomework(H.id).teacherCheck.at === '');

console.log('\n[6] 기능 6 — 학부모 전송 문장 생성');
Store.setTeacherCheck(H.id, { checked:true, by:'김선생', note:'단어 암기 상태 양호' });
hw = Store.getHomework(H.id);
const msg = HomeworkEngine.buildMessage(hw, Store.getSettings());
console.log('\n--- 생성된 숙제 문장 ---\n' + msg + '\n------------------------');
check('기본 숙제 항목이 별도 문단', msg.includes('■ 기본 숙제'));
check('추가 숙제 항목이 별도 문단', msg.includes('■ 오늘 추가 숙제'));
check('제출 예정일 표시', msg.includes('■ 제출 예정일'));
check('완료 현황이 사실대로', msg.includes('전체 2개 중 2개 완료'));
check('교사 확인 표시', msg.includes('■ 교사 확인'));
check('한 줄에 하나씩 나열', msg.split('\n').filter(l=>l.startsWith('· ')).length === 2);
check('전부 완료면 독촉 문구 없음', !msg.includes('가정에서도 확인 부탁드립니다'));

console.log('\n[7] 없는 내용을 지어내지 않는지');
const v = HomeworkEngine.verifyMessage(msg, hw);
check('오류 0건', v.errors.length === 0, JSON.stringify(v.errors));
check('경고 0건', v.warnings.length === 0, v.warnings.map(w=>w.token).join(', '));
const faked = msg + '\n· 모의고사 3회분 풀기 (p.120~135)';
const v2 = HomeworkEngine.verifyMessage(faked, hw);
check('없는 숙제의 쪽수를 잡아냄', v2.errors.some(e=>e.token==='120'), JSON.stringify(v2.errors));

console.log('\n[8] 미완료 상태 문장');
const H2 = Store.saveHomework({ studentId:s.id, date:'2026-09-18', dueDate:'2026-09-20',
  base:['워크북 p.50~55'], extra:[] });
const msg2 = HomeworkEngine.buildMessage(Store.getHomework(H2.id), Store.getSettings());
console.log('\n--- 미완료 상태 ---\n' + msg2 + '\n-------------------');
check('추가 숙제 없으면 문단 생략', !msg2.includes('■ 오늘 추가 숙제'));
check('진행 상황 문단 생략', !msg2.includes('■ 진행 상황'));
check('교사 확인 안 했으면 문단 생략', !msg2.includes('■ 교사 확인'));
check('미완료면 확인 요청 문구 포함', msg2.includes('가정에서도 확인 부탁드립니다'));

console.log('\n[9] 입력 검증');
check('학생 없으면 거부', !Store.saveHomework({ studentId:'없음', date:'2026-09-17', base:['x'] }).ok);
check('숙제가 하나도 없으면 거부', !Store.saveHomework({ studentId:s.id, date:'2026-09-17', base:[], extra:[] }).ok);
check('빈 문자열 항목은 걸러짐', !Store.saveHomework({ studentId:s.id, date:'2026-09-17', base:['  ','']}).ok);
check('제출일이 숙제일보다 앞서면 거부', !Store.saveHomework({ studentId:s.id, date:'2026-09-17', dueDate:'2026-09-15', base:['x'] }).ok);

console.log('\n[10] 기능 5 — 최근 숙제 기록 확인');
const list = Store.getHomeworks({ studentId: s.id });
check('학생별 조회', list.length === 2);
check('최근 날짜가 먼저', list[0].date === '2026-09-18');
check('상태 필터', Store.getHomeworks({ state:'done' }).length === 1);
check('교사 확인 필터', Store.getHomeworks({ checked:true }).length === 1);
check('내용 검색', Store.getHomeworks({ keyword:'서술형' }).length === 1);

console.log('\n[11] 데이터 보호 — 삭제 없이 보관 / 백업 병합');
Store.setHomeworkArchived(H2.id, true);
check('보관 시 목록에서 숨김', Store.getHomeworks().every(h=>h.id!==H2.id));
check('보관해도 데이터는 남음', !!Store.getHomework(H2.id));
const backup = Store.exportJSON();
check('백업에 숙제 포함', JSON.parse(backup).homeworks.length === 2);
const before = Store.getHomeworks({includeArchived:true}).length;
const imp = Store.importJSON(backup, 'merge');
check('중복 추가 안 됨', Store.getHomeworks({includeArchived:true}).length === before, JSON.stringify(imp.added));
check('기존 숙제 유지', !!Store.getHomework(H.id));

console.log('\n[12] 예전 백업 파일 호환 (숙제 기능 이전 데이터)');
const oldBackup = JSON.stringify({ schemaVersion:1, teachers:[], students:[{id:'old_s',name:'예전학생',archived:false}], lessons:[] });
const imp2 = Store.importJSON(oldBackup, 'merge');
check('예전 파일도 읽힘', imp2.ok, JSON.stringify(imp2));
const migrated = Store.getStudent('old_s');
check('담당교사 필드 자동 생성', typeof migrated.teacher === 'string');
check('기본 숙제 필드 자동 생성', Array.isArray(migrated.defaultHomework));

console.log('\n════════════════════════════════');
console.log(`통과 ${pass}건 / 실패 ${fail}건`);
console.log('════════════════════════════════');
process.exit(fail?1:0);
