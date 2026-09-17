// 월간 리포트 화면 흐름을 실제 브라우저로 확인한다
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
  const shot = async n => { await page.screenshot({ path:`${SP}/rp-${++step}-${n}.png`, fullPage:true }); };

  await page.goto(base);
  // 한 달치 기록을 미리 심는다 (화면 조작이 아니라 데이터 준비가 목적)
  const seeded = await page.evaluate(() => {
    const P = Store.monthRange(Store.thisMonth());
    const D = n => P.month + '-' + String(n).padStart(2,'0');
    const sid = Store.saveStudent({ name:'김민준', school:'정왕중', grade:'중3', className:'예비 고1반', teacher:'김선생' }).id;
    [[2,'Lesson 5 본문 해석, 관계대명사 which 정리','good','which·that 구분을 두 번 틀림','which와 that 구분 문제 추가 연습'],
     [5,'Lesson 5 본문 해석, 단어 5과 암기 테스트','good','','which와 that 구분 문제 추가 연습'],
     [9,'Lesson 5 본문 해석, 수동태 정리','excellent','',''],
     [12,'Lesson 6 본문 해석, 수동태 정리','average','수동태 시제 변환에서 실수','수동태 시제 변환 반복'],
     [16,'Lesson 6 본문 해석','needs_work','','수동태 시제 변환 반복'],
     [19,'Lesson 6 본문 해석, 단어 6과 암기 테스트','good','','']
    ].forEach(([d,prog,lv,note,imp]) => Store.saveLesson({ studentId:sid, date:D(d), teacher:'김선생',
      input:{progress:prog, understanding:lv, understandingNote:note, improve:imp, homework:'', memo:''}}));
    [[3,['워크북 p.42~45','단어 5과 암기'],[0]],
     [10,['워크북 p.46~50','단어 5과 암기'],[0,1]],
     [17,['워크북 p.51~55','오답노트 정리'],[0]]].forEach(([d,items,done]) => {
      const h = Store.saveHomework({ studentId:sid, date:D(d), dueDate:D(d+2), base:items, extra:[] });
      const rec = Store.getHomework(h.id);
      done.forEach(i => Store.setHomeworkItemDone(h.id,'base',rec.base[i].id,true));
    });
    Store.saveCounsel({ studentId:sid, date:D(14), counselor:'김선생', target:'parent', type:'grade',
      content:'중간고사 성적을 걱정하셨습니다.', parentRequest:'단어 시험을 매주 봐 주세요',
      academyReply:'금요일마다 단어 시험을 보기로 했습니다', nextCheckDate:D(28),
      followUp:{needed:true, text:'2주 뒤 단어 시험 결과 정리'} });
    return { sid, month: P.month };
  });
  console.log('✅ 한 달치 기록 준비 (수업 6 · 숙제 3 · 상담 1)');

  // 홈에서 리포트로
  await page.goto(base + '#/home');
  await page.waitForSelector('.stats');
  const homeLink = await page.$('a[href="#/reports"]');
  if (!homeLink) throw new Error('홈에 월간 리포트 버튼이 없음');
  await homeLink.click();
  await page.waitForSelector('#rptStudent');
  console.log('✅ 홈 → 월간 리포트 이동');

  // 만들기 화면 — 집계 미리보기
  await page.click('a[href^="#/report/new"]');
  await page.waitForSelector('#rptNewStudent');
  await page.selectOption('#rptNewStudent', { index: 1 });
  await page.waitForFunction(() => document.querySelector('#rptPreview').textContent.includes('수업 기록'));
  const preview = await page.textContent('#rptPreview');
  if (!/6[\s\S]*수업 기록/.test(preview)) throw new Error('집계 미리보기가 맞지 않음: ' + preview.replace(/\s+/g,' '));
  console.log('✅ 학생 선택 시 모을 기록을 미리 보여 줌');
  await shot('new');

  await page.click('#rptMakeBtn');
  await page.waitForSelector('#rptEditCard');
  console.log('✅ 초안 생성 → 상세 화면');

  // 6개 문단
  const secs = await page.$$eval('#rptEditCard textarea', els => els.map(e => e.dataset.sec));
  if (secs.length !== 6) throw new Error('문단이 6개가 아님: ' + JSON.stringify(secs));
  console.log('✅ 문단 ' + secs.length + '개 — ' + JSON.stringify(secs));

  const text = await page.textContent('#rptPreviewBox');
  console.log('--- 생성된 리포트 ---\n' + text + '\n---------------------');
  for (const must of ['■ 이번 달 학습 내용','■ 잘한 점','■ 보완할 점','■ 학습 습관 · 숙제','■ 상담 · 특이사항','■ 다음 달 목표']) {
    if (!text.includes(must)) throw new Error('"' + must + '" 문단 없음');
  }
  // 규칙 1 — 같은 문장이 두 번 나오지 않아야 한다
  const lines = text.split('\n').map(l=>l.trim().replace(/^·\s*/,''))
    .filter(l=>l && !l.startsWith('■') && !l.startsWith('[') && !l.startsWith('-'));
  const norm = lines.map(l => l.replace(/\s+/g,''));
  const dup = norm.filter((k,i)=>norm.indexOf(k)!==i);
  if (dup.length) throw new Error('같은 문장이 반복됨: ' + JSON.stringify(dup));
  console.log('✅ 규칙 1 — 같은 문장 반복 없음 (' + lines.length + '줄)');
  if ((text.match(/Lesson 5 본문 해석/g)||[]).length !== 1) throw new Error('반복 진도가 묶이지 않음');
  if (!text.includes('(3회)')) throw new Error('반복 횟수 표시가 없음');
  console.log('✅ 반복된 진도는 한 줄 + 횟수 표시');

  // 규칙 2·3 — 경고 없음
  if (await page.$('#rptWarnArea .note--err')) throw new Error('정상 리포트인데 오류 경고가 떴음');
  if (await page.$('#rptWarnArea .note--warn')) {
    throw new Error('경고: ' + (await page.textContent('#rptWarnArea .note--warn')));
  }
  console.log('✅ 규칙 2·3 — 없는 내용 / 과장 표현 경고 없음');

  // 집계 근거와 기간이 함께 보이는지 (규칙 5)
  const basis = await page.textContent('.card');
  if (!basis.includes(seeded.month + '-01')) throw new Error('기간이 표시되지 않음: ' + basis);
  if (!basis.includes('6회')) throw new Error('수업 건수가 표시되지 않음');
  console.log('✅ 집계 근거(기간·건수) 함께 표시');
  await shot('detail');

  // 규칙 4 — 교사가 수정
  const ta = await page.$('#rptEditCard textarea[data-sec="goal"]');
  await ta.fill('· 겨울방학 전까지 Lesson 7 예습');
  await page.waitForFunction(() => document.querySelector('#rptPreviewBox').textContent.includes('겨울방학'));
  await page.click('#rptSaveBtn');
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('#rptEditCard');
  const savedGoal = await page.inputValue('#rptEditCard textarea[data-sec="goal"]');
  if (!savedGoal.includes('겨울방학')) throw new Error('수정 내용이 저장되지 않음: ' + savedGoal);
  console.log('✅ 규칙 4 — 교사 수정 내용이 저장됨');

  // 확정 → 선생님이 직접 쓴 내용은 기록에 없으므로 한 번 확인을 받는다
  await page.click('#rptFinalBtn');
  await page.waitForSelector('#confirmModal:not([hidden])');
  const confirmText = await page.textContent('#confirmText');
  if (!confirmText.includes('기록에 없는 내용')) throw new Error('확인 창 문구가 다름: ' + confirmText);
  console.log('✅ 규칙 2 — 기록에 없는 문장은 확정 전 확인을 받음');
  await page.click('#confirmCancel');
  await page.waitForTimeout(200);
  if (!(await page.$('#rptFinalBtn'))) throw new Error('취소했는데 확정되어 버림');
  console.log('✅ 취소하면 확정되지 않음');

  // 확정 → 잠금
  await page.click('#rptFinalBtn');
  await page.waitForSelector('#confirmModal:not([hidden])');
  await page.click('#confirmOk');
  await page.waitForSelector('#rptUnlockBtn');
  const ro = await page.getAttribute('#rptEditCard textarea[data-sec="goal"]', 'readonly');
  if (ro === null) throw new Error('확정 후에도 편집 가능');
  console.log('✅ 최종 확정 → 읽기 전용 잠금');

  await page.click('#rptUnlockBtn');
  await page.click('#confirmOk');
  await page.waitForSelector('#rptFinalBtn');
  console.log('✅ 잠금 해제 동작');

  // 목록
  await page.goto(base + '#/reports');
  await page.waitForSelector('.list__item');
  const listText = await page.textContent('.list');
  if (!listText.includes('수업 6회')) throw new Error('목록에 집계 건수가 없음: ' + listText);
  console.log('✅ 목록에 기간과 집계 건수 표시');
  await shot('list');

  // 탭 5개 유지
  const tabs = await page.$$eval('.tab', els => els.map(e => e.textContent.replace(/[^가-힣]/g,'')));
  if (JSON.stringify(tabs) !== JSON.stringify(['홈','학생','수업','숙제','설정'])) {
    throw new Error('탭 구성이 바뀜: ' + JSON.stringify(tabs));
  }
  console.log('✅ 탭은 5개 그대로 — ' + JSON.stringify(tabs));

  for (const w of [320, 390]) {
    await page.setViewportSize({ width:w, height:800 });
    await page.goto(base + '#/reports');
    await page.waitForSelector('.tabbar');
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
      throw new Error(w + 'px 에서 가로 스크롤 발생');
  }
  console.log('✅ 320px 좁은 화면에서도 가로 스크롤 없음');

  await browser.close();
  if (errors.length) { console.log('\n⚠️ 브라우저 오류:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n════════ 리포트 화면 검사 전부 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
