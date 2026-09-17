#!/usr/bin/env bash
# 전체 테스트 실행기
#   사용법: bash tests/run.sh
#   - 로직 테스트는 node 만 있으면 실행됩니다.
#   - 화면 테스트는 playwright 가 설치돼 있어야 실행됩니다 (없으면 건너뜁니다).
set -u
cd "$(dirname "$0")/.."
FAIL=0

echo "▶ 로직 테스트 (저장·피드백 생성·6원칙 검증)"
node tests/logic.test.js || FAIL=1

echo ""
echo "▶ 숙제 로직 테스트 (기본/당일 숙제 분리·완료·교사확인·문장)"
node tests/homework.test.js || FAIL=1

echo ""
echo "▶ 상담 로직 테스트 (원문/요약 분리·후속조치·확인일·수정이력)"
node tests/counsel.test.js || FAIL=1

echo ""
echo "▶ 내신 로직 테스트 (학교공통/학생별 분리·자동연결·D-day·체크리스트)"
node tests/exam.test.js || FAIL=1

echo ""
echo "▶ 고정 문구 오탐 검사 (앱이 넣는 문구가 경고로 잡히지 않는지)"
node tests/fixed-phrases.test.js || FAIL=1

if node -e "try{require('playwright')}catch(e){try{require('/opt/node22/lib/node_modules/playwright')}catch(e2){process.exit(1)}}" 2>/dev/null; then
  PORT=8899
  npx --yes http-server -p $PORT -s . >/dev/null 2>&1 &
  SRV=$!
  node tests/mock-ai-server.js >/dev/null 2>&1 &
  MOCK=$!
  sleep 2
  echo ""
  echo "▶ 화면 테스트 (실제 브라우저에서 전체 흐름)"
  node tests/ui.test.js || FAIL=1
  echo ""
  echo "▶ 사실 검증 테스트 (AI가 지어낸 내용을 잡아내는지)"
  node tests/ai-guard.test.js || FAIL=1
  echo ""
  echo "▶ 숙제 화면 테스트 (배정 → 완료 체크 → 교사확인 → 문장)"
  node tests/homework-ui.test.js || FAIL=1
  echo ""
  echo "▶ 상담 화면 테스트 (작성 → 요약 → 후속조치 → 수정이력 → 대시보드)"
  node tests/counsel-ui.test.js || FAIL=1
  echo ""
  echo "▶ 내신 화면 테스트 (시험등록 → 자동연결 → 준비체크 → 체크리스트)"
  node tests/exam-ui.test.js || FAIL=1
  kill $SRV $MOCK 2>/dev/null
else
  echo ""
  echo "⏭  playwright 가 없어 화면 테스트를 건너뜁니다 (npm i -D playwright 로 설치)"
fi

echo ""
[ $FAIL -eq 0 ] && echo "✅ 전체 테스트 통과" || echo "❌ 실패한 테스트가 있습니다"
exit $FAIL
