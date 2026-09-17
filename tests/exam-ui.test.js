// 내신 관리 화면 전체 흐름을 실제 브라우저로 확인한다
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
  page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: ' + m.text()); });

  const base = 'http://127.0.0.1:8899/index.html';
  const SP = process.env.SP || require('os').tmpdir();
  let step = 0;
  const shot = async n => { await page.screenshot({ path:`${SP}/ex-${++step}-${n}.png`, fullPage:true }); };

  // 학생 3명 (정왕중 중3 둘, 중2 하나)
  for (const [name, grade] of [['김민준','중3'], ['이서연','중3'], ['박지후','중2']]) {
    await page.goto(base + '#/student/new');
    await page.waitForSelector('#stuForm');
    await page.fill('input[name="name"]', name);
    await page.fill('input[name="school"]', '정왕중');
    await page.fill('input[name="grade"]', grade);
    await page.fill('input[name="teacher"]', '김선생');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.list__item');
  }
  console.log('✅ 학생 3명 등록 (정왕중 중3 2명 · 중2 1명)');

  // 시험 정보 등록
  await page.goto(base + '#/exam/new');
  await page.waitForSelector('#examForm');
  await page.fill('#exSchool', '정왕중');
  await page.waitForFunction(() => document.querySelector('#matchNote').textContent.includes('3명'));
  console.log('✅ 학교만 넣으면 연결 대상 3명으로 안내');
  await page.fill('#exGrade', '중3');
  await page.waitForFunction(() => document.querySelector('#matchNote').textContent.includes('2명'));
  console.log('✅ 학년까지 넣으면 2명으로 좁혀짐 (연결 미리 확인)');

  await page.fill('input[name="term"]', '2학기 중간고사');
  await page.fill('input[name="textbook"]', '천재(이재영)');
  const examDate = await page.evaluate(() => Store.dayOffset(9));
  await page.fill('input[name="examDate"]', examDate);
  let units = await page.$$('#unitList .hw-edit input');
  await units[0].fill('Lesson 5');
  await page.click('#addUnit');
  units = await page.$$('#unitList .hw-edit input');
  await units[1].fill('Lesson 6');
  await page.fill('textarea[name="rangeNote"]', '교과서 본문 + 워크북, 부교재 3~4과');
  let gr = await page.$$('#grammarList .hw-edit input');
  await gr[0].fill('관계대명사 which/that');
  await page.click('#addGrammar');
  gr = await page.$$('#grammarList .hw-edit input');
  await gr[1].fill('수동태');
  await page.fill('textarea[name="performance"]', '서술형 30% · 본문 요약 쓰기 수행평가');
  await shot('exam-form');
  await page.click('#examForm button[type="submit"]');
  await page.waitForSelector('.list__item');
  console.log('✅ 기능 1 — 시험 정보 등록 → 학생 자동 연결');
  await shot('exam-detail');

  // 연결된 학생 확인
  const names = await page.$$eval('.list__name', els => els.map(e => e.textContent));
  if (names.length !== 2) throw new Error('연결 학생이 2명이 아님: ' + JSON.stringify(names));
  if (names.includes('박지후')) throw new Error('다른 학년이 섞임');
  console.log('✅ 연결된 학생만 표시 — ' + JSON.stringify(names));

  // D-day 표시 (기능 3)
  const detail = await page.textContent('#view');
  if (!detail.includes('D-9')) throw new Error('D-day 표시가 없음');
  console.log('✅ 기능 3 — 시험일까지 남은 기간 D-9 표시');

  // 학생 준비 상태 체크 (기능 2)
  await page.click('.list__item');
  await page.waitForSelector('#prepForm');
  await page.fill('input[name="targetScore"]', '95');
  // Lesson 5 : 단원 준비 완료 / 본문 암기 완료,  Lesson 6 : 진행중 / 시작 전
  const segs = await page.$$('.seg');
  if (segs.length !== 4) throw new Error('상태 선택 묶음이 4개가 아님: ' + segs.length);
  await segs[0].locator ? null : null;
  await (await segs[0].$$('.seg__btn'))[2].click();   // L5 준비 완료
  await (await segs[1].$$('.seg__btn'))[2].click();   // L5 암기 완료
  await (await segs[2].$$('.seg__btn'))[1].click();   // L6 준비 진행중
  await page.click('.grammar-chip');                  // 취약 문법 1개
  await page.fill('textarea[name="weakGrammarNote"]', '관계대명사 what 용법');
  await page.fill('input[name="wrongCount"]', '12');
  await page.check('#needsExtra');
  await page.waitForSelector('#extraBox:not([hidden])');
  await page.fill('textarea[name="extraNote"]', '주말 보강 1회 — 관계대명사 집중');
  await shot('prep-form');
  await page.click('#prepForm button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#prepText').textContent.includes('2/4'));
  const prog = await page.textContent('#prepText');
  console.log('✅ 기능 2 — 준비 상태 저장: ' + prog.trim());

  // 기능 4 — 미완료 강조
  const pendingRows = await page.$$('.unit-row--pending');
  if (pendingRows.length !== 1) throw new Error('미완료 강조가 1개가 아님: ' + pendingRows.length);
  const pendingName = await pendingRows[0].textContent();
  if (!pendingName.includes('Lesson 6')) throw new Error('강조된 단원이 틀림: ' + pendingName);
  console.log('✅ 기능 4 — 미완료 단원(Lesson 6)만 강조 표시');

  // 기능 5 — 체크리스트
  await page.click('#checklistBtn');
  await page.waitForFunction(() => document.querySelector('#checklistBox').textContent.includes('아직 남은'));
  const list = await page.textContent('#checklistBox');
  console.log('--- 생성된 체크리스트 ---\n' + list + '\n-------------------------');
  for (const must of ['D-9', '목표 점수 95점', '준비 2/4', 'Lesson 6 (진행중)', 'Lesson 6 (시작 전)',
                      '관계대명사 which/that', '오답 12문항', '주말 보강 1회', '서술형 30%']) {
    if (!list.includes(must)) throw new Error('체크리스트에 "' + must + '" 없음');
  }
  if (list.includes('Lesson 5 (완료)')) throw new Error('끝낸 항목이 남은 목록에 들어감');
  if (await page.$('#prepWarnArea .note--err')) throw new Error('정상 체크리스트인데 경고가 떴음');
  console.log('✅ 기능 5 — 최종 체크리스트 생성 (남은 항목만, 경고 없음)');
  await shot('checklist');

  // 학교 공통 정보를 고쳐도 학생 기록은 그대로
  await page.goto(base + '#/exams');
  await page.waitForSelector('.list__item');
  await page.click('.list__item');
  await page.waitForSelector('a[href$="/edit"]');
  await page.click('a[href$="/edit"]');
  await page.waitForSelector('#examForm');
  const newDate = await page.evaluate(() => Store.dayOffset(14));
  await page.fill('input[name="examDate"]', newDate);
  await page.click('#examForm button[type="submit"]');
  await page.waitForSelector('.list__item');
  const afterEdit = await page.textContent('#view');
  if (!afterEdit.includes('D-14')) throw new Error('시험일 변경이 반영되지 않음');
  const kept = await page.evaluate(() => {
    const ex = Store.getExams()[0];
    const st = Store.getExamStudents(ex.id)[0];
    return Store.getPrep(ex.id, st.id).wrongCount;
  });
  if (kept !== 12) throw new Error('시험 정보를 고쳤더니 학생 기록이 사라짐: ' + kept);
  console.log('✅ 학교 공통 정보만 바뀌고 학생 준비 기록은 그대로 (오답 ' + kept + '문항 유지)');

  // 홈 카드
  await page.goto(base + '#/home');
  await page.waitForSelector('.stats');
  const home = await page.textContent('#view');
  if (!home.includes('시험 대비')) throw new Error('홈에 시험 대비 카드가 없음');
  if (!home.includes('D-14')) throw new Error('홈에 D-day가 없음');
  console.log('✅ 홈 화면 시험 대비 카드에 D-14 표시');
  await shot('home');

  // 탭은 여전히 5개
  const tabs = await page.$$eval('.tab', els => els.map(e => e.textContent.replace(/[^가-힣]/g,'')));
  if (JSON.stringify(tabs) !== JSON.stringify(['홈','학생','수업','숙제','설정'])) {
    throw new Error('탭 구성이 바뀜: ' + JSON.stringify(tabs));
  }
  console.log('✅ 탭은 5개 그대로 — ' + JSON.stringify(tabs));

  for (const w of [320, 390]) {
    await page.setViewportSize({ width:w, height:800 });
    await page.goto(base + '#/exams');
    await page.waitForSelector('.tabbar');
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
      throw new Error(w + 'px 에서 가로 스크롤 발생');
  }
  console.log('✅ 320px 좁은 화면에서도 가로 스크롤 없음');

  await browser.close();
  if (errors.length) { console.log('\n⚠️ 브라우저 오류:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n════════ 내신 화면 검사 전부 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
