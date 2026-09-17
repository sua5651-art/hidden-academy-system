// 가짜 AI 서버: 일부러 "입력에 없는 사실"을 섞어서 응답한다.
const http = require('http');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const fabricated = {
      today: '오늘은 능률(김) 3과 본문 1~2문단 해석과 관계대명사 which 정리를 진행했습니다.',
      // ↓ 아래는 선생님이 입력하지 않은 내용 (점수 95점, 교재 Reading Tutor, 태도 평가)
      state: '단어 시험에서 95점을 받았으며 Reading Tutor 교재도 병행했습니다. 수업 태도가 매우 성실했습니다.',
      improve: 'which와 that 구분 문제 10문항 추가 연습이 필요합니다.',
      homework: '워크북 p.42~45와 단어 3과 1~40번 암기입니다.',
      notice: '다음 주 서해고 중간고사 범위 확인 부탁드립니다.'
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(fabricated) }] }));
  });
}).listen(8901, () => console.log('mock AI on 8901'));
