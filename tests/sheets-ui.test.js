// 앱 → 구글 시트 전송을 실제 브라우저로 확인한다.
// 가짜 Apps Script 서버가 진짜 Code.gs 를 그대로 돌리므로 규칙이 같다.
function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(p); } catch (e) {}
  }
  console.error('playwright 가 필요합니다:  npm i -D playwright');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const SHEET_URL = 'http://127.0.0.1:8930/';
const SECRET = 'test-secret';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, locale:'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  const base = 'http://127.0.0.1:8899/index.html';
  let n = 0;
  const ok = m => { n++; console.log('  ✅ ' + m); };
  const sheetRows = async () => (await (await fetch('http://127.0.0.1:8930/__rows')).json());

  console.log('\n[1] 설정 화면에서 주소·비밀번호 입력');
  await page.goto(base + '#/settings');
  await page.waitForSelector('#shUrl');
  await page.fill('#shUrl', SHEET_URL);
  await page.fill('#shSecret', SECRET);
  await page.click('#saveSettings');
  await page.waitForTimeout(250);
  const saved = await page.evaluate(() => Store.getSettings().sheets);
  if (saved.url !== SHEET_URL || saved.secret !== SECRET) throw new Error('설정이 저장되지 않음: ' + JSON.stringify(saved));
  ok('주소·비밀번호 저장됨');

  console.log('\n[2] 연결 시험');
  await page.click('#shTestBtn');
  await page.waitForSelector('#shResult .note');
  const okMsg = await page.textContent('#shResult .note');
  if (!okMsg.includes('연결되었습니다')) throw new Error('연결 시험 실패: ' + okMsg);
  ok('연결 시험 통과 — ' + okMsg.trim());
  // 시험만으로는 시트에 아무것도 쓰이지 않아야 한다
  if (Object.keys(await sheetRows()).length) throw new Error('연결 시험이 시트에 기록을 남김');
  ok('연결 시험은 시트에 아무것도 쓰지 않음');

  console.log('\n[3] 비밀번호가 틀리면');
  await page.fill('#shSecret', '틀린비밀번호');
  await page.click('#shTestBtn');
  await page.waitForFunction(() => {
    const el = document.querySelector('#shResult .note');
    return el && el.textContent.includes('비밀번호');
  });
  ok('비밀번호가 틀리다고 알려 줌 — ' + (await page.textContent('#shResult .note')).trim());
  await page.fill('#shSecret', SECRET);
  await page.click('#saveSettings');
  await page.waitForTimeout(250);

  console.log('\n[3-2] 안내문 예시를 그대로 붙여넣었을 때');
  await page.fill('#shUrl', 'https://script.google.com/macros/s/AKfycbx..............long.../exec');
  await page.click('#shTestBtn');
  await page.waitForFunction(() => {
    const el = document.querySelector('#shResult .note');
    return el && el.textContent.includes('점(...)');
  }, { timeout: 8000 });
  ok('예시 주소라고 짚어 줌 — ' + (await page.textContent('#shResult .note')).trim().split('\n')[0]);

  console.log('\n[3-3] 주소가 틀렸을 때');
  await page.fill('#shUrl', 'https://script.google.com/macros/s/없는주소/exec');
  await page.click('#shTestBtn');
  await page.waitForFunction(() => {
    const el = document.querySelector('#shResult .note--err');
    return el && el.textContent.includes('연결하지 못했습니다');
  }, { timeout: 15000 });
  const netMsg = await page.textContent('#shResult .note');
  if (!netMsg.includes('배포 관리')) throw new Error('무엇을 확인할지 안내가 없음: ' + netMsg);
  ok('영어 오류 대신 확인할 곳을 알려 줌');
  await page.fill('#shUrl', SHEET_URL);
  await page.click('#saveSettings');
  await page.waitForTimeout(250);

  console.log('\n[4] 수업 기록을 저장하면 시트에 쌓인다');
  await page.evaluate(() => Store.saveStudent({ name:'김민준', school:'정왕중', grade:'중3', teacher:'김선생' }));
  await page.goto(base + '#/home');
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#lessonForm');
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.fill('input[name="date"]', '2026-09-26');
  await page.fill('textarea[name="progress"]', 'Lesson 8 본문 해석');
  await page.click('.level[data-code="excellent"]');
  await page.fill('textarea[name="homework"]', '워크북 p.56~60');
  await page.fill('textarea[name="memo"]', '기말고사 대비 시작');
  await page.click('#lessonForm button[type="submit"]');
  await page.waitForSelector('#genBtn');
  await page.waitForTimeout(700);

  const r1 = await sheetRows();
  if (!r1['수업기록']) throw new Error('수업기록 시트가 만들어지지 않음: ' + JSON.stringify(Object.keys(r1)));
  const head = r1['수업기록'][0], row = r1['수업기록'][1];
  if (!row) throw new Error('기록이 쌓이지 않음');
  const val = name => row[head.indexOf(name)];
  const expect = {
    student_name: '김민준', class_date: '2026-09-26', teacher: '김선생',
    progress: 'Lesson 8 본문 해석', understanding: '매우 우수',
    homework: '워크북 p.56~60', note: '기말고사 대비 시작'
  };
  for (const k in expect) {
    if (val(k) !== expect[k]) throw new Error(k + ' 가 다름: ' + val(k) + ' ≠ ' + expect[k]);
  }
  ok('요청한 5개 항목이 열 이름대로 들어감');
  console.log('     student_name=' + val('student_name') + ' · class_date=' + val('class_date') +
              ' · progress=' + val('progress') + ' · homework=' + val('homework') + ' · note=' + val('note'));
  if (!val('record_id')) throw new Error('record_id 가 비었음');
  ok('record_id · saved_at 도 함께 기록됨');

  console.log('\n[5] 기록을 수정하면 줄이 늘지 않고 고쳐진다');
  const lessonId = await page.evaluate(() => Store.getLessons()[0].id);
  await page.goto(base + '#/home');
  await page.goto(base + '#/lesson/' + lessonId + '/edit');
  await page.waitForSelector('#lessonForm');
  await page.fill('textarea[name="progress"]', 'Lesson 8 본문 해석 + 문법 정리');
  await page.click('#lessonForm button[type="submit"]');
  await page.waitForSelector('#genBtn');
  await page.waitForTimeout(700);
  const r2 = await sheetRows();
  if (r2['수업기록'].length !== 2) throw new Error('줄이 늘어남: ' + r2['수업기록'].length);
  if (r2['수업기록'][1][head.indexOf('progress')] !== 'Lesson 8 본문 해석 + 문법 정리')
    throw new Error('수정 내용이 반영되지 않음');
  ok('같은 기록은 줄을 늘리지 않고 그 줄을 고침');

  console.log('\n[6] 숙제·상담도 각각의 시트로');
  await page.evaluate(() => {
    const sid = Store.getStudents()[0].id;
    Store.setDefaultHomework(sid, ['워크북 p.42~45']);
  });
  await page.goto(base + '#/homework/new');
  await page.waitForSelector('#hwForm');
  await page.selectOption('#hwStudentSel', { index: 1 });
  await page.waitForTimeout(200);
  await page.fill('input[name="dueDate"]', '2026-09-28');
  await page.click('#hwForm button[type="submit"]');
  await page.waitForSelector('#hwGenBtn');
  await page.waitForTimeout(700);

  await page.goto(base + '#/counsel/new');
  await page.waitForSelector('#cnsForm');
  await page.selectOption('#cnsStudentSel', { index: 1 });
  await page.fill('textarea[name="content"]', '성적 관련 상담을 진행했습니다.');
  await page.fill('textarea[name="parentRequest"]', '단어 시험을 매주 봐 주세요');
  await page.fill('textarea[name="academyReply"]', '금요일마다 진행하기로 했습니다');
  await page.click('#cnsForm button[type="submit"]');
  await page.waitForSelector('#cnsGenBtn');
  await page.waitForTimeout(700);

  const r3 = await sheetRows();
  if (!r3['숙제기록'] || r3['숙제기록'].length !== 2) throw new Error('숙제기록이 쌓이지 않음');
  if (!r3['상담기록'] || r3['상담기록'].length !== 2) throw new Error('상담기록이 쌓이지 않음');
  const ch = r3['상담기록'][0], cr = r3['상담기록'][1];
  if (cr[ch.indexOf('parent_request')] !== '단어 시험을 매주 봐 주세요') throw new Error('학부모 요청이 다름');
  ok('숙제기록 · 상담기록 시트에 각각 쌓임');

  console.log('\n[7] 인터넷이 끊겼을 때 — 기록은 남고 대기줄에 적힌다');
  await page.evaluate(() => {
    const s = Store.getSettings();
    Store.updateSettings({ sheets: { url: 'http://127.0.0.1:9999/없는주소', secret: s.sheets.secret, autoSend: true } });
  });
  await page.goto(base + '#/home');
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#lessonForm');
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.fill('input[name="date"]', '2026-09-27');
  await page.fill('textarea[name="progress"]', '전송 실패 시험용 기록');
  await page.click('.level[data-code="good"]');
  await page.click('#lessonForm button[type="submit"]');
  await page.waitForSelector('#genBtn');
  await page.waitForTimeout(900);

  const lessons = await page.evaluate(() => Store.getLessons().length);
  const queue = await page.evaluate(() => Store.getSheetQueue());
  if (lessons !== 2) throw new Error('전송 실패로 기록이 사라짐: ' + lessons);
  if (!queue.length) throw new Error('대기줄에 적히지 않음');
  ok('전송이 실패해도 기록은 기기에 남음 (수업 ' + lessons + '건)');
  ok('보내지 못한 기록이 대기줄에 ' + queue.length + '건 적힘');

  console.log('\n[8] 다시 연결되면 밀린 기록을 보낸다');
  await page.evaluate((u) => {
    const s = Store.getSettings();
    Store.updateSettings({ sheets: { url: u, secret: s.sheets.secret, autoSend: true } });
  }, SHEET_URL);
  await page.goto(base + '#/settings');
  await page.waitForSelector('#shFlushBtn');
  // 설정 화면에는 경고 상자가 여럿이라 (AI 키 안내 등) 문구로 찾는다
  const notice = await page.$$eval('.note--warn', els =>
    (els.map(e => e.textContent).find(t => t.includes('보내지 못한')) || ''));
  if (!notice) throw new Error('설정 화면에 밀린 건수 안내가 없음');
  ok('설정 화면이 밀린 건수를 알려 줌');
  await page.click('#shFlushBtn');
  await page.waitForFunction(() => !document.querySelector('#shFlushBtn'), { timeout: 10000 });
  const q2 = await page.evaluate(() => Store.getSheetQueue().length);
  if (q2 !== 0) throw new Error('대기줄이 비워지지 않음: ' + q2);
  const r4 = await sheetRows();
  if (r4['수업기록'].length !== 3) throw new Error('밀린 기록이 시트에 안 올라감: ' + r4['수업기록'].length);
  ok('다시 보내기로 밀린 기록이 시트에 올라감');

  console.log('\n[9] 자동 전송을 끄면 보내지 않는다');
  await page.evaluate((u) => {
    const s = Store.getSettings();
    Store.updateSettings({ sheets: { url: u, secret: s.sheets.secret, autoSend: false } });
  }, SHEET_URL);
  await page.goto(base + '#/home');
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#lessonForm');
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.fill('input[name="date"]', '2026-09-28');
  await page.fill('textarea[name="progress"]', '자동 전송 꺼짐 시험');
  await page.click('.level[data-code="good"]');
  await page.click('#lessonForm button[type="submit"]');
  await page.waitForSelector('#genBtn');
  await page.waitForTimeout(700);
  const r5 = await sheetRows();
  if (r5['수업기록'].length !== 3) throw new Error('자동 전송을 껐는데 보냄: ' + r5['수업기록'].length);
  if (await page.evaluate(() => Store.getLessons().length) !== 3) throw new Error('기록이 저장되지 않음');
  ok('자동 전송을 끄면 시트로 보내지 않고 기기에만 저장');

  console.log('\n[10] 설정이 비어 있으면 평소처럼 동작한다');
  await page.evaluate(() => Store.updateSettings({ sheets: { url:'', secret:'', autoSend:true } }));
  await page.goto(base + '#/home');
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#lessonForm');
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.fill('input[name="date"]', '2026-09-29');
  await page.fill('textarea[name="progress"]', '시트 설정 없음 시험');
  await page.click('.level[data-code="good"]');
  await page.click('#lessonForm button[type="submit"]');
  await page.waitForSelector('#genBtn');
  await page.waitForTimeout(400);
  if (await page.evaluate(() => Store.getLessons().length) !== 4) throw new Error('저장이 안 됨');
  if (await page.evaluate(() => Store.getSheetQueue().length) !== 0) throw new Error('설정이 없는데 대기줄에 쌓임');
  ok('시트를 안 쓰면 기존과 똑같이 동작 (대기줄도 안 쌓임)');

  await browser.close();
  if (errors.length) { console.log('\n⚠️ 브라우저 오류:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n════════ 구글 시트 전송 검사 ' + n + '건 전부 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
