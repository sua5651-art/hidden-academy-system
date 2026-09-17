// 디자인 요구사항이 지켜지는지 실제 브라우저에서 확인한다
function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(p); } catch (e) {}
  }
  console.error('playwright 가 필요합니다:  npm i -D playwright');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const NAVY = ['rgb(20, 49, 92)', 'rgb(11, 31, 61)'];   // --navy / --navy-dark

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  const base = 'http://127.0.0.1:8899/index.html';
  const SP = process.env.SP || require('os').tmpdir();
  let ok = 0;
  const pass = m => { ok++; console.log('  ✅ ' + m); };

  // 데이터를 심어 모든 화면에 내용이 있게 한다
  await page.goto(base);
  await page.evaluate(() => {
    const M = Store.monthRange(Store.thisMonth());
    const d = n => M.month + '-' + String(n).padStart(2,'0');
    const sid = Store.saveStudent({ name:'김민준', school:'정왕중', grade:'중3', className:'예비 고1반', teacher:'김선생' }).id;
    Store.setDefaultHomework(sid, ['워크북 p.42~45','단어 5과 암기']);
    Store.saveLesson({ studentId:sid, date:d(5), teacher:'김선생',
      input:{progress:'Lesson 5 본문 해석, 관계대명사 정리', understanding:'good',
             understandingNote:'which·that 구분 실수', improve:'구분 문제 연습', homework:'', memo:''}});
    const h = Store.saveHomework({ studentId:sid, date:d(6), dueDate:d(8), base:['워크북 p.42~45'], extra:['오답노트'] });
    Store.setHomeworkItemDone(h.id,'base',Store.getHomework(h.id).base[0].id,true);
    Store.saveCounsel({ studentId:sid, date:d(7), counselor:'김선생', target:'parent', type:'grade',
      content:'성적 이야기를 나눴습니다.', parentRequest:'단어 시험 요청', academyReply:'금요일 시험',
      nextCheckDate:d(20), followUp:{needed:true,text:'2주 뒤 확인'} });
    const ex = Store.saveExam({ school:'정왕중', grade:'중3', term:'2학기 중간고사',
      textbook:'천재(이재영)', examDate: Store.dayOffset(9),
      units:['Lesson 5','Lesson 6'], grammarPoints:['관계대명사','수동태'], performance:'서술형 30%' });
    Store.savePrep({ examId:ex.id, studentId:sid, targetScore:95,
      units:{}, memorize:{}, weakGrammar:[], wrongCount:3, needsExtra:true, extraNote:'주말 보강' });
    const stu = Store.getStudent(sid);
    const res = ReportEngine.generate(stu, M, Store.getSettings());
    Store.saveReport({ studentId:sid, period:M, source:res.source, stats:res.stats,
      sections:res.sections, text:res.text, status:'generated' });
    return true;
  });

  const exam = await page.evaluate(() => Store.getExams()[0].id);
  const stu  = await page.evaluate(() => Store.getStudents()[0].id);
  const SCREENS = [
    ['#/home','홈'], ['#/students','학생 목록'], ['#/student/'+stu,'학생 상세'],
    ['#/lessons','수업 목록'], ['#/lesson/new','수업 기록 작성'],
    ['#/homeworks','숙제 목록'], ['#/homework/new','숙제 배정'],
    ['#/counsels','상담 목록'], ['#/counsel/new','상담 작성'],
    ['#/exams','내신 목록'], ['#/exam/new','시험 정보 등록'], ['#/exam/'+exam,'시험 상세'],
    ['#/prep/'+exam+'/'+stu,'학생 준비 상태'],
    ['#/reports','리포트 목록'], ['#/report/new','리포트 만들기'],
    ['#/settings','설정']
  ];

  console.log('\n[요구사항 1] 전체 배경은 흰색');
  await page.goto(base + '#/home');
  await page.waitForSelector('.stats');
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (bodyBg !== 'rgb(255, 255, 255)') throw new Error('본문 배경이 흰색이 아님: ' + bodyBg);
  pass('body 배경 ' + bodyBg);
  const cardBg = await page.evaluate(() => getComputedStyle(document.querySelector('.card, .stat')).backgroundColor);
  if (cardBg !== 'rgb(255, 255, 255)') throw new Error('카드 배경이 흰색이 아님: ' + cardBg);
  pass('카드 배경 ' + cardBg);

  console.log('\n[요구사항 2] 포인트 컬러는 진한 네이비');
  const appbarBg = await page.evaluate(() => getComputedStyle(document.querySelector('.appbar')).backgroundColor);
  if (!NAVY.includes(appbarBg)) throw new Error('상단 바가 네이비가 아님: ' + appbarBg);
  pass('상단 바 ' + appbarBg);
  const btnBg = await page.evaluate(() => getComputedStyle(document.querySelector('.btn:not(.btn--ghost)')).backgroundColor);
  if (!NAVY.includes(btnBg)) throw new Error('주요 버튼이 네이비가 아님: ' + btnBg);
  pass('주요 버튼 ' + btnBg);
  const tabOn = await page.evaluate(() => getComputedStyle(document.querySelector('.tab[aria-current="page"]')).color);
  if (!NAVY.includes(tabOn)) throw new Error('선택된 탭이 네이비가 아님: ' + tabOn);
  pass('선택된 탭 ' + tabOn);

  console.log('\n[요구사항 3] 입력 필드는 세로 한 열');
  for (const [hash, name] of SCREENS) {
    await page.goto(base + hash);
    await page.waitForTimeout(120);
    const side = await page.evaluate(() => {
      // 입력 요소들의 가로 위치가 겹치면 같은 행에 나란히 놓인 것이다
      const els = [...document.querySelectorAll('input:not([type=checkbox]), select, textarea')]
        .filter(e => e.offsetParent !== null);
      const rows = {};
      for (const e of els) {
        const r = e.getBoundingClientRect();
        const key = Math.round(r.top / 8);
        (rows[key] = rows[key] || []).push(Math.round(r.left));
      }
      return Object.values(rows).filter(v => v.length > 1).length;
    });
    if (side > 0) throw new Error(name + ' 화면에 한 행에 두 개 이상인 입력칸이 ' + side + '군데 있음');
  }
  pass('모든 화면에서 입력칸이 한 행에 하나씩 (' + SCREENS.length + '개 화면 확인)');

  console.log('\n[요구사항 4] 모바일에서 가로 스크롤 금지');
  for (const w of [320, 360, 390, 414]) {
    await page.setViewportSize({ width:w, height:800 });
    for (const [hash, name] of SCREENS) {
      await page.goto(base + hash);
      await page.waitForTimeout(80);
      const over = await page.evaluate(() => {
        if (document.documentElement.scrollWidth > window.innerWidth + 1) return 'page';
        // 화면 밖으로 삐져나온 요소가 있는지도 본다
        const w = window.innerWidth;
        for (const el of document.querySelectorAll('#view *, .tabbar *, .appbar *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > w + 1 || r.left < -1)) return el.className || el.tagName;
        }
        return '';
      });
      if (over) throw new Error(w + 'px / ' + name + ' 에서 가로로 넘침: ' + over);
    }
  }
  pass('320 · 360 · 390 · 414px 전 화면에서 가로 넘침 없음');

  console.log('\n[요구사항 5] 주요 버튼은 폭을 넓게');
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(base + '#/home');
  await page.waitForSelector('.btn');
  const wide = await page.evaluate(() => {
    const view = document.querySelector('.view');
    const avail = view.clientWidth - 32;
    const main = [...document.querySelectorAll('.btn:not(.btn--sm)')].filter(b => b.offsetParent);
    return main.map(b => Math.round(b.getBoundingClientRect().width / avail * 100));
  });
  if (!wide.length || wide.some(p => p < 90)) throw new Error('주요 버튼이 넓지 않음: ' + JSON.stringify(wide));
  pass('주요 버튼이 본문 폭의 ' + Math.min(...wide) + '% 이상 (' + wide.length + '개)');

  console.log('\n[요구사항 6] 제목 · 본문 · 도움말의 글자 위계');
  await page.goto(base + '#/settings');          // 카드 제목·라벨·도움말이 모두 있는 화면
  await page.waitForSelector('.card__title');
  const tiers = await page.evaluate(() => {
    const px = el => el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    const wt = el => el ? parseInt(getComputedStyle(el).fontWeight) : 0;
    return {
      screen: { s: px(document.querySelector('.appbar__title')), w: wt(document.querySelector('.appbar__title')) },
      card:   { s: px(document.querySelector('.card__title')),   w: wt(document.querySelector('.card__title')) },
      label:  { s: px(document.querySelector('.field > label')), w: wt(document.querySelector('.field > label')) },
      help:   { s: px(document.querySelector('.hint')),          w: wt(document.querySelector('.hint')) }
    };
  });
  if (!(tiers.card.s > tiers.label.s)) throw new Error('카드 제목이 라벨보다 크지 않음: ' + JSON.stringify(tiers));
  if (!(tiers.screen.s > tiers.label.s && tiers.label.s > tiers.help.s))
    throw new Error('크기 위계가 뚜렷하지 않음: ' + JSON.stringify(tiers));
  if (!(tiers.label.w >= 600 && tiers.help.w <= 400))
    throw new Error('굵기 위계가 뚜렷하지 않음: ' + JSON.stringify(tiers));
  pass(`화면제목 ${tiers.screen.s}px/${tiers.screen.w} > 카드제목 ${tiers.card.s}px/${tiers.card.w} > 라벨 ${tiers.label.s}px/${tiers.label.w} > 도움말 ${tiers.help.s}px/${tiers.help.w}`);

  console.log('\n[요구사항 7] 불필요한 장식과 애니메이션 제거');
  await page.goto(base + '#/home');
  await page.waitForSelector('.card');
  const deco = await page.evaluate(() => {
    const out = { shadows: 0, transitions: [], animations: [] };
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.boxShadow && cs.boxShadow !== 'none') out.shadows++;
      if (cs.transitionDuration && cs.transitionDuration !== '0s')
        out.transitions.push((el.className || el.tagName) + ':' + cs.transitionDuration);
      if (cs.animationName && cs.animationName !== 'none')
        out.animations.push((el.className || el.tagName) + ':' + cs.animationName);
    }
    return out;
  });
  if (deco.shadows) throw new Error('그림자가 남아 있음: ' + deco.shadows + '곳');
  if (deco.transitions.length) throw new Error('전환 효과가 남아 있음: ' + JSON.stringify(deco.transitions));
  if (deco.animations.length) throw new Error('애니메이션이 남아 있음: ' + JSON.stringify(deco.animations));
  pass('그림자 0곳 · 전환 효과 0곳 · 애니메이션 0곳 (작업 중 표시는 나타날 때만)');

  // 저장·검색 기능이 그대로인지 한 번 더
  console.log('\n[기능 유지 확인]');
  await page.goto(base + '#/students');
  await page.waitForSelector('#stuSearch');
  await page.fill('#stuSearch', '김민준');
  await page.waitForTimeout(200);
  if ((await page.$$('.list__item')).length !== 1) throw new Error('검색이 동작하지 않음');
  pass('검색 정상');
  await page.goto(base + '#/student/new');
  await page.fill('input[name="name"]', '테스트학생');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.list__item');
  const saved = await page.evaluate(() => Store.getStudents().some(s => s.name === '테스트학생'));
  if (!saved) throw new Error('저장이 동작하지 않음');
  pass('입력·저장 정상');

  await page.screenshot({ path: SP + '/design-home.png', fullPage: true });
  await browser.close();
  if (errors.length) { console.log('\n⚠️ 브라우저 오류:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n════════ 디자인 요구사항 ' + ok + '건 전부 통과 ════════');
})().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
