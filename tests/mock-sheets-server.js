// 구글 Apps Script 웹앱을 흉내 내는 가짜 서버.
// 실제 Code.gs 를 그대로 실행해, 같은 규칙으로 답하게 한다.
const http = require('http');
const fs = require('fs'), vm = require('vm'), path = require('path');

const rows = {};
function makeSheet() {
  const r = [];
  return { _rows: r, getLastRow: () => r.length, setFrozenRows(){},
    getRange(rr, c, nr, nc) { return {
      setValues(v){ for(let i=0;i<v.length;i++){ const t=rr-1+i; while(r.length<=t) r.push([]);
        for(let j=0;j<v[i].length;j++) r[t][c-1+j]=v[i][j]; } },
      getValues(){ const o=[]; for(let i=0;i<nr;i++){ const row=r[rr-1+i]||[]; o.push(row.slice(c-1,c-1+nc)); } return o; },
      setFontWeight(){ return this; } }; } };
}
const ctx = { console, JSON, String, Object, Array, Number,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getName: () => '히든아카데미',
    getSheetByName: n => rows[n] || null,
    insertSheet: n => (rows[n] = makeSheet()) }) },
  ContentService: { MimeType:{JSON:'json'},
    createTextOutput: t => ({ _t:t, setMimeType(){return this;}, getContent(){return this._t;} }) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','docs','google-sheets','Code.gs'),'utf8'), ctx, {filename:'Code.gs'});
ctx.SECRET = process.env.MOCK_SECRET || 'test-secret';

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  if (req.url === '/__rows') {           // 검사용 — 시트에 실제로 쌓인 내용
    res.writeHead(200, cors);
    const out = {};
    Object.keys(rows).forEach(k => out[k] = rows[k]._rows);
    return res.end(JSON.stringify(out));
  }

  if (req.method === 'GET') {
    res.writeHead(200, cors);
    return res.end(ctx.doGet().getContent());
  }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    res.writeHead(200, cors);
    res.end(ctx.doPost({ postData: { contents: body } }).getContent());
  });
});
server.listen(8930, () => console.log('mock sheets on 8930'));
