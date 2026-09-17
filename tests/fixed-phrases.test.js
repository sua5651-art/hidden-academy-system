// 앱이 스스로 만들어 넣는 고정 문구가 검증기에 걸리는지 전수 조사
const fs=require('fs'),vm=require('vm');
const mem={};const localStorage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]}};
const ctx={console,localStorage,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['assets/js/store.js','assets/js/feedback.js','assets/js/homework.js'])
  vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',f),'utf8'),ctx,{filename:f});
const {Store,FeedbackEngine,HomeworkEngine}=ctx;

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

if(bad.size){ console.log('오탐 '+bad.size+'건:'); [...bad].forEach(b=>console.log('  · '+b)); process.exit(1); }
console.log('오탐 없음 — 모든 고정 문구가 검증기를 통과합니다');
