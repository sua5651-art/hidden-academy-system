// playwright 는 전역/지역 어디에 설치돼 있어도 찾도록 한다
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
  // 아이폰 크기로 모바일 동작 확인
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const base = 'http://127.0.0.1:8899/index.html';
  let step = 0;
  const shot = async (name) => { await page.screenshot({ path: `${(process.env.SP || require('os').tmpdir())}/shot-${++step}-${name}.png`, fullPage: true }); };

  await page.goto(base + '#/home');
  await page.waitForSelector('.stats');
  console.log('✅ 홈 화면 렌더링');
  await shot('home-empty');

  // 탭은 5개이고 "기록" 탭은 없어야 한다
  const tabs = await page.$$eval('.tab', els => els.map(e => e.textContent.replace(/[^가-힣]/g, '')));
  if (tabs.length !== 5) throw new Error('탭 개수가 5개가 아님: ' + JSON.stringify(tabs));
  if (tabs.some(t => t === '기록')) throw new Error('기록 탭이 아직 남아 있음: ' + JSON.stringify(tabs));
  console.log('✅ 탭 5개 — ' + JSON.stringify(tabs));

  // 수업 기록 작성으로 가는 길이 홈에 있어야 한다
  const homeLink = await page.$('a[href="#/lesson/new"]');
  if (!homeLink) throw new Error('홈에 새 수업 기록 버튼이 없음');
  await homeLink.click();
  await page.waitForFunction(() => location.hash === '#/lesson/new');
  console.log('✅ 홈 버튼 → 수업 기록 작성 이동');

  // 그 화면에서 "피드백" 탭이 켜져 있어야 한다 (없어진 기록 탭 대신)
  const current = await page.$eval('.tab[aria-current="page"]', el => el.dataset.tab);
  if (current !== 'lessons') throw new Error('탭 표시가 잘못됨: ' + current);
  console.log('✅ 기록 작성 화면에서 피드백 탭이 켜짐');

  // 학생 추가
  await page.goto(base + '#/student/new');
  await page.waitForSelector('#stuForm');
  await page.fill('input[name="name"]', '김민준');
  await page.fill('input[name="school"]', '서해고');
  await page.fill('input[name="grade"]', '고2');
  await page.fill('input[name="className"]', '내신 A반');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.list__item');
  console.log('✅ 학생 추가 → 목록 반영');
  await shot('students');

  // 수업 기록 작성
  await page.goto(base + '#/lesson/new');
  await page.waitForSelector('#lessonForm');
  await page.selectOption('select[name="studentId"]', { index: 1 });
  await page.fill('input[name="teacher"]', '김선생');
  await page.fill('textarea[name="progress"]', '능률(김) 3과 본문 1~2문단 해석, 관계대명사 which 정리');
  await page.click('.level[data-code="good"]');
  await page.fill('textarea[name="understandingNote"]', 'which·that 구분을 두 번 틀림');
  await page.fill('textarea[name="improve"]', 'which와 that 구분 문제 10문항 추가 연습 필요');
  await page.fill('textarea[name="homework"]', '워크북 p.42~45, 단어 3과 1~40번 암기');
  await page.fill('textarea[name="memo"]', '다음 주 서해고 중간고사 범위 확인 부탁드립니다');
  await shot('lesson-form');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#genBtn');
  console.log('✅ 수업 기록 저장 → 피드백 화면 이동');

  // 피드백 생성
  await page.click('#genBtn');
  await page.waitForFunction(() => document.querySelector('#preview').textContent.includes('오늘 학습 내용'));
  const preview = await page.textContent('#preview');
  console.log('✅ 피드백 생성 버튼 동작');
  console.log('--- 화면에 나온 최종 문장 ---');
  console.log(preview);
  console.log('----------------------------');
  if (!preview.includes('워크북 p.42~45')) throw new Error('숙제 원문이 반영되지 않음');
  await shot('feedback-generated');

  // 문장 수정이 미리보기에 즉시 반영되는지
  await page.fill('textarea[data-sec="notice"]', '다음 주 서해고 중간고사 범위를 확인해 주세요.');
  await page.waitForFunction(() => document.querySelector('#preview').textContent.includes('확인해 주세요'));
  console.log('✅ 문장 수정 → 미리보기 실시간 반영');

  // 최종 확정
  await page.click('#finalBtn');
  await page.waitForSelector('#unlockBtn');
  const badge = await page.textContent('.badge--final');
  if (badge.trim() !== '확정') throw new Error('확정 배지가 표시되지 않음');
  const readonly = await page.getAttribute('textarea[data-sec="today"]', 'readonly');
  if (readonly === null) throw new Error('확정 후에도 편집이 가능함');
  console.log('✅ 최종 확정 → 잠금(읽기 전용) 적용');

  // 확정 후에도 입력칸이 내용 길이에 맞게 늘어나 글이 잘리지 않아야 한다
  const clipped = await page.$$eval('#editCard textarea', tas =>
    tas.filter(t => t.value.trim() && t.scrollHeight > t.clientHeight + 2).map(t => t.dataset.sec));
  if (clipped.length) throw new Error('확정 후 내용이 잘린 항목: ' + clipped.join(', '));
  console.log('✅ 확정 후에도 문장이 잘리지 않음');
  await shot('feedback-final');

  // 확정 후 목록 상태
  await page.goto(base + '#/lessons');
  await page.waitForSelector('.list__item');
  const listText = await page.textContent('.list');
  if (!listText.includes('확정')) throw new Error('목록에 확정 상태가 없음');
  if (!(await page.$('a[href="#/lesson/new"]'))) throw new Error('기록 목록에 작성 버튼이 없음');
  console.log('✅ 목록에 확정 상태 표시 + 작성 버튼 있음');
  await shot('lessons');

  // 잠금 해제
  await page.goto(base + '#/lessons');
  await page.click('.list__item');
  await page.waitForSelector('#unlockBtn');
  await page.click('#unlockBtn');
  await page.click('#confirmOk');
  await page.waitForSelector('#finalBtn');
  console.log('✅ 수정 잠금 해제 동작');

  // 새로고침 후에도 데이터가 남아 있는지
  await page.goto(base + '#/home');
  await page.reload();
  await page.waitForSelector('.stats');
  const stats = await page.textContent('.stats');
  if (!stats.includes('1')) throw new Error('새로고침 후 데이터 유실');
  console.log('✅ 새로고침 후에도 데이터 유지 (localStorage)');

  // 설정 화면
  await page.goto(base + '#/settings');
  await page.waitForSelector('#saveSettings');
  await page.fill('#newTeacher', '박선생');
  await page.click('#addTeacherBtn');
  await page.waitForSelector('.chip');
  console.log('✅ 설정 화면 · 교사 추가 동작');
  await shot('settings');

  // 넓은 화면(태블릿/PC)에서도 깨지지 않는지
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + '#/lessons');
  await page.waitForSelector('.list__item');
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (hScroll) throw new Error('가로 스크롤 발생');
  console.log('✅ PC 화면에서도 가로 스크롤 없음');

  await browser.close();
  if (errors.length) { console.log('\n⚠️ 브라우저 오류:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n════════ UI 검사 전부 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
