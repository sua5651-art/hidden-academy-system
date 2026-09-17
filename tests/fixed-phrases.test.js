// 앱이 스스로 만들어 넣는 고정 문구가 검증기에 걸리는지 전수 조사
const fs=require('fs'),vm=require('vm');
const mem={};const localStorage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]}};
const ctx={console,localStorage,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['assets/js/store.js','assets/js/feedback.js','assets/js/homework.js','assets/js/counsel.js','assets/js/exam.js'])
  vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',f),'utf8'),ctx,{filename:f});
const {Store,FeedbackEngine,HomeworkEngine,CounselEngine,ExamEngine}=ctx;

const s=Store.saveStudent({name:'홍길동'});
const bad=new Set();

// 모든 톤 × 모든 이해도 × 입력 유무 조합으로 피드백 생성
for(const tone of ['concise','default','warm']){
  const settings=Object.assign(Store.getSettings(),{tone});
  for(const lv of ['excellent','good','average','needs_work','weak']){
    for(const filled of [true,false]){
      const L=Store.saveLesson({studentId:s.id,date:'2026-09-17',teacher:'김선생',input:{
        progress:'진도', understanding:lv,
        understandingNote: filled?'메모':'', improve: filled?'보완':'',
        homework: filled?'숙제':'', memo: filled?'전달':''}});
      const les=Store.getLesson(L.id);
      const sec=FeedbackEngine.generateRuleBased(les,settings);
      FeedbackEngine.verify(sec,les).warnings.forEach(w=>bad.add('피드백['+tone+'/'+lv+'] '+w.token));
    }
  }
}

// 모든 숙제 조합
for(const done of [0,1,2]){
  for(const checked of [true,false]){
    for(const due of ['2026-09-19','']){
      const H=Store.saveHomework({studentId:s.id,date:'2026-09-17',dueDate:due,
        base:['워크북'],extra:['추가문제']});
      let hw=Store.getHomework(H.id);
      if(done>=1) Store.setHomeworkItemDone(H.id,'base',hw.base[0].id,true);
      if(done>=2) Store.setHomeworkItemDone(H.id,'extra',hw.extra[0].id,true);
      if(checked) Store.setTeacherCheck(H.id,{checked:true,by:'김선생'});
      hw=Store.getHomework(H.id);
      const msg=HomeworkEngine.buildMessage(hw,Store.getSettings());
      const v=HomeworkEngine.verifyMessage(msg,hw);
      v.errors.forEach(e=>bad.add('숙제 오류 '+e.token));
      v.warnings.forEach(w=>bad.add('숙제[완료'+done+'/확인'+checked+'/제출'+(due?'O':'X')+'] '+w.token));
    }
  }
}

// 상담 요약: 유형·대상·항목 유무 전 조합
for(const type of Store.COUNSEL_TYPES.map(t=>t.code)){
  for(const target of Store.COUNSEL_TARGETS.map(t=>t.code)){
    for(const filled of [true,false]){
      const C=Store.saveCounsel({studentId:s.id,date:Store.todayStr(),target,type,
        content:'어머니와 전화로 이야기를 나눴습니다. 집에서 공부하는 시간이 짧다고 하셨습니다.',
        parentRequest: filled?'단어 시험을 매주 봐 주세요':'',
        academyReply: filled?'금요일마다 시험을 보기로 했습니다':'',
        followUp: filled?{needed:true,text:'2주 뒤 결과를 정리해 다시 연락'}:{needed:false,text:''}});
      const rec=Store.getCounsel(C.id);
      const lines=CounselEngine.summarizeRuleBased(rec);
      const v=CounselEngine.verifySummary(lines,rec);
      v.errors.forEach(e=>bad.add('상담 오류 '+e.token));
      v.warnings.forEach(w=>bad.add('상담['+type+'/'+target+'/'+(filled?'전체':'최소')+'] '+w.token));
    }
  }
}

// 내신 체크리스트: 준비 상태 · 취약 문법 · 오답 · 보강 전 조합
const EX = Store.saveExam({ school:'정왕중', grade:'중3', term:'2학기 중간고사',
  textbook:'천재(이재영)', examDate: Store.dayOffset(9),
  units:['Lesson 5','Lesson 6'], rangeNote:'교과서 본문 + 워크북',
  grammarPoints:['관계대명사','수동태'], performance:'서술형 30%' });
const EXAM = Store.getExam(EX.id);
Store.saveStudent({ name:'테스트생', school:'정왕중', grade:'중3' });
const EST = Store.getExamStudents(EX.id)[0];
for(const u1 of ['todo','doing','done']){
  for(const m1 of ['todo','doing','done']){
    for(const extra of [true,false]){
      for(const wrong of [0,7]){
        for(const incDone of [true,false]){
          Store.savePrep({ examId:EX.id, studentId:EST.id, targetScore: 95,
            units:{[EXAM.units[0].id]:u1,[EXAM.units[1].id]:'done'},
            memorize:{[EXAM.units[0].id]:m1,[EXAM.units[1].id]:'done'},
            weakGrammar: extra?[EXAM.grammarPoints[0].id]:[],
            weakGrammarNote: extra?'관계대명사 what 용법':'',
            wrongCount: wrong, needsExtra: extra, extraNote: extra?'주말 보강 1회':'' });
          const pr=Store.getPrep(EX.id,EST.id);
          const txt=ExamEngine.buildChecklist(EXAM,pr,Store.getSettings(),{includeDone:incDone});
          const v=ExamEngine.verifyChecklist(txt,EXAM,pr);
          v.errors.forEach(e=>bad.add('내신 오류 '+e.token));
          v.warnings.forEach(w=>bad.add('내신['+u1+'/'+m1+'/'+(extra?'약점':'-')+'] '+w.token));
        }
      }
    }
  }
}

if(bad.size){ console.log('오탐 '+bad.size+'건:'); [...bad].forEach(b=>console.log('  · '+b)); process.exit(1); }
console.log('오탐 없음 — 모든 고정 문구가 검증기를 통과합니다');
