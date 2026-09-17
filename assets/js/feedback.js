/**
 * feedback.js — 피드백 문장 생성 + 사실 검증(있는 그대로만 쓰게 만드는 장치)
 *
 * 문장 작성 6원칙 (규칙 기반 생성과 AI 생성에 똑같이 적용된다)
 *  1. 사실 중심   — 선생님이 입력한 사실만 쓴다.
 *  2. 과장 칭찬 금지 — "훌륭합니다", "완벽합니다" 같은 치켜세우는 표현을 쓰지 않는다.
 *  3. 부정 단정 금지 — 부족한 부분은 단정하지 않고 다음 학습 방향과 함께 쓴다.
 *  4. 짧은 문단   — 항목마다 짧은 줄로 나눠 쓴다. 긴 나열은 "·" 목록으로 만든다.
 *  5. 숙제 명확화  — 숙제는 별도 항목에 한 줄에 하나씩 적는다.
 *  6. 추가 금지   — 입력에 없는 내용은 어떤 경우에도 넣지 않는다.
 */
(function (global) {
  'use strict';

  /** 이해도 단계별 고정 문장 — 선생님이 고른 단계를 말로 옮긴 것뿐 */
  var LEVEL_SENTENCE = {
    excellent:  '오늘 수업 내용을 매우 정확하게 이해했습니다.',
    good:       '오늘 수업 내용을 잘 이해하고 있습니다.',
    average:    '오늘 수업 내용을 대체로 이해했습니다.',
    needs_work: '오늘 수업 내용 중 일부는 추가 연습이 필요합니다.',
    weak:       '오늘 수업 내용은 반복 학습이 필요한 상태입니다.'
  };

  var LEVEL_LABEL = {
    excellent: '매우 우수', good: '우수', average: '보통',
    needs_work: '보완 필요', weak: '많이 부족'
  };

  /**
   * 말투(톤)별 연결어 묶음.
   * 연결어는 모두 '사실을 잇는 말'이며, 학생을 평가하는 표현은 넣지 않는다.
   */
  var TONE = {
    concise: {
      todayLead: '오늘 학습한 내용입니다.',
      improveLead: '다음 수업에서 아래 내용을 보완하겠습니다.',
      improveEmpty: '오늘 기록된 보완 사항은 없습니다.',
      homeworkEmpty: '오늘 부여된 숙제는 없습니다.',
      homeworkClose: '',
      direction: '다음 수업에서 해당 내용을 다시 점검하겠습니다.',
      closing: ''
    },
    default: {
      todayLead: '오늘은 아래 내용을 학습했습니다.',
      improveLead: '다음 수업에서 아래 부분을 보완하겠습니다.',
      improveEmpty: '오늘 수업에서 별도로 기록된 보완 사항은 없습니다.',
      homeworkEmpty: '오늘은 따로 부여된 숙제가 없습니다.',
      homeworkClose: '가정에서도 확인 부탁드립니다.',
      direction: '다음 수업에서 해당 내용을 다시 점검하겠습니다.',
      closing: ''
    },
    warm: {
      todayLead: '오늘은 아래 내용을 함께 학습했습니다.',
      improveLead: '다음 수업에서 아래 부분을 차근히 보완하겠습니다.',
      improveEmpty: '오늘 수업에서 별도로 기록된 보완 사항은 없습니다.',
      homeworkEmpty: '오늘은 따로 부여된 숙제가 없습니다.',
      homeworkClose: '가정에서도 한 번 살펴봐 주시면 도움이 됩니다.',
      direction: '다음 수업에서 해당 내용을 차근히 다시 점검하겠습니다.',
      closing: '늘 관심 가져 주셔서 감사합니다.'
    }
  };

  function tone(name) { return TONE[name] || TONE['default']; }

  function trim(v) { return String(v == null ? '' : v).trim(); }

  /** 2026-09-17 → 2026년 9월 17일 (수) */
  function formatDate(iso) {
    if (!iso) return '';
    var parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    if (isNaN(d.getTime())) return iso;
    return parts[0] + '년 ' + Number(parts[1]) + '월 ' + Number(parts[2]) + '일 (' + days[d.getDay()] + ')';
  }

  // ───────────────────────── 규칙 기반 생성 ─────────────────────────

  /** 줄바꿈과 ", " 를 기준으로 항목을 나눈다. (숫자 안의 쉼표 "1,000" 은 나누지 않음) */
  function toItems(text) {
    return String(text || '')
      .split(/\r?\n|,\s+|·\s*/)
      .map(trim)
      .filter(Boolean);
  }

  /** 항목을 한 줄에 하나씩 "· " 목록으로 만든다 (원칙 4·5) */
  function bulletList(items) {
    return items.map(function (t) { return '· ' + t.replace(/^[·\-*]\s*/, ''); }).join('\n');
  }

  /**
   * 입력값만으로 5개 문단을 만든다.
   * 연결어만 프로그램이 붙이고 내용은 입력 원문 그대로이므로,
   * 구조적으로 없는 사실이 들어갈 수 없다 (원칙 1·6).
   */
  function generateRuleBased(lesson, settings) {
    var t = tone(settings && settings.tone);
    var input = lesson.input || {};

    var progress = trim(input.progress);
    var levelCode = trim(input.understanding);
    var levelNote = trim(input.understandingNote);
    var improve = trim(input.improve);
    var homework = trim(input.homework);
    var memo = trim(input.memo);

    // [1] 오늘 학습 내용 — 진도를 항목별로 나눠 짧게 (원칙 4)
    var progressItems = toItems(progress);
    var today = progressItems.length
      ? t.todayLead + '\n' + bulletList(progressItems)
      : '오늘 수업 진도가 입력되지 않았습니다.';

    // [2] 학습 상태 — 선택한 단계의 고정 문장 + 메모를 각각 다른 줄에 (원칙 1·4)
    var stateLines = [];
    if (LEVEL_SENTENCE[levelCode]) stateLines.push(LEVEL_SENTENCE[levelCode]);
    if (levelNote) stateLines.push(levelNote);
    // 보완 내용이 비어 있는데 이해도가 낮으면, 단정으로 끝나지 않도록 방향을 덧붙인다 (원칙 3)
    if (!improve && (levelCode === 'needs_work' || levelCode === 'weak')) stateLines.push(t.direction);
    var stateText = stateLines.join('\n') || '학습 상태가 입력되지 않았습니다.';

    // [3] 보완 내용 — 항상 '다음 학습 방향'과 함께 제시한다 (원칙 3)
    var improveItems = toItems(improve);
    var improveText = improveItems.length
      ? t.improveLead + '\n' + bulletList(improveItems)
      : t.improveEmpty;

    // [4] 숙제 — 한 줄에 하나씩, 숙제 외의 내용은 섞지 않는다 (원칙 5)
    var homeworkItems = toItems(homework);
    var homeworkText = homeworkItems.length
      ? bulletList(homeworkItems) + (t.homeworkClose ? '\n' + t.homeworkClose : '')
      : t.homeworkEmpty;

    // [5] 전달사항 — 비어 있으면 아예 문단을 만들지 않는다
    var noticeText = memo ? toItems(memo).join('\n') : '';

    return {
      today: today,
      state: stateText,
      improve: improveText,
      homework: homeworkText,
      notice: noticeText
    };
  }

  /** 5개 문단 → 학부모에게 보낼 최종 전체 문장 */
  function composeText(lesson, sections, settings) {
    settings = settings || {};
    var t = tone(settings.tone);
    var lines = [];

    lines.push('[' + (lesson.studentName || '학생') + ' 학생 수업 피드백]');
    var head = formatDate(lesson.date);
    if (lesson.teacher) head += ' · 담당 ' + lesson.teacher;
    lines.push(head);
    lines.push('');

    function block(title, body) {
      if (!trim(body)) return;
      lines.push('■ ' + title);
      lines.push(trim(body));
      lines.push('');
    }

    block('오늘 학습 내용', sections.today);
    block('학습 상태', sections.state);
    block('보완 내용', sections.improve);
    block('숙제', sections.homework);
    block('전달사항', sections.notice);

    if (t.closing) { lines.push(t.closing); lines.push(''); }
    if (trim(settings.signature)) lines.push('- ' + trim(settings.signature));
    else if (trim(settings.academyName)) lines.push('- ' + trim(settings.academyName));

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ───────────────────────── AI 지시문 ─────────────────────────

  /**
   * AI에게 보낼 지시문.
   * 문장 작성 6원칙을 규칙으로 못 박아 전달한다.
   */
  function buildAIPrompt(lesson, settings) {
    var input = lesson.input || {};
    var toneLabel = {
      concise: '간결하고 담백한',
      default: '정중하고 담백한',
      warm: '정중하되 조금 더 부드러운'
    }[settings && settings.tone] || '정중하고 담백한';

    var facts = [
      '학생명: ' + (lesson.studentName || ''),
      '수업 날짜: ' + (lesson.date || ''),
      '담당 교사: ' + (lesson.teacher || ''),
      '오늘 수업 진도: ' + (trim(input.progress) || '(입력 없음)'),
      '이해도 단계: ' + (LEVEL_LABEL[trim(input.understanding)] || '(입력 없음)'),
      '이해도 메모: ' + (trim(input.understandingNote) || '(입력 없음)'),
      '보완 필요 사항: ' + (trim(input.improve) || '(입력 없음)'),
      '숙제: ' + (trim(input.homework) || '(입력 없음)'),
      '선생님 메모(전달사항): ' + (trim(input.memo) || '(입력 없음)')
    ].join('\n');

    var system = [
      '당신은 학원 선생님이 작성한 수업 메모를 학부모용 피드백 문장으로 다듬는 보조 도구입니다.',
      '문장을 "다듬는" 역할만 하며, 내용을 판단하거나 보태지 않습니다.',
      '',
      '## 원칙 1. 사실 중심으로 씁니다',
      '- 아래 "입력 정보"에 적힌 사실만 서술합니다.',
      '- 추측, 인상, 전망("앞으로 더 잘할 것으로 보입니다")을 쓰지 않습니다.',
      '- 학생의 성격, 태도, 노력, 집중력은 입력에 적혀 있을 때만 쓰고, 없으면 쓰지 않습니다.',
      '',
      '## 원칙 2. 지나친 칭찬을 하지 않습니다',
      '- 금지 표현: 훌륭합니다, 완벽합니다, 탁월합니다, 뛰어납니다, 대단합니다, 최고입니다,',
      '  아주 잘합니다, 모범적입니다, 자랑스럽습니다, 기특합니다.',
      '- 이해도 단계가 "매우 우수"라도 사실을 담담하게 적을 뿐, 치켜세우지 않습니다.',
      '- 감탄 부호(!)와 이모지를 쓰지 않습니다.',
      '',
      '## 원칙 3. 부족한 부분은 단정하지 않고 다음 학습 방향과 함께 씁니다',
      '- 금지 표현: 못합니다, 못했습니다, 이해하지 못했습니다, 부족합니다, 따라오지 못합니다,',
      '  의욕이 없습니다, 전혀 모릅니다, 심각합니다.',
      '- 대신 "아직 ~가 더 필요합니다", "~를 한 번 더 정리하면 좋겠습니다" 처럼 씁니다.',
      '- 보완이 필요한 내용을 적을 때는 반드시 다음에 무엇을 할지(학습 방향)를 함께 적습니다.',
      '  예: "which와 that 구분은 아직 정리가 더 필요합니다. 다음 수업에서 해당 문제를 다시 연습하겠습니다."',
      '',
      '## 원칙 4. 문단을 짧게 씁니다',
      '- 각 항목은 최대 3문장까지만 씁니다.',
      '- 한 문장은 60자 안팎으로 짧게 끊습니다.',
      '- 나열할 내용이 두 개 이상이면 줄바꿈(\\n)으로 나누고 각 줄을 "· " 로 시작합니다.',
      '',
      '## 원칙 5. 숙제는 별도 항목에 명확하게 씁니다',
      '- 숙제는 반드시 homework 항목에만 씁니다. 다른 항목에 숙제를 섞지 않습니다.',
      '- 숙제가 여러 개면 한 줄에 하나씩, "· " 로 시작해 적습니다.',
      '- 교재명, 쪽수, 범위는 입력에 적힌 그대로 옮깁니다. 바꾸거나 줄이지 않습니다.',
      '',
      '## 원칙 6. 입력에 없는 내용은 절대 추가하지 않습니다 (가장 중요)',
      '- 입력에 없는 점수, 등급, 등수, 정답률, 쪽수, 문항 수, 단원명, 교재명, 날짜, 사람 이름을 쓰지 않습니다.',
      '- 입력이 "(입력 없음)"인 항목은 채우지 말고 빈 문자열("")로 둡니다.',
      '- 고유명사와 숫자는 입력 원문 그대로 옮깁니다.',
      '- 허용되는 작업은 어순 정리, 존댓말 변환, 연결어 추가뿐입니다.',
      '',
      '## 문체',
      toneLabel + ' 학부모 안내문 말투(합니다체)를 씁니다.',
      '',
      '## 출력 형식',
      '다른 설명 없이 아래 JSON만 출력합니다. 줄바꿈은 \\n 으로 표기합니다.',
      '{"today":"오늘 학습 내용","state":"학습 상태","improve":"보완 내용","homework":"숙제","notice":"전달사항"}'
    ].join('\n');

    var user = [
      '## 입력 정보',
      facts,
      '',
      '위 정보만 사용해 JSON을 출력하십시오.',
      '입력에 없는 내용을 넣거나, 칭찬을 덧붙이거나, 부족한 점을 단정하면 실패로 처리됩니다.'
    ].join('\n');

    return { system: system, user: user };
  }

  // ───────────────────────── 사실 검증기 ─────────────────────────

  /** 학습 안내문에서 흔히 쓰이는 일반 단어 — 원문에 없어도 경고하지 않는다 */
  var COMMON_WORDS = ('오늘 수업 내용 학습 상태 보완 숙제 전달 사항 학생 선생님 학부모 가정 지도 복습 예습 연습 문제 풀이 진행 진도 부분 추가 반복 확인 부탁 감사 다음 시간 이해 정확 필요 준비 점검 함께 계속 앞으로 관심 드립니다 합니다 있습니다 했습니다 됩니다 입니다 주시면 주셔서 하겠습니다 보입니다 바랍니다 참고 안내 관련 내용을 대체로 일부 매우 잘 더 등 및 또한 그리고 하지만 다만 특히 별도로 따로 아직 조금 차분히 꼼꼼히 도움 상황 결과 과정 방향 계획 목표 수준 이번 지난 이번주 다음주 주차 회차 정리 암기 오답 풀기 질문 설명 이해도 학원 피드백 담당 기록 없음 없습니다 관리 향상 성장 학습한 학습했습니다 아래 보완하겠습니다 점검하겠습니다 부여된 기록된 살펴봐 차근히 해당 다시 한번 정리하면 좋겠습니다 교사 담당 전체 완료 미완료 항목 남은 안내 확인했습니다 숙제를 까지 제출 예정일 기본 오늘 추가 진행 상황 상담 답변 후속조치 요청 유형 대상 학부모 정기 성적 진학 진로 태도 출결 불만 건의 기타').split(/\s+/);

  var COMMON_SET = {};
  COMMON_WORDS.forEach(function (w) { if (w) COMMON_SET[w] = true; });

  /** 조사·어미를 떼어 어간만 남긴다 (간단 규칙) */
  var PARTICLES = ['으로써', '에서는', '에게서', '이라고', '라고는', '까지도', '부터는', '에서도', '에게는',
    '드립니다', '했습니다', '하겠습니다', '했어요', '입니다', '습니다', '합니다', '됩니다', '이라', '으로', '에서', '에게',
    '까지', '부터', '보다', '처럼', '마다', '이나', '거나', '와는', '과는', '하고', '이며', '으며',
    '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '과', '와', '로', '며', '고', '해', '한', '된', '들'];

  function stem(word) {
    var w = word;
    for (var i = 0; i < PARTICLES.length; i++) {
      var p = PARTICLES[i];
      if (w.length > p.length + 1 && w.slice(-p.length) === p) { w = w.slice(0, -p.length); break; }
    }
    return w;
  }

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/[\s.,·~\-—()[\]{}"'`!?:;/\\]+/g, ' ');
  }

  /**
   * 표현 규칙 (원칙 2·3).
   * 지시문만으로는 AI가 어길 수 있으므로 생성 결과를 한 번 더 걸러낸다.
   * 선생님이 직접 그렇게 입력한 경우에는 잡지 않는다.
   */
  var PRAISE_PATTERNS = [
    '훌륭', '완벽', '탁월', '뛰어', '대단', '최고', '모범적', '자랑스', '기특',
    '아주 잘', '너무 잘', '누구보다', '눈부신', '놀라운'
  ];

  var ABSOLUTE_NEGATIVE_PATTERNS = [
    '못합니다', '못했습니다', '못하고 있습니다', '이해하지 못', '따라오지 못', '따라가지 못',
    '부족합니다', '부족한 편', '의욕이 없', '관심이 없', '전혀 모', '심각', '포기'
  ];

  /** 과장 칭찬·부정 단정 표현을 찾아낸다 */
  function checkStyle(text, sourceRaw) {
    var found = [];
    var lower = String(text || '');
    var source = String(sourceRaw || '');

    PRAISE_PATTERNS.forEach(function (w) {
      if (lower.indexOf(w) !== -1 && source.indexOf(w) === -1) {
        found.push({ type: 'praise', token: w, message: '"' + w + '" 은(는) 과장된 칭찬 표현입니다. 사실 위주로 바꿔 주세요.' });
      }
    });

    ABSOLUTE_NEGATIVE_PATTERNS.forEach(function (w) {
      if (lower.indexOf(w) !== -1 && source.indexOf(w) === -1) {
        found.push({ type: 'negative', token: w, message: '"' + w + '" 은(는) 부정적으로 단정하는 표현입니다. 다음 학습 방향과 함께 표현해 주세요.' });
      }
    });

    return found;
  }

  /** 검사 대상 본문만 뽑아낸다 (앱이 붙이는 고정 문구는 제외) */
  function toCheckableText(generated) {
    if (generated && typeof generated === 'object') {
      return ['today', 'state', 'improve', 'homework', 'notice']
        .map(function (k) { return trim(generated[k]); })
        .filter(Boolean).join('\n');
    }
    return String(generated || '').split('\n').filter(function (line) {
      var t = line.trim();
      if (!t) return false;
      if (/^\[.*\]$/.test(t)) return false;                    // [○○ 학생 수업 피드백]
      if (/^■/.test(t)) return false;                           // ■ 소제목
      if (/^-\s/.test(t)) return false;                         // - 학원 서명
      if (/^\d{4}년\s*\d+월\s*\d+일/.test(t)) return false;     // 날짜 · 담당 교사 줄
      return true;
    }).join('\n');
  }

  /**
   * 생성된 문장이 선생님 입력 범위를 벗어났는지 검사한다.
   *
   * @param generated 5개 문단 객체({today,state,...}) 또는 전체 문장(문자열).
   *                  전체 문장을 넣으면 앱이 자동으로 붙이는 머리말·소제목·서명은
   *                  검사 대상에서 빼고, 선생님/AI가 쓴 본문만 검사한다.
   * @returns {{ok:boolean, errors:Array, warnings:Array}}
   *   errors   = 원문에 없는 숫자/영어 (지어냈을 가능성 높음 → 빨간 경고)
   *   warnings = 원문에 없는 한글 표현 (일반 학습 용어 제외 → 노란 확인 요망)
   */
  function verify(generated, lesson) {
    var generatedText = toCheckableText(generated);
    var input = lesson.input || {};
    var sourceRaw = [
      input.progress, input.understandingNote, input.improve, input.homework, input.memo,
      lesson.studentName, lesson.teacher, lesson.date,
      LEVEL_LABEL[trim(input.understanding)] || '',
      LEVEL_SENTENCE[trim(input.understanding)] || ''
    ].join(' ');

    var source = normalize(sourceRaw);
    // 날짜는 어떤 형태로 표기돼도 통과시키기 위해 숫자를 따로 모아 둔다
    var sourceNumbers = {};
    (sourceRaw.match(/\d+/g) || []).forEach(function (n) { sourceNumbers[String(Number(n))] = true; });

    var out = normalize(generatedText);
    var errors = [];
    var warnings = [];
    var seen = {};

    // 1) 숫자 검사 — 원문에 없는 숫자는 지어낸 것으로 본다
    (String(generatedText).match(/\d+/g) || []).forEach(function (n) {
      var key = 'num:' + n;
      if (seen[key]) return;
      seen[key] = true;
      if (!sourceNumbers[String(Number(n))]) {
        errors.push({ type: 'number', token: n, message: '입력에 없는 숫자 "' + n + '"이(가) 문장에 있습니다.' });
      }
    });

    // 2) 영어 단어 검사 — 교재명·문법 용어 등은 원문에 있어야 한다
    (String(generatedText).match(/[A-Za-z]{2,}/g) || []).forEach(function (w) {
      var lw = w.toLowerCase();
      var key = 'en:' + lw;
      if (seen[key]) return;
      seen[key] = true;
      if (source.indexOf(lw) === -1) {
        errors.push({ type: 'english', token: w, message: '입력에 없는 영어 표현 "' + w + '"이(가) 문장에 있습니다.' });
      }
    });

    // 3) 한글 표현 검사 — 일반 학습 용어가 아닌데 원문에 없으면 확인 요망
    (String(generatedText).match(/[가-힣]{2,}/g) || []).forEach(function (w) {
      var key = 'ko:' + w;
      if (seen[key]) return;
      seen[key] = true;
      if (COMMON_SET[w]) return;
      var st = stem(w);
      if (COMMON_SET[st]) return;
      if (source.indexOf(w) !== -1) return;
      if (st.length >= 2 && source.indexOf(st) !== -1) return;
      warnings.push({ type: 'korean', token: w, message: '"' + w + '"은(는) 입력 내용에서 찾을 수 없는 표현입니다. 확인해 주세요.' });
    });

    // 4) 표현 검사 — 과장 칭찬(원칙 2)과 부정 단정(원칙 3)
    warnings = warnings.concat(checkStyle(generatedText, sourceRaw));

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  global.FeedbackEngine = {
    LEVEL_SENTENCE: LEVEL_SENTENCE,
    LEVEL_LABEL: LEVEL_LABEL,
    formatDate: formatDate,
    toItems: toItems,
    bulletList: bulletList,
    generateRuleBased: generateRuleBased,
    composeText: composeText,
    buildAIPrompt: buildAIPrompt,
    toCheckableText: toCheckableText,
    checkStyle: checkStyle,
    verify: verify
  };
})(window);
