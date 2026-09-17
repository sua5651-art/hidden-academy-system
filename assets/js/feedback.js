/**
 * feedback.js — 피드백 문장 생성 + 사실 검증(있는 그대로만 쓰게 만드는 장치)
 *
 * 핵심 원칙: 선생님이 입력하지 않은 사실은 절대 문장에 들어가지 않는다.
 *  - 규칙 기반 생성: 연결어만 프로그램이 붙이고 내용은 입력 원문 그대로.
 *  - AI 생성: 엄격한 지시문 + 생성 후 원문 대조 검증.
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

  /** 말투(톤)별 연결어 묶음 */
  var TONE = {
    concise: {
      todayLead: function (t) { return t; },
      improveLead: function (t) { return t; },
      improveEmpty: '기록된 보완 사항 없음.',
      homeworkLead: function (t) { return t; },
      homeworkEmpty: '오늘 숙제 없음.',
      closing: ''
    },
    default: {
      todayLead: function (t) { return '오늘은 ' + t + ' 학습을 진행했습니다.'; },
      improveLead: function (t) { return t + ' 부분을 다음 수업에서 보완하겠습니다.'; },
      improveEmpty: '오늘 수업에서 별도로 기록된 보완 사항은 없습니다.',
      homeworkLead: function (t) { return t + ' 입니다. 가정에서도 확인 부탁드립니다.'; },
      homeworkEmpty: '오늘은 따로 부여된 숙제가 없습니다.',
      closing: ''
    },
    warm: {
      todayLead: function (t) { return '오늘은 ' + t + ' 학습을 함께 진행했습니다.'; },
      improveLead: function (t) { return t + ' 부분은 다음 수업에서 꼼꼼히 보완해 드리겠습니다.'; },
      improveEmpty: '오늘 수업에서 별도로 기록된 보완 사항은 없습니다.',
      homeworkLead: function (t) { return t + ' 입니다. 가정에서도 한 번 살펴봐 주시면 큰 도움이 됩니다.'; },
      homeworkEmpty: '오늘은 따로 부여된 숙제가 없습니다.',
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

  /**
   * 입력값만으로 5개 문단을 만든다.
   * 입력이 비어 있으면 "없음"으로 안내할 뿐, 내용을 지어내지 않는다.
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

    // [1] 오늘 학습 내용 — 진도 원문 그대로
    var today = progress ? t.todayLead(progress) : '오늘 수업 진도가 입력되지 않았습니다.';

    // [2] 학습 상태 — 선택한 단계의 고정 문장 + 선생님 메모 원문
    var stateParts = [];
    if (LEVEL_SENTENCE[levelCode]) stateParts.push(LEVEL_SENTENCE[levelCode]);
    if (levelNote) stateParts.push(levelNote);
    var stateText = stateParts.join(' ') || '학습 상태가 입력되지 않았습니다.';

    // [3] 보완 내용
    var improveText = improve ? t.improveLead(improve) : t.improveEmpty;

    // [4] 숙제
    var homeworkText = homework ? t.homeworkLead(homework) : t.homeworkEmpty;

    // [5] 전달사항 — 비어 있으면 아예 문단을 만들지 않는다
    var noticeText = memo || '';

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

  /** AI에게 보낼 지시문. "입력에 없는 내용 금지"를 최우선 규칙으로 못 박는다. */
  function buildAIPrompt(lesson, settings) {
    var input = lesson.input || {};
    var toneLabel = { concise: '간결하고 담백한', default: '정중하고 명확한', warm: '따뜻하고 친근한' }[settings && settings.tone] || '정중하고 명확한';

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
      '',
      '## 절대 규칙 (어기면 실패로 간주)',
      '1. 아래 "입력 정보"에 없는 사실을 절대 만들어내지 마십시오.',
      '2. 입력에 없는 점수, 등급, 등수, 정답률, 페이지 번호, 문항 수, 단원명, 교재명, 날짜, 사람 이름을 쓰지 마십시오.',
      '3. 입력에 없는 학생의 태도·성격 평가(예: "집중을 잘했습니다", "성실합니다")를 쓰지 마십시오.',
      '4. 입력이 "(입력 없음)"인 항목은 내용을 채우지 말고 빈 문자열("")로 두십시오.',
      '5. 허용되는 작업은 오직 문장 다듬기(어순 정리, 존댓말 변환, 연결어 추가)뿐입니다. 정보 추가는 금지입니다.',
      '6. 진도·숙제에 적힌 고유명사와 숫자는 입력 원문 그대로 옮기고 바꾸지 마십시오.',
      '',
      '## 문체',
      toneLabel + ' 학부모 안내문 말투(합니다체)로 씁니다. 각 항목은 1~3문장으로 짧게 씁니다.',
      '',
      '## 출력 형식',
      '다른 설명 없이 아래 JSON 형식만 출력하십시오.',
      '{"today":"오늘 학습 내용","state":"학습 상태","improve":"보완 내용","homework":"숙제","notice":"전달사항"}'
    ].join('\n');

    var user = '## 입력 정보\n' + facts + '\n\n위 정보만 사용해 JSON을 출력하십시오.';

    return { system: system, user: user };
  }

  // ───────────────────────── 사실 검증기 ─────────────────────────

  /** 학습 안내문에서 흔히 쓰이는 일반 단어 — 원문에 없어도 경고하지 않는다 */
  var COMMON_WORDS = ('오늘 수업 내용 학습 상태 보완 숙제 전달 사항 학생 선생님 학부모 가정 지도 복습 예습 연습 문제 풀이 진행 진도 부분 추가 반복 확인 부탁 감사 다음 시간 이해 정확 필요 준비 점검 함께 계속 앞으로 관심 드립니다 합니다 있습니다 했습니다 됩니다 입니다 주시면 주셔서 하겠습니다 보입니다 바랍니다 참고 안내 관련 내용을 대체로 일부 매우 잘 더 등 및 또한 그리고 하지만 다만 특히 별도로 따로 아직 조금 차분히 꼼꼼히 도움 상황 결과 과정 방향 계획 목표 수준 이번 지난 이번주 다음주 주차 회차 정리 암기 오답 풀기 질문 설명 이해도 학원 피드백 담당 기록 없음 없습니다 관리 향상 성장').split(/\s+/);

  var COMMON_SET = {};
  COMMON_WORDS.forEach(function (w) { if (w) COMMON_SET[w] = true; });

  /** 조사·어미를 떼어 어간만 남긴다 (간단 규칙) */
  var PARTICLES = ['으로써', '에서는', '에게서', '이라고', '라고는', '까지도', '부터는', '에서도', '에게는',
    '했습니다', '하겠습니다', '했어요', '입니다', '습니다', '합니다', '됩니다', '이라', '으로', '에서', '에게',
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

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  global.FeedbackEngine = {
    LEVEL_SENTENCE: LEVEL_SENTENCE,
    LEVEL_LABEL: LEVEL_LABEL,
    formatDate: formatDate,
    generateRuleBased: generateRuleBased,
    composeText: composeText,
    buildAIPrompt: buildAIPrompt,
    toCheckableText: toCheckableText,
    verify: verify
  };
})(window);
