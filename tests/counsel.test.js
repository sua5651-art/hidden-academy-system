const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const mem = {};
const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k,v)=>{mem[k]=String(v)}, removeItem: k=>{delete mem[k]} };
const ctx = { console, localStorage, Date, JSON, Math, Object, Array, String, Number, isNaN, parseInt };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['assets/js/store.js','assets/js/feedback.js','assets/js/homework.js','assets/js/counsel.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, {filename:f});
const { Store, CounselEngine } = ctx;

let pass=0, fail=0;
function check(n,c,e){ if(c){pass++;console.log('  ✅ '+n)} else {fail++;console.log('  ❌ '+n+(e?'\n     → '+e:''))} }
const day = o => Store.dayOffset(o);

const s1 = Store.saveStudent({ name:'김민준', school:'서해고', grade:'고2', className:'내신 A반', teacher:'김선생' }).id;
const s2 = Store.saveStudent({ name:'이서연', school:'함현고', grade:'고1', className:'내신 B반', teacher:'박선생' }).id;

const LONG = [
  '2학기 중간고사 영어 성적이 3등급으로 지난 시험보다 한 등급 떨어졌다고 걱정하셨습니다.',
  '수업 시간에는 집중해서 잘 따라오고 있으나 단어 암기량이 부족한 편이라고 말씀드렸습니다.',
  '어머니께서는 아이가 집에서 영어 공부 시간을 거의 갖지 않는다고 하셨습니다.',
  '주 2회 수업 외에 단어 테스트를 추가로 진행하는 방안을 제안드렸습니다.',
  '기말고사까지 남은 기간 동안 내신 대비 자료를 추가로 제공하기로 했습니다.'
].join('\n');

console.log('\n[1] 상담 기록 저장 (9개 입력 항목)');
const C = Store.saveCounsel({
  studentId: s1, date: day(0), counselor:'김선생',
  target:'parent', type:'grade',
  content: LONG,
  parentRequest:'단어 시험을 매주 봐 주셨으면 합니다',
  academyReply:'다음 주부터 매주 금요일 단어 시험을 진행하기로 안내드렸습니다',
  nextCheckDate: day(2),
  followUp: { needed:true, text:'2주 뒤 단어 시험 결과 정리해서 다시 연락' }
});
check('저장 성공', C.ok);
let c = Store.getCounsel(C.id);
check('학생명 함께 보존', c.studentName === '김민준');
check('반/레벨 기록 시점 보존', c.className === '내신 A반');
check('상담 대상·유형 저장', c.target === 'parent' && c.type === 'grade');
check('학부모 요청사항 저장', c.parentRequest.includes('단어 시험'));
check('학원 답변 저장', c.academyReply.includes('금요일'));
check('후속조치 저장', c.followUp.needed && c.followUp.text.includes('2주 뒤'));
check('다음 확인일 저장', c.nextCheckDate === day(2));
check('요약은 비어 있는 별도 필드', c.summary && c.summary.text === '' && Array.isArray(c.summary.lines));

console.log('\n[2] 입력 검증');
check('학생 없으면 거부', !Store.saveCounsel({ studentId:'없음', date:day(0), content:'x' }).ok);
check('상담 내용 없으면 거부', !Store.saveCounsel({ studentId:s1, date:day(0), content:'   ' }).ok);
check('상담일 없으면 거부', !Store.saveCounsel({ studentId:s1, content:'x' }).ok);
check('확인일이 상담일보다 앞서면 거부', !Store.saveCounsel({ studentId:s1, date:day(0), content:'x', nextCheckDate:day(-3) }).ok);

console.log('\n[3] 기능 3 — 상담 내용 3~5줄 요약 (원문과 별도 저장)');
const lines = CounselEngine.summarizeRuleBased(c);
console.log('\n--- 생성된 요약 ---\n' + CounselEngine.formatLines(lines) + '\n-------------------');
check('5줄 이하', lines.length <= 5, '실제 ' + lines.length + '줄');
check('3줄 이상', lines.length >= 3, '실제 ' + lines.length + '줄');
check('상담 유형·대상 줄 포함', lines[0].includes('성적 상담') && lines[0].includes('학부모'));
check('학부모 요청이 한 줄로', lines.some(l => l.startsWith('학부모 요청:')));
check('학원 답변이 한 줄로', lines.some(l => l.startsWith('학원 답변:')));
check('모든 줄이 원문에서 나옴(지어내지 않음)',
  CounselEngine.verifySummary(lines, c).errors.length === 0,
  JSON.stringify(CounselEngine.verifySummary(lines, c).errors));

Store.saveCounselSummary(C.id, { text: CounselEngine.formatLines(lines), lines: lines, engine:'rule' });
c = Store.getCounsel(C.id);
check('요약이 별도 필드에 저장됨', c.summary.text.length > 0 && c.summary.lines.length === lines.length);
check('원문은 그대로 유지됨', c.content === LONG);

console.log('\n[4] 요약을 다시 만들어도 원문은 안 바뀐다');
Store.saveCounselSummary(C.id, { text:'· 완전히 다른 요약', lines:['완전히 다른 요약'], engine:'ai' });
c = Store.getCounsel(C.id);
check('요약만 교체됨', c.summary.text === '· 완전히 다른 요약' && c.summary.engine === 'ai');
check('원문 그대로', c.content === LONG);
Store.saveCounselSummary(C.id, { text: CounselEngine.formatLines(lines), lines: lines, engine:'rule' });

console.log('\n[5] 요약 검증 — 지어낸 내용과 줄 수 초과를 잡아내는지');
const bad = CounselEngine.verifySummary(['2학기 기말고사에서 92점을 받았습니다','Reading Tutor 교재를 추가합니다'], c);
check('없는 점수(92) 잡음', bad.errors.some(e=>e.token==='92'), JSON.stringify(bad.errors));
check('없는 교재명 잡음', bad.errors.some(e=>e.token==='Reading'));
const tooMany = CounselEngine.verifySummary(['가','나','다','라','마','바'], c);
check('5줄 초과 경고', tooMany.warnings.some(w=>w.type==='length'), JSON.stringify(tooMany.warnings));
check('5줄로 잘라냄', CounselEngine.clampLines(['1','2','3','4','5','6','7']).length === 5);

console.log('\n[6] 짧은 상담은 억지로 3줄을 채우지 않는다');
const C2 = Store.saveCounsel({ studentId:s2, date:day(-1), target:'student', type:'attitude',
  content:'지각이 잦아 학생과 직접 이야기했습니다.' });
const short = CounselEngine.summarizeRuleBased(Store.getCounsel(C2.id));
check('짧으면 줄 수가 적어도 됨', short.length >= 1 && short.length <= 5, '실제 ' + short.length + '줄');
check('없는 내용을 채워 넣지 않음', CounselEngine.verifySummary(short, Store.getCounsel(C2.id)).errors.length === 0);

console.log('\n[7] 기능 1·2 — 학생별 조회 / 최신순 정렬');
Store.saveCounsel({ studentId:s1, date:day(-10), target:'parent', type:'regular', content:'1학기 정기 상담을 진행했습니다.' });
Store.saveCounsel({ studentId:s1, date:day(-5), target:'parent', type:'career', content:'진학 관련 문의가 있었습니다.' });
const mine = Store.getCounsels({ studentId: s1 });
check('학생별 조회', mine.length === 3 && mine.every(x=>x.studentId===s1));
check('최신 상담이 맨 위', mine[0].date === day(0));
check('그 다음이 5일 전', mine[1].date === day(-5));
check('가장 오래된 것이 마지막', mine[2].date === day(-10));
check('다른 학생 것은 안 섞임', Store.getCounsels({ studentId: s2 }).length === 1);
check('유형 필터', Store.getCounsels({ studentId:s1, type:'career' }).length === 1);
check('내용 검색', Store.getCounsels({ keyword:'진학' }).length === 1);

console.log('\n[8] 기능 4 — 후속조치가 필요한 상담 표시');
let need = Store.getCounsels({ followUp: true });
check('후속조치 필요 건만 조회', need.length === 1 && need[0].id === C.id);
check('통계에 반영', Store.getStats().counselsFollowUp === 1);
check('후속조치 아닌 건은 완료 처리 거부', !Store.setFollowUpDone(C2.id, true).ok);
Store.setFollowUpDone(C.id, true);
c = Store.getCounsel(C.id);
check('완료 처리됨', c.followUp.done && !!c.followUp.doneAt);
check('완료 후 목록에서 빠짐', Store.getCounsels({ followUp:true }).length === 0);
Store.setFollowUpDone(C.id, false);
check('해제하면 다시 표시', Store.getCounsels({ followUp:true }).length === 1);

console.log('\n[9] 기능 5 — 다음 확인일 임박 표시');
Store.saveCounsel({ studentId:s2, date:day(-4), target:'parent', type:'request',
  content:'교재 변경 요청이 있었습니다.', nextCheckDate: day(-1) });   // 이미 지남
Store.saveCounsel({ studentId:s2, date:day(0), target:'parent', type:'other',
  content:'차량 이용 문의가 있었습니다.', nextCheckDate: day(10) });   // 아직 멀었음
const due = Store.getUpcomingChecks(3);
check('임박·경과 건만 나옴', due.length === 2, due.map(d=>d.nextCheckDate).join(', '));
check('임박한 순서대로', due[0].nextCheckDate <= due[1].nextCheckDate);
check('지난 건은 overdue 표시', due[0].overdue === true);
check('D-day 계산', due.some(d => d.dday === 2));
check('먼 날짜는 제외', !due.some(d => d.nextCheckDate === day(10)));
check('통계에 반영', Store.getStats().counselsDueSoon === 2);
Store.setFollowUpDone(C.id, true);
check('후속조치 끝낸 건은 알림에서 빠짐', Store.getUpcomingChecks(3).length === 1);
Store.setFollowUpDone(C.id, false);

console.log('\n[10] 기능 6 — 수정하면 수정일이 남는다');
c = Store.getCounsel(C.id);
const createdAt = c.createdAt;
const before = Store.getCounsel(C.id).history.length;
const up = Store.saveCounsel({
  id: C.id, studentId: s1, date: day(0), counselor:'김선생', target:'parent', type:'grade',
  content: LONG + '\n추가로 기말고사 대비 일정도 안내했습니다.',
  parentRequest: c.parentRequest, academyReply: c.academyReply,
  nextCheckDate: day(5),
  followUp: { needed:true, text: c.followUp.text }
});
check('수정 성공', up.ok);
check('무엇이 바뀌었는지 알려줌', up.changed.includes('상담 내용') && up.changed.includes('다음 확인일'), JSON.stringify(up.changed));
c = Store.getCounsel(C.id);
check('수정 이력이 쌓임', c.history.length === before + 1);
check('이력에 수정일이 있음', !!c.history[c.history.length-1].at);
check('이력에 바뀐 항목이 있음', c.history[c.history.length-1].changed.includes('상담 내용'));
check('최초 작성일은 그대로', c.createdAt === createdAt);
check('수정일이 갱신됨', c.updatedAt !== createdAt);

const noChange = Store.saveCounsel({
  id: C.id, studentId: s1, date: c.date, counselor: c.counselor, target: c.target, type: c.type,
  content: c.content, parentRequest: c.parentRequest, academyReply: c.academyReply,
  nextCheckDate: c.nextCheckDate, followUp: { needed:true, text: c.followUp.text }
});
check('바뀐 게 없으면 이력을 남기지 않음', noChange.changed.length === 0 && Store.getCounsel(C.id).history.length === c.history.length);

console.log('\n[11] 요약을 직접 고치면 그것도 이력에 남는다');
const h0 = Store.getCounsel(C.id).history.length;
Store.saveCounselSummary(C.id, { text:'· 손으로 고친 요약', lines:['손으로 고친 요약'], edited:true });
c = Store.getCounsel(C.id);
check('요약 수정 이력 기록', c.history.length === h0 + 1 && c.history[c.history.length-1].changed.includes('AI 요약'));
check('직접 수정 표시', c.summary.edited === true);

console.log('\n[12] 데이터 보호 — 보관 / 백업 병합 / 예전 파일 호환');
Store.setCounselArchived(C2.id, true);
check('보관 시 목록에서 숨김', Store.getCounsels().every(x=>x.id!==C2.id));
check('보관해도 데이터는 남음', !!Store.getCounsel(C2.id));
const backup = Store.exportJSON();
check('백업에 상담 포함', JSON.parse(backup).counsels.length === 6, String(JSON.parse(backup).counsels.length));
const n0 = Store.getCounsels({includeArchived:true}).length;
Store.importJSON(backup, 'merge');
check('중복 추가 안 됨', Store.getCounsels({includeArchived:true}).length === n0);
check('기존 상담 유지', !!Store.getCounsel(C.id));
const old = JSON.stringify({ schemaVersion:1, students:[{id:'old2',name:'예전학생',archived:false}], lessons:[], teachers:[] });
check('상담 기능 이전 백업도 읽힘', Store.importJSON(old, 'merge').ok);
check('상담 목록은 그대로', !!Store.getCounsel(C.id));

console.log('\n[13] AI 지시문에 금지 규칙이 들어있는지');
const prompt = CounselEngine.buildAIPrompt(Store.getCounsel(C.id));
['원문에 없는 내용을 절대 만들어내지', '평가·추측을 쓰지', '3줄 이상 5줄 이하', '학부모 요청', '학원 답변']
  .forEach(r => check('지시문에 "' + r + '" 포함', prompt.system.includes(r)));
check('원문이 지시문에 그대로 전달됨', prompt.user.includes('2학기 중간고사 영어 성적'));

console.log('\n════════════════════════════════');
console.log(`통과 ${pass}건 / 실패 ${fail}건`);
console.log('════════════════════════════════');
process.exit(fail?1:0);
