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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR: ' + e.message));
  const base = 'http://127.0.0.1:8899/index.html';

  // 데이터 미리 심어 두기 (앱 스크립트가 돌기 전에 주입)
  await ctx.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('hiddenAcademy.feedback.v1', JSON.stringify({
      schemaVersion: 1,
      settings: { academyName: '히든 아카데미', tone: 'default', engine: 'ai', signature: '',
                  ai: { model: 'claude-sonnet-5', apiKey: '', proxyUrl: 'http://127.0.0.1:8901/' } },
      teachers: ['김선생'],
      students: [{ id: 'stu_1', name: '김민준', school: '서해고', grade: '고2', className: '', parentContact: '', note: '', archived: false, createdAt: now, updatedAt: now }],
      lessons: [{ id: 'les_1', studentId: 'stu_1', studentName: '김민준', date: '2026-09-17', teacher: '김선생',
        input: { progress: '능률(김) 3과 본문 1~2문단 해석, 관계대명사 which 정리', understanding: 'good',
                 understandingNote: 'which·that 구분을 두 번 틀림', improve: 'which와 that 구분 문제 10문항 추가 연습 필요',
                 homework: '워크북 p.42~45, 단어 3과 1~40번 암기', memo: '다음 주 서해고 중간고사 범위 확인 부탁드립니다' },
        feedback: { status: 'draft', engine: '', sections: { today:'',state:'',improve:'',homework:'',notice:'' }, text: '', generatedAt: '', confirmedAt: '', warnings: [] },
        history: [], archived: false, createdAt: now, updatedAt: now }]
    }));
  });

  await page.goto(base + '#/feedback/les_1');
  await page.waitForSelector('#genBtn');
  await page.click('#genBtn');
  await page.waitForSelector('#warnArea .note--err', { timeout: 15000 });

  const err = await page.textContent('#warnArea .note--err');
  console.log('--- 🔴 빨간 경고 내용 ---\n' + err.trim() + '\n');
  if (!err.includes('95')) throw new Error('지어낸 점수(95)를 잡지 못함');
  if (!err.includes('Reading')) throw new Error('지어낸 교재명(Reading)을 잡지 못함');

  const warnEl = await page.$('#warnArea .note--warn');
  if (warnEl) console.log('--- 🟡 확인 요망 ---\n' + (await warnEl.textContent()).trim() + '\n');

  await page.screenshot({ path: (process.env.SP || require('os').tmpdir()) + '/shot-ai-warning.png', fullPage: true });

  // 경고가 있으면 확정 시 한 번 더 막는지
  await page.click('#finalBtn');
  await page.waitForSelector('#confirmModal:not([hidden])');
  const confirmText = await page.textContent('#confirmText');
  console.log('--- 확정 직전 재확인 창 ---\n' + confirmText.trim() + '\n');
  if (!confirmText.includes('입력에 없는 내용')) throw new Error('확정 직전 경고가 뜨지 않음');

  // 취소하면 확정되지 않아야 함
  await page.click('#confirmCancel');
  await page.waitForTimeout(300);
  const stillDraft = await page.$('#finalBtn');
  if (!stillDraft) throw new Error('취소했는데 확정되어 버림');
  console.log('✅ 취소 시 확정되지 않음 (안전 장치 정상)');

  await browser.close();
  console.log('════════ AI 사실검증 테스트 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
