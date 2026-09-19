# 강호기행 Tampermonkey Scripts

이 저장소는 《강호기행》 ChatGPT 무협 텍스트 RPG용 Tampermonkey 스크립트의 공개 배포 저장소입니다.

## 현재 최신 버전

1. Core Lite v2.3 — `wuxia-rpg-core.user.js`
2. 세션 컨트롤러 v1.6 — `wuxia-rpg-session.user.js`
3. 통합 UI Lite v2.9 — `wuxia-rpg-ui.user.js`
4. 대상 정보창 Lite v2.4 — `wuxia-rpg-target.user.js`
5. 초상화 UI Lite v2.2 — `wuxia-rpg-portrait.user.js`
6. 새 채팅 이어하기 v1.3 — `wuxia-rpg-handoff.user.js`

## 최초 설치

아래 Raw 주소를 하나씩 열고 Tampermonkey에 설치합니다.

- https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-core.user.js
- https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-session.user.js
- https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-ui.user.js
- https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-target.user.js
- https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-portrait.user.js
- https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-handoff.user.js

설치 후 ChatGPT 페이지를 새로고침합니다.

세션 컨트롤러 v1.6은 `새로하기`를 누르면 전체 부트스트랩 프롬프트와 `새게임 시작하기 / 프롬프트 복사 / 취소`를 먼저 표시합니다. `새게임 시작하기`를 눌러도 자동 전송하지 않고 ChatGPT 입력창에만 채웁니다. 기존 런처 드래그, 이어하기, 로그아웃, 캐릭터 슬롯과 백업 기능은 유지됩니다.

통합 UI v2.8과 대상 정보창 v2.4는 쌍수를 성인 교제 관계의 실제 성관계 이벤트로 요청하되 장면은 fade-to-black으로만 처리합니다. 관계 탭에서는 성인 확인과 교제 상태가 있는 NPC에게만 `쌍수 제안`을 표시하며, 같은 장소·호감 80·신뢰 70·엔진 허용·안전하고 사적인 장소·72시간 쿨다운 조건이 충족되어야 입력창에 제안 프롬프트를 채웁니다. Core v2.3은 이 판정에 필요한 성인 확인·행동 허용·장소·쿨다운 필드를 관계 기록에 보존합니다.

통합 UI v2.9은 지도 별표를 저장된 `map.currentNode`에만 의존하지 않고 최신 `player.location`에서 지역 노드를 다시 판별한다. 같은 지역 안의 객잔/광장 이동은 별표 위치는 유지하되 현재 위치 문구가 즉시 바뀌고, 다른 지역으로 이동하면 별표도 새 지역으로 이동한다.

## 이후 업데이트

각 스크립트에는 이 저장소의 Raw 파일을 가리키는 `@updateURL`과 `@downloadURL`이 포함되어 있습니다.

GitHub 코드 수정 시 반드시 해당 스크립트의 `@version`도 올립니다.
Tampermonkey가 새 버전을 확인하면 업데이트를 설치하고, 이후 ChatGPT 페이지 새로고침 시 새 코드가 실행됩니다.

즉시 확인하려면 Tampermonkey 메뉴에서 사용자 스크립트 업데이트 확인을 실행한 뒤 ChatGPT를 새로고침합니다.
