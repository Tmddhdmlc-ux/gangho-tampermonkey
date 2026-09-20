# 강호기행 Tampermonkey Scripts

이 저장소는 《강호기행》 ChatGPT 무협 텍스트 RPG용 Tampermonkey 스크립트의 공개 배포 저장소입니다.

## 현재 최신 버전

1. Core Lite v2.3 — `wuxia-rpg-core.user.js`
2. 세션 컨트롤러 v1.7 — `wuxia-rpg-session.user.js`
3. 통합 UI Lite v2.12 — `wuxia-rpg-ui.user.js`
4. 대상 정보창 Lite v2.7 — `wuxia-rpg-target.user.js`
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

세션 컨트롤러 v1.7은 `새로하기`를 누르면 전체 부트스트랩 프롬프트와 `새게임 시작하기 / 프롬프트 복사 / 취소`를 먼저 표시합니다. `새게임 시작하기`를 눌러도 자동 전송하지 않고 ChatGPT 입력창에만 채웁니다. 기존 런처 드래그, 이어하기, 로그아웃, 캐릭터 슬롯과 백업 기능은 유지됩니다.

통합 UI v2.8과 대상 정보창 v2.4는 쌍수를 성인 교제 관계의 실제 성관계 이벤트로 요청하되 장면은 fade-to-black으로만 처리합니다. 관계 탭에서는 성인 확인과 교제 상태가 있는 NPC에게만 `쌍수 제안`을 표시하며, 같은 장소·호감 80·신뢰 70·엔진 허용·안전하고 사적인 장소·72시간 쿨다운 조건이 충족되어야 입력창에 제안 프롬프트를 채웁니다. Core v2.3은 이 판정에 필요한 성인 확인·행동 허용·장소·쿨다운 필드를 관계 기록에 보존합니다.

통합 UI v2.9은 지도 별표를 저장된 `map.currentNode`에만 의존하지 않고 최신 `player.location`에서 지역 노드를 다시 판별한다. 같은 지역 안의 객잔/광장 이동은 별표 위치는 유지하되 현재 위치 문구가 즉시 바뀌고, 다른 지역으로 이동하면 별표도 새 지역으로 이동한다.

통합 UI v2.10과 대상 정보창 v2.5는 미접촉 NPC의 상세보기에도 `publicRelationships`를 전달·표시한다. 사회적으로 공개된 연인/약혼/배우자 관계는 면식 여부와 무관하게 보이며, 비밀 관계는 엔진이 발견 상태로 보내기 전까지 숨긴다.

대상 정보창 v2.6은 상대 무기 스탯을 공격력/근력/민첩/지능/체질/내공의 한글명으로 표시하고, 별도 장비 섹션을 제거한다. 이 게임의 장착 장비는 주무기 1개만 사용한다. 또한 관계 공개 이유 같은 시스템 설명은 '관찰'에 표시하지 않고 실제 관찰 문구가 있을 때만 관찰 섹션을 보여준다.

대상 정보창 v2.7은 관계 공개단계에서 전달된 실제 무기·장비·무공·소지품뿐 아니라 수련법과 귀중품도 상세 화면에 표시한다. 소지품은 수량이 있으면 ×N으로 표시한다. 전투 상대의 체력·내력은 RPGTARGET/RPGENEMY의 정확한 현재/최대값을 그대로 표시한다.

통합 UI v2.11은 현지/관계 NPC를 대상창으로 열 때 공개된 trainingMethods와 valuables를 함께 전달한다. 따라서 친밀 관계에서 공개된 실제 수련법·귀중품이 대상 정보창 v2.7에서 사라지지 않는다.

통합 UI v2.12은 행낭 아이템 이름 옆에 보유 수량을 ×N 형식으로 표시하고, 선천패시브 카드의 수치 보정 앞에 '효과' 라벨을 표시한다.

## 이후 업데이트

각 스크립트에는 이 저장소의 Raw 파일을 가리키는 `@updateURL`과 `@downloadURL`이 포함되어 있습니다.

GitHub 코드 수정 시 반드시 해당 스크립트의 `@version`도 올립니다.
Tampermonkey가 새 버전을 확인하면 업데이트를 설치하고, 이후 ChatGPT 페이지 새로고침 시 새 코드가 실행됩니다.

즉시 확인하려면 Tampermonkey 메뉴에서 사용자 스크립트 업데이트 확인을 실행한 뒤 ChatGPT를 새로고침합니다.
