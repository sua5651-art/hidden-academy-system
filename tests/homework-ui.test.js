// 숙제 관리 화면 전체 흐름을 실제 브라우저로 확인한다
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const base = 'http://127.0.0.1:8899/index.html';
  const SP = process.env.SP || require('os').tmpdir();
  let step = 0;
  const shot = async n => { await page.screenshot({ path: `${SP}/hw-${++step}-${n}.png`, fullPage: true }); };

  // 학생 등록 (반/레벨 · 담당교사)
  await page.goto(base + '#/student/new');
  await page.waitForSelector('#stuForm');
  await page.fill('input[name="name"]', '김민준');
  await page.fill('input[name="school"]', '서해고');
  await page.fill('input[name="grade"]', '고2');
  await page.fill('input[name="className"]', '내신 A반');
  await page.fill('input[name="teacher"]', '김선생');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.list__item');
  console.log('✅ 학생 등록 (반/레벨 · 담당교사)');

  // 기본 숙제 등록
  await page.click('.list__item');
  await page.waitForSelector('#defList');
  const defInputs = () => page.$$('#defList .hw-edit input');
  await (await defInputs())[0].fill('워크북 p.42~45');
  await page.click('#addDef');
  await (await defInputs())[1].fill('단어 3과 1~40번 암기');
  await page.click('#saveDef');
  await page.waitForTimeout(300);
  console.log('✅ 학생별 기본 숙제 등록');
  await shot('student-default');

  // 숙제 배정 — 학생 선택 시 기본 숙제가 자동으로 들어오는지
  await page.goto(base + '#/homework/new');
  await page.waitForSelector('#hwForm');
  await page.selectOption('#hwStudentSel', { index: 1 });
  await page.waitForFunction(() => document.querySelectorAll('#baseList .hw-edit').length === 2);
  const autoBase = await page.$$eval('#baseList .hw-edit input', els => els.map(e => e.value));
  if (autoBase[0] !== '워크북 p.42~45') throw new Error('기본 숙제가 자동으로 안 들어옴: ' + JSON.stringify(autoBase));
  console.log('✅ 기능 1 — 학생 선택 시 기본 숙제 자동 표시: ' + JSON.stringify(autoBase));

  const cls = await page.inputValue('#hwClass');
  const tch = await page.inputValue('#hwTeacher');
  if (cls !== '내신 A반' || tch !== '김선생') throw new Error('반/담당교사 자동 입력 실패');
  console.log('✅ 반/레벨 · 담당교사도 자동 입력');

  // 기본 숙제 수정 + 당일 추가 숙제 입력
  await (await page.$$('#baseList .hw-edit input'))[0].fill('워크북 p.42~50');
  await page.click('#addExtra');
  const extras = await page.$$('#extraList .hw-edit input');
  await extras[0].fill('서술형 대비 문제 5번~8번');
  await page.fill('input[name="dueDate"]', '2026-09-19');
  console.log('✅ 기능 2·3 — 기본 숙제 수정 + 당일 추가 숙제 입력');
  await shot('assign-form');

  await page.click('#hwForm button[type="submit"]');
  await page.waitForSelector('#hwGenBtn');
  console.log('✅ 기능 4 — 저장 → 상세 화면 이동');

  // 기본 숙제 마스터는 안 바뀌었는지 (체크 안 했으므로)
  const master = await page.evaluate(() => Store.getDefaultHomework(Store.getStudents()[0].id).map(i => i.text));
  if (master[0] !== '워크북 p.42~45') throw new Error('체크 안 했는데 기본 숙제가 바뀜: ' + JSON.stringify(master));
  console.log('✅ 체크 안 하면 학생의 기본 숙제는 그대로 유지: ' + JSON.stringify(master));

  // 완료 체크
  const boxes = await page.$$('.hw-item__check');
  if (boxes.length !== 3) throw new Error('숙제 항목 수가 3개가 아님: ' + boxes.length);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await boxes[0].click();
  await page.waitForFunction(() => document.querySelector('#hwProgressBar').style.width !== '0%');
  const prog = await page.textContent('#hwProgressText');
  const scrollAfter = await page.evaluate(() => window.scrollY);
  if (Math.abs(scrollAfter - scrollBefore) > 5) throw new Error('체크 후 화면이 위로 튐');
  const struck = await page.$eval('.hw-item__text', el => el.classList.contains('done'));
  if (!struck) throw new Error('완료 표시(취소선)가 적용되지 않음');
  console.log('✅ 완료 여부 체크 — ' + prog.trim() + ' (보던 위치 유지)');

  // 교사 확인
  await page.fill('#checkNote', '단어 암기 상태 확인함');
  await page.click('#checkBtn');
  await page.waitForSelector('#uncheckBtn');
  console.log('✅ 교사 확인 기록');

  // 학부모 전송 문장
  await page.click('#hwGenBtn');
  await page.waitForFunction(() => document.querySelector('#hwMessage').textContent.includes('기본 숙제'));
  const msg = await page.textContent('#hwMessage');
  console.log('--- 생성된 학부모 전송 문장 ---\n' + msg + '\n-------------------------------');
  for (const must of ['■ 기본 숙제', '■ 오늘 추가 숙제', '■ 제출 예정일', '■ 교사 확인', '워크북 p.42~50', '서술형 대비 문제 5번~8번']) {
    if (!msg.includes(must)) throw new Error('문장에 "' + must + '" 없음');
  }
  const warn = await page.$('#hwWarnArea .note--err');
  if (warn) throw new Error('정상 문장인데 경고가 떴음: ' + (await warn.textContent()));
  console.log('✅ 기능 6 — 학부모 문장 생성 (경고 없음)');
  await shot('detail');

  // 최근 기록 확인
  await page.goto(base + '#/homeworks');
  await page.waitForSelector('.list__item');
  const listText = await page.textContent('.list');
  if (!listText.includes('김민준') || !listText.includes('교사확인')) throw new Error('목록에 기록/상태가 안 보임');
  console.log('✅ 기능 5 — 최근 숙제 기록 목록 확인');
  await shot('list');

  // 새로고침 후에도 유지
  await page.reload();
  await page.waitForSelector('.list__item');
  console.log('✅ 새로고침 후에도 데이터 유지');

  // 기존 기능이 그대로인지
  await page.goto(base + '#/lessons');
  await page.waitForSelector('.filters');
  await page.goto(base + '#/settings');
  await page.waitForSelector('#saveSettings');
  console.log('✅ 기존 수업 기록·설정 화면 정상');

  // 가로 스크롤 없음 (탭 6개)
  for (const w of [320, 390, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(base + '#/homeworks');
    await page.waitForSelector('.tabbar');
    const h = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (h) throw new Error(w + 'px 에서 가로 스크롤 발생');
  }
  console.log('✅ 320px 좁은 화면에서도 탭 6개가 넘치지 않음');

  await browser.close();
  if (errors.length) { console.log('\n⚠️ 브라우저 오류:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n════════ 숙제 화면 검사 전부 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
