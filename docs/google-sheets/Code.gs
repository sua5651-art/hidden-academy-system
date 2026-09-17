/**
 * 히든 아카데미 — 기록을 구글 시트에 쌓는 스크립트
 *
 * 이 파일은 구글 시트의 "Apps Script"(구글이 무료로 주는 작은 서버) 에 붙여 넣습니다.
 * 설치 방법은 같은 폴더의 README.md 를 보세요.
 *
 * 하는 일
 *  · 앱에서 보낸 기록을 받아 시트에 한 줄씩 적습니다.
 *  · 같은 기록을 다시 보내면 새 줄을 만들지 않고 그 줄을 고칩니다.
 *    (선생님이 기록을 수정하면 시트도 같이 바뀝니다)
 */

// ────────────────────────────────────────────────
// 1. 여기 두 줄만 고치면 됩니다
// ────────────────────────────────────────────────

/** 아무나 시트에 쓰지 못하도록 정하는 비밀번호. 길고 아무 뜻 없는 문자열로 바꾸세요. */
var SECRET = '여기에-직접-정한-비밀번호를-넣으세요';

/** 시트 맨 윗줄(제목줄)을 자동으로 만들지 여부 */
var AUTO_HEADER = true;

// ────────────────────────────────────────────────
// 2. 아래는 고치지 않아도 됩니다
// ────────────────────────────────────────────────

/**
 * 기록 종류별로 어느 시트에 어떤 열을 적을지 정해 둔 표.
 * 열 이름(왼쪽 아래 배열)은 앱이 보내는 이름과 똑같아야 합니다.
 */
var LAYOUT = {
  lesson: {
    sheet: '수업기록',
    columns: ['saved_at', 'record_id', 'student_name', 'class_date', 'teacher',
              'progress', 'understanding', 'understanding_note', 'improve',
              'homework', 'note']
  },
  homework: {
    sheet: '숙제기록',
    columns: ['saved_at', 'record_id', 'student_name', 'class_date', 'teacher',
              'due_date', 'base_homework', 'extra_homework',
              'done_count', 'total_count', 'teacher_checked']
  },
  counsel: {
    sheet: '상담기록',
    columns: ['saved_at', 'record_id', 'student_name', 'class_date', 'counselor',
              'target', 'type', 'content', 'parent_request', 'academy_reply',
              'follow_up', 'next_check_date']
  }
};

/** 앱에서 기록을 보내면 이 함수가 받습니다 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return reply(false, '보낸 내용이 비어 있습니다.');
    }

    var body = JSON.parse(e.postData.contents);

    if (String(body.secret || '') !== SECRET) {
      return reply(false, '비밀번호가 맞지 않습니다.');
    }

    var layout = LAYOUT[body.type];
    if (!layout) {
      return reply(false, '알 수 없는 기록 종류입니다: ' + body.type);
    }

    var records = body.records;
    if (!records || !records.length) {
      return reply(false, '보낸 기록이 없습니다.');
    }

    var sheet = getSheet(layout);
    var result = { added: 0, updated: 0 };

    // record_id 로 기존 줄을 찾기 위해 2번째 열(=record_id)을 한 번만 읽어 둔다
    var idColumn = layout.columns.indexOf('record_id') + 1;
    var lastRow = sheet.getLastRow();
    var idMap = {};
    if (idColumn > 0 && lastRow > 1) {
      var ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var key = String(ids[i][0] || '');
        if (key) idMap[key] = i + 2;   // 실제 시트의 줄 번호
      }
    }

    var newRows = [];
    for (var r = 0; r < records.length; r++) {
      var rec = records[r];
      var row = buildRow(layout.columns, rec);
      var existing = idMap[String(rec.record_id || '')];

      if (existing) {
        sheet.getRange(existing, 1, 1, row.length).setValues([row]);
        result.updated++;
      } else {
        newRows.push(row);
        result.added++;
      }
    }

    if (newRows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, layout.columns.length)
           .setValues(newRows);
    }

    return reply(true, '저장했습니다.', result);

  } catch (err) {
    return reply(false, '오류: ' + err);
  }
}

/** 브라우저 주소창에 웹앱 주소를 넣었을 때 연결을 확인해 주는 화면 */
function doGet() {
  var kinds = [];
  for (var k in LAYOUT) kinds.push(LAYOUT[k].sheet);

  // 이 스크립트가 시트에 붙어 있는지 확인한다.
  // 구글 시트에서 "확장 프로그램 → Apps Script" 로 만들지 않고
  // script.google.com 에서 따로 만들면 여기가 비어 있다.
  var fileName = findSpreadsheetName();
  if (!fileName) {
    return reply(false,
      '시트에 연결되어 있지 않습니다. 구글 시트를 열고 확장 프로그램 → Apps Script 에서 ' +
      '다시 만들어 코드를 붙여넣어 주세요.');
  }

  return reply(true, '연결되었습니다. 이 주소를 앱 설정에 넣으세요.', {
    sheet_file: fileName,
    sheets: kinds,
    secret_set: SECRET !== '여기에-직접-정한-비밀번호를-넣으세요'
  });
}

/** 붙어 있는 시트 파일의 이름. 붙어 있지 않으면 빈 문자열 */
function findSpreadsheetName() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss ? ss.getName() : '';
  } catch (e) {
    return '';
  }
}

/** 시트를 찾고, 없으면 제목줄과 함께 새로 만든다 */
function getSheet(layout) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('시트에 연결되어 있지 않습니다. ' +
      '구글 시트의 확장 프로그램 → Apps Script 에서 만든 스크립트여야 합니다.');
  }
  var sheet = ss.getSheetByName(layout.sheet);

  if (!sheet) {
    sheet = ss.insertSheet(layout.sheet);
  }
  if (AUTO_HEADER && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, layout.columns.length).setValues([layout.columns]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, layout.columns.length).setFontWeight('bold');
  }
  return sheet;
}

/** 정해진 열 순서대로 값을 늘어놓는다. 없는 값은 빈칸으로 둔다. */
function buildRow(columns, rec) {
  var row = [];
  for (var i = 0; i < columns.length; i++) {
    var v = rec[columns[i]];
    row.push(v === undefined || v === null ? '' : String(v));
  }
  return row;
}

/** 앱에게 결과를 돌려준다 */
function reply(ok, message, data) {
  var payload = { ok: ok, message: message };
  if (data) payload.data = data;
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
