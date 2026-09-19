# 강호기행 Tampermonkey Scripts

이 저장소는 《강호기행》 ChatGPT 무협 텍스트 RPG용 Tampermonkey 스크립트의 공개 배포 저장소입니다.

## 현재 최신 버전

1. Core Lite v2.2 — `wuxia-rpg-core.user.js`
2. 세션 컨트롤러 v1.4 — `wuxia-rpg-session.user.js`
3. 통합 UI Lite v2.7 — `wuxia-rpg-ui.user.js`
4. 대상 정보창 Lite v2.3 — `wuxia-rpg-target.user.js`
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

## 이후 업데이트

각 스크립트에는 이 저장소의 Raw 파일을 가리키는 `@updateURL`과 `@downloadURL`이 포함되어 있습니다.

GitHub 코드 수정 시 반드시 해당 스크립트의 `@version`도 올립니다.
Tampermonkey가 새 버전을 확인하면 업데이트를 설치하고, 이후 ChatGPT 페이지 새로고침 시 새 코드가 실행됩니다.
