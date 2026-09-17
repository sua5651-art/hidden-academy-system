/**
 * sheets.js — 구글 시트로 기록 보내기
 *
 * 앱의 저장 방식은 그대로 두고, 저장이 끝난 뒤 시트에 한 벌 더 보낸다.
 * 시트로 보내는 데 실패해도 기기에 저장된 기록은 그대로 남는다.
 *
 * 왜 이렇게 보내는가
 *  · 보내는 형식을 text/plain 으로 한다. application/json 으로 보내면
 *    브라우저가 먼저 "물어보는 요청"을 하나 더 보내는데, 구글 Apps Script 는
 *    그 요청에 답하지 않아 전송이 막힌다.
 *  · 열 이름(student_name 등)은 Apps Script 의 LAYOUT 과 똑같이 맞춘다.
 *    한쪽만 바꾸면 빈 칸이 생긴다.
 */
(function (global) {
  'use strict';

  function trim(v) { return String(v == null ? '' : v).trim(); }

  function isConfigured(settings) {
    var s = (settings && settings.sheets) || {};
    return !!(trim(s.url) && trim(s.secret));
  }

  // ───────────────────────── 기록 → 시트 한 줄 ─────────────────────────

  function levelLabel(code) {
    return global.FeedbackEngine.LEVEL_LABEL[trim(code)] || '';
  }

  function itemsToText(items) {
    return (items || []).map(function (i) {
      return trim(i.text) + (i.done ? ' (완료)' : '');
    }).filter(Boolean).join('\n');
  }

  /** 기록 하나를 Apps Script 가 기대하는 납작한 모양으로 바꾼다 */
  function toRow(type, rec) {
    var now = new Date().toISOString();

    if (type === 'lesson') {
      var i = rec.input || {};
      return {
        saved_at: now,
        record_id: rec.id,
        student_name: rec.studentName,
        class_date: rec.date,
        teacher: rec.teacher,
        progress: trim(i.progress),
        understanding: levelLabel(i.understanding),
        understanding_note: trim(i.understandingNote),
        improve: trim(i.improve),
        homework: trim(i.homework),
        note: trim(i.memo)
      };
    }

    if (type === 'homework') {
      var all = (rec.base || []).concat(rec.extra || []);
      return {
        saved_at: now,
        record_id: rec.id,
        student_name: rec.studentName,
        class_date: rec.date,
        teacher: rec.teacher,
        due_date: rec.dueDate,
        base_homework: itemsToText(rec.base),
        extra_homework: itemsToText(rec.extra),
        done_count: String(all.filter(function (x) { return x.done; }).length),
        total_count: String(all.length),
        teacher_checked: (rec.teacherCheck && rec.teacherCheck.checked) ? '확인' : ''
      };
    }

    if (type === 'counsel') {
      var fu = rec.followUp || {};
      return {
        saved_at: now,
        record_id: rec.id,
        student_name: rec.studentName,
        class_date: rec.date,
        counselor: rec.counselor,
        target: global.CounselEngine.targetLabel(rec.target),
        type: global.CounselEngine.typeLabel(rec.type),
        content: trim(rec.content),
        parent_request: trim(rec.parentRequest),
        academy_reply: trim(rec.academyReply),
        follow_up: fu.needed ? (trim(fu.text) + (fu.done ? ' (완료)' : '')) : '',
        next_check_date: rec.nextCheckDate
      };
    }

    return null;
  }

  // ───────────────────────── 보내기 ─────────────────────────

  /**
   * @returns Promise<{ok, message, data}>  — 거부당해도 reject 하지 않는다.
   *          연결 자체가 안 될 때만 reject 한다.
   */
  function post(body, settings) {
    var s = (settings && settings.sheets) || {};
    var url = trim(s.url);
    if (!url) return Promise.reject(new Error('구글 시트 주소가 설정되어 있지 않습니다.'));

    return fetch(url, {
      method: 'POST',
      // text/plain 으로 보내야 브라우저가 막지 않는다 (위 설명 참고)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (res) {
      return res.text().then(function (txt) {
        var parsed;
        try { parsed = JSON.parse(txt); }
        catch (e) {
          throw new Error('구글에서 예상과 다른 답이 왔습니다. 주소가 /exec 로 끝나는지 확인해 주세요.');
        }
        return parsed;
      });
    });
  }

  /** 기록 여러 건을 한 종류씩 보낸다 */
  function send(type, records, settings) {
    var rows = (records || []).map(function (r) { return toRow(type, r); }).filter(Boolean);
    if (!rows.length) return Promise.resolve({ ok: true, message: '보낼 기록이 없습니다.', data: { added: 0, updated: 0 } });
    return post({
      secret: trim((settings.sheets || {}).secret),
      type: type,
      records: rows
    }, settings);
  }

  /**
   * 연결 시험 — 기록을 하나도 보내지 않고 주소와 비밀번호만 확인한다.
   * 시트에는 아무것도 쓰이지 않는다.
   */
  function test(settings) {
    return post({
      secret: trim((settings.sheets || {}).secret),
      type: 'lesson',
      records: []
    }, settings).then(function (r) {
      // 비밀번호가 맞으면 "보낸 기록이 없습니다" 까지 통과한다
      if (r.message && r.message.indexOf('보낸 기록이 없습니다') !== -1) {
        return { ok: true, message: '연결되었습니다. 주소와 비밀번호가 모두 맞습니다.' };
      }
      if (r.message && r.message.indexOf('비밀번호') !== -1) {
        return { ok: false, message: '비밀번호가 맞지 않습니다. Apps Script 의 SECRET 과 같은지 확인해 주세요.' };
      }
      if (r.message && r.message.indexOf('시트에 연결') !== -1) {
        return { ok: false, message: r.message };
      }
      return { ok: !!r.ok, message: r.message || '알 수 없는 응답입니다.' };
    });
  }

  global.SheetsClient = {
    isConfigured: isConfigured,
    toRow: toRow,
    send: send,
    test: test
  };
})(window);
