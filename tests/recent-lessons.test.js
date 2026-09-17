// 저장 버튼 아래 "최근 수업 기록" 영역 — 기존 저장 기능과 새 조회 기능을 각각 확인한다
function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(p); } catch (e) {}
  }
  console.error('playwright 가 필요합니다:  npm i -D playwright');
  process.exit(2);
}
const { chromium } = loadPlaywright();

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, locale:'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: ' + m.text()); });
  const base = 'http://127.0.0.1:8899/index.html';
  const SP = process.env.SP || require('os').tmpdir();
  let n = 0;
  const ok = m => { n++; console.log('  ✅ ' + m); };

  // ── 준비: 학생 2명, 김민준에게 수업 7회 ──
  await page.goto(base);
  await page.evaluate(() => {
    const a = Store.saveStudent({ name:'김민준', school:'정왕중', grade:'중3', teacher:'김선생' }).id;
    const b = Store.saveStudent({ name:'이서연', school:'함현고', grade:'고1', teacher:'박선생' }).id;
    // 일부러 날짜를 뒤섞어 저장한다 (정렬이 저장 순서가 아니라 날짜를 따르는지 보려고)
    [['2026-09-02','Lesson 1 본문','워크북 p.10~15','1학기 복습 안내'],
     ['2026-09-16','Lesson 5 본문','워크북 p.42~45','중간고사 범위 확인 부탁드립니다'],
     ['2026-09-06','Lesson 2 본문','워크북 p.16~20',''],
     ['2026-09-20','Lesson 6 본문','워크북 p.46~50','단어 시험 추가 예정'],
     ['2026-09-09','Lesson 3 본문','워크북 p.21~25',''],
     ['2026-09-13','Lesson 4 본문','워크북 p.26~30',''],
     ['2026-09-23','Lesson 7 본문','워크북 p.51~55','']
    ].forEach(([d,prog,hw,memo]) => Store.saveLesson({ studentId:a, date:d, teacher:'김선생',
      input:{ progress:prog, understanding:'good', understandingNote:'', improve:'', homework:hw, memo:memo }}));
    Store.saveLesson({ studentId:b, date:'2026-09-15', teacher:'박선생',
      input:{ progress:'리딩튜터 2과', understanding:'average', understandingNote:'', improve:'', homework:'단어 정리', memo:'' }});
  });
  ok('준비 — 김민준 7회 · 이서연 1회');

  console.log('\n[기존 기능] 학생 선택 · 수업 기록 입력 · 저장');
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#lessonForm');
  const before = await page.evaluate(() => Store.getLessons().length);
  await page.selectOption('select[name="studentId"]', { index: 1 });
  ok('학생 선택 동작');
  await page.fill('input[name="date"]', '2026-09-26');
  await page.fill('textarea[name="progress"]', 'Lesson 8 본문 해석');
  await page.click('.level[data-code="excellent"]');
  await page.fill('textarea[name="homework"]', '워크북 p.56~60');
  await page.fill('textarea[name="memo"]', '기말고사 대비 시작');
  await page.click('#lessonForm button[type="submit"]');
  await page.waitForSelector('#genBtn');
  const saved = await page.evaluate(() => {
    const l = Store.getLessons()[0];
    return { n: Store.getLessons().length, studentName: l.studentName, date: l.date,
             progress: l.input.progress, homework: l.input.homework, memo: l.input.memo };
  });
  if (saved.n !== before + 1) throw new Error('저장 건수가 늘지 않음: ' + before + ' → ' + saved.n);
  if (saved.progress !== 'Lesson 8 본문 해석' || saved.homework !== '워크북 p.56~60' || saved.memo !== '기말고사 대비 시작')
    throw new Error('저장된 값이 입력과 다름: ' + JSON.stringify(saved));
  ok('입력한 값이 그대로 저장됨 — ' + JSON.stringify(saved));
  await page.reload();
  await page.waitForSelector('#genBtn');
  if (await page.evaluate(() => Store.getLessons().length) !== saved.n) throw new Error('새로고침 후 유실됨');
  ok('새로고침 후에도 유지됨 (기존 저장 기능 정상)');

  console.log('\n[새 기능] 최근 수업 기록');
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#recentBox');

  // 동작 3 — 학생을 고르기 전 안내 문구
  const idle = await page.textContent('#recentBox');
  if (!idle.includes('학생을 선택하면')) throw new Error('선택 전 안내 문구가 없음: ' + idle);
  ok('학생 선택 전 안내 문구 표시');

  // 위치 — 저장 버튼 아래
  const order = await page.evaluate(() => {
    const btn = document.querySelector('#lessonForm button[type="submit"]');
    const box = document.querySelector('#recentBox');
    const head = [...document.querySelectorAll('.section-title')].find(h => h.textContent.includes('최근 수업 기록'));
    return { belowBtn: box.getBoundingClientRect().top > btn.getBoundingClientRect().bottom, hasHead: !!head };
  });
  if (!order.belowBtn) throw new Error('최근 기록 영역이 저장 버튼 아래에 있지 않음');
  if (!order.hasHead) throw new Error('"최근 수업 기록" 제목이 없음');
  ok('저장 버튼 아래에 "최근 수업 기록" 영역 위치');

  // 동작 1 — 학생 선택 시 5개 조회
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.waitForFunction(() => document.querySelectorAll('#recentBox .list__item').length > 0);
  const items = await page.$$('#recentBox .list__item');
  if (items.length !== 5) throw new Error('5개가 아님: ' + items.length);
  ok('학생 선택 시 최근 5개만 조회 (전체 8회 중)');

  // 동작 2 — 최신이 가장 위
  const dates = await page.$$eval('#recentBox .list__name', els => els.map(e => e.textContent.trim()));
  const nums = dates.map(d => d.replace(/[^0-9]/g,'').slice(0,8));
  const sorted = [...nums].sort().reverse();
  if (JSON.stringify(nums) !== JSON.stringify(sorted)) throw new Error('최신순이 아님: ' + JSON.stringify(dates));
  ok('최신순 정렬 — ' + JSON.stringify(dates));

  // 필요 데이터 5개 항목이 모두 보이는지
  const first = await page.textContent('#recentBox .list__item');
  for (const [label, val] of [['학생명','김민준'], ['진도','Lesson 8 본문 해석'], ['숙제','워크북 p.56~60'], ['메모','기말고사 대비 시작']]) {
    if (!first.includes(val)) throw new Error(label + ' 이(가) 보이지 않음: ' + first.replace(/\s+/g,' '));
  }
  if (!first.includes('2026년 9월 26일')) throw new Error('수업일이 보이지 않음');
  ok('학생명 · 수업일 · 진도 · 숙제 · 메모 모두 표시');

  // 빈 값은 줄을 만들지 않는지
  // 9월 23일 기록(Lesson 7)은 메모가 비어 있다 — 그 줄이 생기지 않아야 한다
  const noMemo = await page.$$eval('#recentBox .list__item', els => {
    const el = els.find(e => e.textContent.includes('9월 23일'));
    return el ? el.textContent : '';
  });
  if (!noMemo) throw new Error('9월 23일 기록을 찾지 못함');
  if (noMemo.includes('메모')) throw new Error('메모가 비었는데 줄이 생김: ' + noMemo.replace(/\s+/g,' '));
  if (!noMemo.includes('Lesson 7')) throw new Error('진도가 보이지 않음');
  ok('비어 있는 항목은 줄을 만들지 않음 (메모 없는 기록 확인)');

  // 동작 1 — 학생을 바꾸면 그 학생 것만
  await page.selectOption('select[name="studentId"]', { index: 2 });
  await page.waitForFunction(() => document.querySelectorAll('#recentBox .list__item').length === 1);
  const other = await page.textContent('#recentBox');
  if (other.includes('김민준')) throw new Error('다른 학생 기록이 섞임');
  if (!other.includes('이서연')) throw new Error('선택한 학생 기록이 없음');
  ok('학생을 바꾸면 그 학생 기록만 표시');

  // 동작 3 — 기록이 없는 학생
  await page.evaluate(() => Store.saveStudent({ name:'신규생', school:'정왕중', teacher:'김선생' }));
  await page.goto(base + '#/home');            // 같은 주소로 이동하면 화면이 다시 그려지지 않는다
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#recentBox');
  const idx = await page.$$eval('select[name="studentId"] option', els => els.findIndex(e => e.textContent.includes('신규생')));
  if (idx < 0) throw new Error('새 학생이 선택 목록에 없음');
  await page.selectOption('select[name="studentId"]', { index: idx });
  await page.waitForFunction(() => document.querySelector('#recentBox').textContent.includes('아직 없습니다'));
  const empty = await page.textContent('#recentBox');
  if (!empty.includes('신규생')) throw new Error('안내 문구에 학생 이름이 없음: ' + empty);
  ok('기록이 없으면 안내 문구 — "' + empty.trim().replace(/\s+/g,' ').slice(0,42) + '…"');

  // 수정 화면에서는 자기 자신을 빼고 보여 주는지
  const editId = await page.evaluate(() => Store.getLessons()[0].id);
  await page.goto(base + '#/lesson/' + editId + '/edit');
  await page.waitForSelector('#recentBox');
  const editList = await page.$$eval('#recentBox .list__name', els => els.map(e => e.textContent.trim()));
  if (editList.some(d => d.includes('9월 26일'))) throw new Error('수정 중인 기록이 목록에 그대로 있음: ' + JSON.stringify(editList));
  ok('수정 화면에서는 수정 중인 기록을 목록에서 제외');

  // 동작 4 — 저장 후 목록에 반영되는지 (기존 저장 기능 유지)
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#lessonForm');
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.waitForFunction(() => document.querySelectorAll('#recentBox .list__item').length === 5);
  await page.fill('input[name="date"]', '2026-09-30');
  await page.fill('textarea[name="progress"]', 'Lesson 9 본문 해석');
  await page.click('.level[data-code="good"]');
  await page.click('#lessonForm button[type="submit"]');
  await page.waitForSelector('#genBtn');
  await page.goto(base + '#/home');
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#recentBox');
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.waitForFunction(() => document.querySelector('#recentBox').textContent.includes('9월 30일'));
  const top = await page.textContent('#recentBox .list__item');
  if (!top.includes('Lesson 9')) throw new Error('새로 저장한 기록이 맨 위에 없음');
  ok('새로 저장한 기록이 곧바로 맨 위에 표시됨');

  // 가로 스크롤 없음
  for (const w of [320, 390]) {
    await page.setViewportSize({ width:w, height:800 });
    await page.goto(base + '#/lesson/new');
    await page.waitForSelector('#recentBox');
    await page.selectOption('select[name="studentId"]', { index: 1 });
    await page.waitForTimeout(150);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
      throw new Error(w + 'px 에서 가로 스크롤 발생');
  }
  ok('320 · 390px 에서 가로 스크롤 없음');

  await page.setViewportSize({ width:390, height:844 });
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#recentBox');
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: SP + '/recent.png', fullPage: true });

  await browser.close();
  if (errors.length) { console.log('\n⚠️ 브라우저 오류:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n════════ 최근 수업 기록 검사 ' + n + '건 전부 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
