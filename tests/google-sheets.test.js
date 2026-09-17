// Apps Script 를 흉내 내어 Code.gs 의 동작을 확인한다 (구글 계정 없이 검증)
const fs = require('fs'), vm = require('vm');

function makeSheet() {
  const rows = [];
  return {
    _rows: rows,
    getLastRow: () => rows.length,
    setFrozenRows: () => {},
    getRange(r, c, nr, nc) {
      return {
        setValues(vals) {
          for (let i = 0; i < vals.length; i++) {
            const target = r - 1 + i;
            while (rows.length <= target) rows.push([]);
            for (let j = 0; j < vals[i].length; j++) rows[target][c - 1 + j] = vals[i][j];
          }
        },
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = rows[r - 1 + i] || [];
            out.push(row.slice(c - 1, c - 1 + nc));
          }
          return out;
        },
        setFontWeight: () => {}
      };
    }
  };
}

const sheets = {};
const ctx = {
  console, JSON, String, Object, Array, Number,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getName: () => '테스트 시트',
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet())
  })},
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } })
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','docs','google-sheets','Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
ctx.SECRET = 'test-secret';

let pass = 0, fail = 0;
const check = (n, c, e) => c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (e ? '\n     → ' + e : '')));
const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());

console.log('\n[1] 연결 확인 (브라우저로 주소를 열었을 때)');
const g = JSON.parse(ctx.doGet().getContent());
check('연결 응답', g.ok === true && g.message.includes('연결'));
check('붙어 있는 시트 파일 이름 표시', g.data.sheet_file === '테스트 시트', JSON.stringify(g.data));
check('만들 시트 목록 안내', JSON.stringify(g.data.sheets) === '["수업기록","숙제기록","상담기록"]');

console.log('\n[1-2] 시트에 붙어 있지 않을 때 (script.google.com 에서 따로 만든 경우)');
const realSS = ctx.SpreadsheetApp.getActiveSpreadsheet;
ctx.SpreadsheetApp.getActiveSpreadsheet = () => null;
const g2 = JSON.parse(ctx.doGet().getContent());
check('연결 안 됐다고 알려 줌', g2.ok === false && g2.message.includes('시트에 연결되어 있지 않습니다'), g2.message);
check('무엇을 해야 하는지 알려 줌', g2.message.includes('확장 프로그램'));
const p2 = JSON.parse(ctx.doPost({ postData:{ contents: JSON.stringify({
  secret:'test-secret', type:'lesson', records:[{ record_id:'x', student_name:'테스트' }] })}}).getContent());
check('기록을 보내도 같은 안내', p2.ok === false && p2.message.includes('시트에 연결되어 있지 않습니다'), p2.message);
ctx.SpreadsheetApp.getActiveSpreadsheet = realSS;

console.log('\n[2] 비밀번호 검사');
check('비밀번호 틀리면 거부', post({ secret:'틀림', type:'lesson', records:[{}] }).ok === false);
check('내용이 비면 거부', JSON.parse(ctx.doPost({}).getContent()).ok === false);
check('모르는 종류 거부', post({ secret:'test-secret', type:'없음', records:[{}] }).ok === false);
check('기록이 없으면 거부', post({ secret:'test-secret', type:'lesson', records:[] }).ok === false);

console.log('\n[3] 수업 기록 저장');
const r1 = post({ secret:'test-secret', type:'lesson', records:[{
  saved_at:'2026-09-26T01:00:00Z', record_id:'les_1', student_name:'김민준',
  class_date:'2026-09-26', teacher:'김선생', progress:'Lesson 8 본문 해석',
  understanding:'매우 우수', understanding_note:'', improve:'',
  homework:'워크북 p.56~60', note:'기말고사 대비 시작' }]});
check('저장 성공', r1.ok && r1.data.added === 1, JSON.stringify(r1));
const sheet = sheets['수업기록'];
check('시트가 만들어짐', !!sheet);
check('제목줄이 생김', sheet._rows[0][0] === 'saved_at' && sheet._rows[0][2] === 'student_name',
  JSON.stringify(sheet._rows[0]));
check('값이 열 순서대로 들어감',
  sheet._rows[1][2] === '김민준' && sheet._rows[1][3] === '2026-09-26' &&
  sheet._rows[1][5] === 'Lesson 8 본문 해석' && sheet._rows[1][9] === '워크북 p.56~60' &&
  sheet._rows[1][10] === '기말고사 대비 시작', JSON.stringify(sheet._rows[1]));

console.log('\n[4] 같은 기록을 다시 보내면 줄이 늘지 않고 고쳐진다');
const r2 = post({ secret:'test-secret', type:'lesson', records:[{
  saved_at:'2026-09-26T02:00:00Z', record_id:'les_1', student_name:'김민준',
  class_date:'2026-09-26', teacher:'김선생', progress:'Lesson 8 본문 해석 + 문법',
  homework:'워크북 p.56~60', note:'기말고사 대비 시작' }]});
check('고침으로 처리됨', r2.ok && r2.data.updated === 1 && r2.data.added === 0, JSON.stringify(r2));
check('줄 수가 그대로', sheet._rows.length === 2, '줄 수 ' + sheet._rows.length);
check('내용이 바뀜', sheet._rows[1][5] === 'Lesson 8 본문 해석 + 문법');

console.log('\n[5] 여러 건을 한 번에');
const r3 = post({ secret:'test-secret', type:'lesson', records:[
  { record_id:'les_2', student_name:'이서연', class_date:'2026-09-20', progress:'리딩튜터 2과' },
  { record_id:'les_3', student_name:'박지후', class_date:'2026-09-18', progress:'중등 문법 5과' }]});
check('2건 추가', r3.ok && r3.data.added === 2);
check('시트에 4줄 (제목줄 포함)', sheet._rows.length === 4, '줄 수 ' + sheet._rows.length);
check('빈 값은 빈칸으로', sheet._rows[2][4] === '' && sheet._rows[2][9] === '');

console.log('\n[6] 숙제·상담도 각각 다른 시트로');
post({ secret:'test-secret', type:'homework', records:[{ record_id:'hw_1', student_name:'김민준', class_date:'2026-09-26', due_date:'2026-09-28', base_homework:'워크북', done_count:'1', total_count:'2' }]});
post({ secret:'test-secret', type:'counsel', records:[{ record_id:'cns_1', student_name:'김민준', class_date:'2026-09-20', type:'성적 상담', content:'성적 이야기' }]});
check('숙제기록 시트 생성', !!sheets['숙제기록'] && sheets['숙제기록']._rows.length === 2);
check('상담기록 시트 생성', !!sheets['상담기록'] && sheets['상담기록']._rows.length === 2);
check('수업기록은 영향 없음', sheet._rows.length === 4);

console.log('\n════════════════════════════════');
console.log(`통과 ${pass}건 / 실패 ${fail}건`);
console.log('════════════════════════════════');
process.exit(fail ? 1 : 0);
