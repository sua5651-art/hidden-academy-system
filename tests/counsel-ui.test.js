// 상담 기록 화면 전체 흐름을 실제 브라우저로 확인한다
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
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: ' + m.text()); });

  const base = 'http://127.0.0.1:8899/index.html';
  const SP = process.env.SP || require('os').tmpdir();
  let step = 0;
  const shot = async n => { await page.screenshot({ path:`${SP}/cns-${++step}-${n}.png`, fullPage:true }); };

  // 학생 등록
  await page.goto(base + '#/student/new');
  await page.waitForSelector('#stuForm');
  await page.fill('input[name="name"]', '김민준');
  await page.fill('input[name="className"]', '내신 A반');
  await page.fill('input[name="teacher"]', '김선생');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.list__item');
  console.log('✅ 학생 등록');

  // 학생 화면에서 상담으로 들어가는 길
  await page.click('.list__item');
  await page.waitForSelector('a[href^="#/counsel/new"]');
  await page.click('a[href^="#/counsel/new"]');
  await page.waitForSelector('#cnsForm');
  const preset = await page.inputValue('#cnsStudentSel');
  if (!preset) throw new Error('학생이 미리 선택되지 않음');
  const counselor = await page.inputValue('#cnsCounselor');
  if (counselor !== '김선생') throw new Error('담당 교사 자동 입력 실패: ' + counselor);
  console.log('✅ 학생 화면 → 상담 작성 (학생·교사 자동 입력)');

  // 9개 입력 항목 채우기
  await page.selectOption('select[name="target"]', 'parent');
  await page.selectOption('select[name="type"]', 'grade');
  await page.fill('textarea[name="content"]',
    '2학기 중간고사 영어 성적이 3등급으로 한 등급 떨어졌다고 걱정하셨습니다.\n' +
    '수업 시간에는 잘 따라오고 있으나 단어 암기량이 부족한 편이라고 말씀드렸습니다.\n' +
    '집에서 영어 공부 시간을 거의 갖지 않는다고 하셨습니다.\n' +
    '주 2회 수업 외에 단어 테스트를 추가하는 방안을 제안드렸습니다.');
  await page.fill('textarea[name="parentRequest"]', '단어 시험을 매주 봐 주셨으면 합니다');
  await page.fill('textarea[name="academyReply"]', '다음 주부터 매주 금요일 단어 시험을 진행하기로 안내드렸습니다');
  await page.check('#fuNeeded');
  await page.waitForSelector('#fuBox:not([hidden])');
  await page.fill('textarea[name="followUpText"]', '2주 뒤 단어 시험 결과 정리해서 다시 연락');
  const due = await page.evaluate(() => Store.dayOffset(2));
  await page.fill('input[name="nextCheckDate"]', due);
  await shot('form');
  await page.click('#cnsForm button[type="submit"]');
  await page.waitForSelector('#cnsGenBtn');
  console.log('✅ 상담 기록 저장 → 상세 화면');

  // 기능 3 — 요약 만들기
  await page.click('#cnsGenBtn');
  await page.waitForFunction(() => document.querySelector('#cnsSummary').value.includes('학부모 요청'));
  const summary = await page.inputValue('#cnsSummary');
  const lines = summary.split('\n').filter(Boolean);
  console.log('--- 생성된 요약 ---\n' + summary + '\n-------------------');
  if (lines.length < 3 || lines.length > 5) throw new Error('요약이 3~5줄이 아님: ' + lines.length);
  if (await page.$('#cnsWarnArea .note--err')) throw new Error('정상 요약인데 경고가 떴음');
  console.log('✅ 기능 3 — ' + lines.length + '줄 요약 생성 (경고 없음)');

  // 원문이 그대로인지
  const raw = await page.textContent('.fb-preview');
  if (!raw.includes('2학기 중간고사 영어 성적')) throw new Error('원문이 보이지 않음');
  console.log('✅ 원문과 요약이 따로 보관됨');
  await shot('detail');

  // 기능 4 — 후속조치 표시 + 완료
  const badges = await page.textContent('.card');
  if (!badges.includes('후속조치 필요')) throw new Error('후속조치 배지가 없음');
  await page.click('#fuDoneBtn');
  await page.waitForSelector('#fuUndoBtn');
  console.log('✅ 기능 4 — 후속조치 표시 · 완료 처리');
  await page.click('#fuUndoBtn');
  await page.waitForSelector('#fuDoneBtn');

  // 기능 6 — 수정 시 수정일 기록
  await page.click('a[href$="/edit"]');
  await page.waitForSelector('#cnsForm');
  await page.fill('textarea[name="academyReply"]', '매주 금요일 단어 시험 + 오답 정리까지 진행하기로 안내드렸습니다');
  await page.click('#cnsForm button[type="submit"]');
  await page.waitForSelector('#cnsGenBtn');
  const historyText = await page.textContent('.card:last-of-type');
  if (!historyText.includes('학원 답변')) throw new Error('수정 이력에 항목이 없음: ' + historyText);
  if (historyText.includes('수정한 적 없음')) throw new Error('마지막 수정일이 기록되지 않음');
  console.log('✅ 기능 6 — 수정 이력에 날짜와 바뀐 항목 기록');

  // 기능 5 — 홈 대시보드 알림
  await page.goto(base + '#/home');
  await page.waitForSelector('.stats');
  const home = await page.textContent('#view');
  if (!home.includes('곧 확인할 상담')) throw new Error('홈에 확인일 알림이 없음');
  if (!home.includes('D-2')) throw new Error('D-day 표시가 없음: ' + home.slice(0,300));
  console.log('✅ 기능 5 — 홈 대시보드에 확인일 알림 (D-2)');
  await shot('home');

  // 기능 1·2 — 학생별 조회 / 최신순
  await page.goto(base + '#/counsel/new');
  await page.waitForSelector('#cnsForm');
  await page.selectOption('#cnsStudentSel', { index: 1 });
  await page.fill('textarea[name="content"]', '지난달 정기 상담 내용입니다.');
  const past = await page.evaluate(() => Store.dayOffset(-30));
  await page.fill('input[name="date"]', past);
  await page.click('#cnsForm button[type="submit"]');
  await page.waitForSelector('#cnsGenBtn');

  await page.goto(base + '#/counsels');
  await page.waitForSelector('.list__item');
  const order = await page.$$eval('.list__item .list__meta', els => els.map(e => e.textContent.split(' · ')[0]));
  if (!(order[0] > order[1])) throw new Error('최신순 정렬이 아님: ' + JSON.stringify(order));
  console.log('✅ 기능 1·2 — 상담 목록 최신순: ' + JSON.stringify(order));
  await shot('list');

  // 후속조치 필터
  await page.click('#cnsFollowBtn');
  await page.waitForTimeout(200);
  const filtered = await page.$$('.list__item');
  if (filtered.length !== 1) throw new Error('후속조치 필터가 동작하지 않음: ' + filtered.length);
  console.log('✅ 후속조치 필요만 보기 필터 동작');

  // 탭은 여전히 5개
  const tabs = await page.$$eval('.tab', els => els.map(e => e.textContent.replace(/[^가-힣]/g,'')));
  if (JSON.stringify(tabs) !== JSON.stringify(['홈','학생','수업','숙제','설정'])) {
    throw new Error('탭 구성이 바뀜: ' + JSON.stringify(tabs));
  }
  console.log('✅ 탭은 5개 그대로 — ' + JSON.stringify(tabs));

  // 좁은 화면에서 가로 스크롤 없음
  for (const w of [320, 390]) {
    await page.setViewportSize({ width:w, height:800 });
    await page.goto(base + '#/counsels');
    await page.waitForSelector('.tabbar');
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
      throw new Error(w + 'px 에서 가로 스크롤 발생');
  }
  console.log('✅ 320px 좁은 화면에서도 가로 스크롤 없음');

  await browser.close();
  if (errors.length) { console.log('\n⚠️ 브라우저 오류:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n════════ 상담 화면 검사 전부 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
