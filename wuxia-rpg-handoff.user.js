// ==UserScript==
// @name         무협 RPG 새 채팅 이어하기 v1.3
// @namespace    wuxia-rpg-handoff
// @version      1.3
// @description  저부하 인계 - 현재 세이브/현지인물/장기기억/최근대화/연동규약을 새 ChatGPT 채팅으로 전달
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-handoff.user.js
// @downloadURL  https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-handoff.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SESSION_KEY = 'wuxia_rpg_session_v1';
    const PLAYER_KEY = 'wuxia_rpg_status_v2';
    const TARGET_KEY = 'wuxia_rpg_target_v1';
    const ENEMY_KEY = 'wuxia_rpg_enemy_v2';
    const LOCAL_NPCS_KEY = 'wuxia_rpg_local_npcs_v1';
    const MEMORY_KEY = 'wuxia_rpg_ai_memory_v1';

    const PENDING_KEY = 'wuxia_rpg_handoff_pending_v3';
    const LAST_HANDOFF_KEY = 'wuxia_rpg_last_handoff_v3';

    const ROOT_ID = 'wuxia-handoff-v13';
    const STYLE_ID = 'wuxia-handoff-style-v13';

    const MAX_RECENT_MESSAGES = 10;
    const MAX_MESSAGE_CHARS = 4500;
    const PENDING_TTL = 20 * 60 * 1000;

    const PROTOCOL = {
        project:
            '《강호기행》 무협 텍스트 RPG',

        scripts: [
            '무협 RPG Core Lite v2.1',
            '무협 RPG 대상 정보창 Lite v2.2',
            '무협 RPG 세션 컨트롤러 v1.4',
            '무협 RPG 초상화 UI Lite v2.1',
            '무협 RPG 통합 UI Lite v2.4',
            '무협 RPG 새 채팅 이어하기 v1.3'
        ],

        tags: {
            RPGSTATE:
                '플레이어 상태 → wuxia_rpg_status_v2. 객체 deep merge, 배열은 통째 교체.',

            RPGTARGET:
                '현재 NPC/적 대상 → wuxia_rpg_target_v1.',

            RPGENEMY:
                '전투 적 목록 → wuxia_rpg_enemy_v2. 전투 종료 시 active:false.',

            RPGLOCALNPCS:
                '현재 지역 주요 인물 → wuxia_rpg_local_npcs_v1.',

            RPGSESSION:
                '세션 상태 → wuxia_rpg_session_v1. active:false=로그아웃 / active:true=플레이 중.',

            RPGMEMORY:
                '장기 서사/설정 기억 → wuxia_rpg_ai_memory_v1.'
        },

        important: [
            '모든 숨은 RPG 태그는 Core Lite v2.1 한 개만 채팅 DOM에서 읽는다.',
            '현지 인물 동기화 Lite v1.0은 비활성화한다.',
            '플레이 상태가 바뀔 때만 필요한 태그를 답변 하단에 출력한다.',
            'RPGSTATE 배열 필드는 부분 배열로 덮어쓰지 않는다.',
            '게임 서술과 UI 상태를 항상 일치시킨다.',
            '입력 첫 글자가 !이면 GM/시스템 메타 지시다.',
            '게임 본문에서 랜덤 인카운터/판정 테이블 같은 메타 표현을 노출하지 않는다.'
        ]
    };

    const DESIGN = {
        tutorial: [
            '청명은 본편 고정 주인공이 아니라 튜토리얼/시스템 검증용 캐릭터다.',
            '청명 튜토리얼 세이브와 본편 세이브는 분리한다.'
        ],

        roster: [
            '현재 제작 완료된 12명을 초기 고정 로스터로 사용한다.',
            '주요 네임드를 필요 없이 계속 추가하지 않는다.',
            '임시 NPC가 중요한 관계/사건을 만들면 정식 NPC 승격 가능.',
            'NPC 이름과 portraitKey 표기를 일관되게 유지한다.'
        ],

        destiny: [
            '캐릭터 생성에는 천명 성향 5특성 시스템이 있다.',
            '천명 성향은 실제 수치/관계/세계 반응에 영향을 준다.',
            '사악함 예시: 수련점 +2, 시작 악명 +30.',
            '계산적 예시: 수련점 +2, 정파 무인 친밀도 증가량 0.5배.'
        ],

        reputation: [
            '명성/악명은 세계 반응의 핵심 변수다.',
            '도시 진입 시 명성/악명/경지/세력/원한/현상금/최근 사건 등에 따라 자연스러운 사건이 발생할 수 있다.',
            '면식 없는 인물 접근, 비무, 의뢰, 검문, 현상금 사냥꾼, 살수 등이 가능하다.',
            '살수는 반드시 실제 배후/원한/현상금/세력 명령 등의 원인이 있어야 한다.',
            '같은 도시 반복 출입 파밍 방지용 쿨다운/중복 방지를 적용한다.'
        ],

        portraits: [
            '초상화는 현재 등장 중이거나 현재 대상으로 잡힌 인물만 표시한다.',
            '로그아웃/대상 해제/장면 전환 뒤 이전 초상화가 남지 않게 한다.'
        ]
    };

    function parse(raw, fallback = null) {
        try {
            return raw
                ? JSON.parse(raw)
                : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function readState(
        key,
        fallback
    ) {
        return parse(
            localStorage.getItem(key),
            fallback
        );
    }

    function saveJSON(
        key,
        value
    ) {
        try {
            localStorage.setItem(
                key,
                JSON.stringify(value)
            );

            return true;
        } catch (error) {
            console.error(
                '[무협 RPG 인계]',
                error
            );

            return false;
        }
    }

    function sanitize(
        value,
        depth = 0
    ) {
        if (
            depth > 14
        ) {
            return '[depth-limit]';
        }

        if (
            value === null ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            return value;
        }

        if (
            typeof value === 'string'
        ) {
            return value.length > 25000
                ? value.slice(0,25000) +
                    '\n...[긴 문자열 생략]'
                : value;
        }

        if (
            Array.isArray(value)
        ) {
            return value.map(
                item =>
                    sanitize(
                        item,
                        depth + 1
                    )
            );
        }

        if (
            typeof value === 'object'
        ) {
            const result = {};

            for (
                const [
                    key,
                    item
                ]
                of Object.entries(value)
            ) {
                if (
                    [
                        'image',
                        'dataUrl',
                        'dataURL',
                        'base64',
                        'blob'
                    ].includes(key)
                ) {
                    continue;
                }

                result[key] =
                    sanitize(
                        item,
                        depth + 1
                    );
            }

            return result;
        }

        return String(value);
    }

    function stripHiddenTags(text) {
        return String(text || '')
            .replace(
                /\[RPGSTATE\][\s\S]*?\[\/RPGSTATE\]/gi,
                ''
            )
            .replace(
                /\[RPGTARGET\][\s\S]*?\[\/RPGTARGET\]/gi,
                ''
            )
            .replace(
                /\[RPGENEMY\][\s\S]*?\[\/RPGENEMY\]/gi,
                ''
            )
            .replace(
                /\[RPGLOCALNPCS\][\s\S]*?\[\/RPGLOCALNPCS\]/gi,
                ''
            )
            .replace(
                /\[RPGSESSION\][\s\S]*?\[\/RPGSESSION\]/gi,
                ''
            )
            .replace(
                /\[RPGMEMORY\][\s\S]*?\[\/RPGMEMORY\]/gi,
                ''
            )
            .trim();
    }

    function collectRecentContext() {
        return Array.from(
            document.querySelectorAll(
                '[data-message-author-role]'
            )
        )
        .slice(-MAX_RECENT_MESSAGES)
        .map(
            node => {
                const role =
                    node.getAttribute(
                        'data-message-author-role'
                    ) || 'unknown';

                let text =
                    stripHiddenTags(
                        node.textContent || ''
                    );

                if (
                    text.length >
                    MAX_MESSAGE_CHARS
                ) {
                    text =
                        text.slice(
                            0,
                            MAX_MESSAGE_CHARS
                        ) +
                        '\n...[이 메시지 일부 생략]';
                }

                return {
                    role,
                    text
                };
            }
        )
        .filter(
            item =>
                item.text
        );
    }

    function buildPacket() {
        return sanitize({
            format:
                'wuxia-chat-handoff',

            version:
                3,

            createdAt:
                new Date()
                    .toISOString(),

            instructions: [
                '이 데이터는 이전 《강호기행》 채팅의 최신 브라우저 세이브와 인계 정보다.',
                'state를 현재 게임 상태의 기준으로 사용한다.',
                '임의로 새 게임을 시작하거나 상태를 초기화하지 않는다.',
                'session.active 상태를 존중한다.',
                'protocol의 Tampermonkey 태그 규약을 이후 답변에서도 계속 사용한다.',
                '게임 상태가 변경될 때 필요한 숨은 태그만 답변 하단에 출력한다.',
                '중요한 장기 사건/관계/설정은 RPGMEMORY로 갱신한다.',
                'recentContext는 인계 직전 대화의 보조 문맥이며 state보다 우선하지 않는다.',
                '인계가 끝나면 게임을 진행하지 말고 "인계 완료"라고만 확인하고 다음 입력을 기다린다.'
            ],

            protocol:
                PROTOCOL,

            design:
                DESIGN,

            state: {
                session:
                    readState(
                        SESSION_KEY,
                        { active: false }
                    ),

                player:
                    readState(
                        PLAYER_KEY,
                        {}
                    ),

                target:
                    readState(
                        TARGET_KEY,
                        { active: false }
                    ),

                enemy:
                    readState(
                        ENEMY_KEY,
                        {
                            active: false,
                            enemies: []
                        }
                    ),

                localNPCs:
                    readState(
                        LOCAL_NPCS_KEY,
                        {
                            active: false,
                            npcs: []
                        }
                    ),

                memory:
                    readState(
                        MEMORY_KEY,
                        {}
                    )
            },

            recentContext:
                collectRecentContext()
        });
    }

    function makeHandoffText(
        packet
    ) {
        return `이전 《강호기행》 무협 텍스트 RPG 채팅에서 자동 생성된 인계 데이터야.

아래 데이터를 읽고 이전 채팅의 게임 상태, 서사 기억, Tampermonkey 연동 규약을 이어받아.

임의로 새 게임을 시작하거나 저장 상태를 초기화하지 마.

인계가 끝났으면 게임을 진행하지 말고 간단히 "인계 완료"라고 확인한 뒤 내 다음 입력을 기다려.

[WUXIA_HANDOFF]
${JSON.stringify(packet, null, 2)}
[/WUXIA_HANDOFF]`;
    }

    function setComposerText(text) {
        const textarea =
            document.querySelector(
                'textarea#prompt-textarea'
            );

        if (textarea) {
            textarea.focus();
            textarea.value = text;

            textarea.dispatchEvent(
                new Event(
                    'input',
                    { bubbles: true }
                )
            );

            return true;
        }

        const editable =
            document.querySelector(
                '#prompt-textarea[contenteditable="true"], div[contenteditable="true"]#prompt-textarea'
            );

        if (editable) {
            editable.focus();
            editable.innerHTML = '';

            const p =
                document.createElement(
                    'p'
                );

            p.textContent = text;

            editable.appendChild(p);

            editable.dispatchEvent(
                new InputEvent(
                    'input',
                    {
                        bubbles: true,
                        inputType:
                            'insertText',
                        data: text
                    }
                )
            );

            return true;
        }

        return false;
    }

    function toast(message) {
        const id =
            'wuxia-handoff-toast-v13';

        let el =
            document.getElementById(
                id
            );

        if (!el) {
            el =
                document.createElement(
                    'div'
                );

            el.id = id;

            el.style.cssText =
                'position:fixed;left:50%;bottom:42px;transform:translateX(-50%);z-index:2147483647;background:#15151b;color:#fff;padding:10px 14px;border:1px solid #ffffff22;border-radius:10px;font:12px system-ui;box-shadow:0 8px 28px #0009;max-width:80vw;text-align:center';

            document.body
                .appendChild(el);
        }

        el.textContent =
            message;

        clearTimeout(
            toast._timer
        );

        toast._timer =
            setTimeout(
                () =>
                    el.remove(),
                3800
            );
    }

    async function copyText(text) {
        try {
            await navigator.clipboard
                .writeText(text);

            return true;
        } catch (_) {
            try {
                const ta =
                    document.createElement(
                        'textarea'
                    );

                ta.value = text;
                ta.style.cssText =
                    'position:fixed;opacity:0;pointer-events:none';

                document.body
                    .appendChild(ta);

                ta.select();

                const okay =
                    document.execCommand(
                        'copy'
                    );

                ta.remove();

                return okay;
            } catch (_) {
                return false;
            }
        }
    }

    function makeNonce() {
        return (
            Date.now()
                .toString(36) +
            '-' +
            Math.random()
                .toString(36)
                .slice(2,10)
        );
    }

    async function startHandoff() {
        const packet =
            buildPacket();

        const text =
            makeHandoffText(
                packet
            );

        const nonce =
            makeNonce();

        const pending = {
            nonce,
            createdAt:
                Date.now(),
            sourceHref:
                location.href,
            sourcePath:
                location.pathname,
            text
        };

        if (
            !saveJSON(
                PENDING_KEY,
                pending
            )
        ) {
            toast(
                '인계 데이터 저장에 실패했어.'
            );

            return;
        }

        saveJSON(
            LAST_HANDOFF_KEY,
            {
                createdAt:
                    new Date()
                        .toISOString(),

                playerName:
                    packet.state
                        ?.player
                        ?.name || '',

                playerRevision:
                    packet.state
                        ?.player
                        ?.meta
                        ?.revision ?? null,

                sessionActive:
                    packet.state
                        ?.session
                        ?.active ?? false
            }
        );

        const copied =
            await copyText(
                text
            );

        const url =
            `https://chatgpt.com/?wuxia_handoff=${encodeURIComponent(nonce)}`;

        const opened =
            window.open(
                url,
                '_blank'
            );

        if (opened) {
            toast(
                copied
                    ? '새 채팅을 열었어. 자동 입력 후 전송만 하면 돼. 실패하면 Ctrl+V.'
                    : '새 채팅을 열었어. 인계문 자동 입력을 시도할게.'
            );
        } else {
            toast(
                copied
                    ? '팝업이 막혔어. 새 채팅을 직접 연 뒤 Ctrl+V 해줘.'
                    : '팝업 허용 후 다시 눌러줘.'
            );
        }
    }

    function cleanQuery() {
        try {
            const url =
                new URL(
                    location.href
                );

            url.searchParams
                .delete(
                    'wuxia_handoff'
                );

            history.replaceState(
                {},
                '',
                url.pathname +
                url.search +
                url.hash
            );
        } catch (_) {}
    }

    let injectTimer =
        null;

    let injectDeadline =
        0;

    function tryInjectPending() {
        const pending =
            readState(
                PENDING_KEY,
                null
            );

        if (
            !pending?.nonce ||
            !pending?.text
        ) {
            return true;
        }

        if (
            Date.now() -
            Number(
                pending.createdAt || 0
            ) >
            PENDING_TTL
        ) {
            localStorage.removeItem(
                PENDING_KEY
            );

            return true;
        }

        const queryNonce =
            new URLSearchParams(
                location.search
            )
            .get(
                'wuxia_handoff'
            );

        const sameSource =
            location.href ===
                pending.sourceHref
            ||
            (
                location.pathname ===
                    pending.sourcePath &&
                !queryNonce
            );

        if (sameSource) {
            return true;
        }

        if (
            queryNonce &&
            queryNonce !==
                pending.nonce
        ) {
            return true;
        }

        if (
            setComposerText(
                pending.text
            )
        ) {
            localStorage.removeItem(
                PENDING_KEY
            );

            cleanQuery();

            toast(
                '《강호기행》 인계문 입력 완료. 전송만 하면 돼.'
            );

            return true;
        }

        return false;
    }

    function beginPendingInjection() {
        clearTimeout(
            injectTimer
        );

        injectDeadline =
            Date.now() +
            30000;

        function attempt() {
            if (
                tryInjectPending()
            ) {
                return;
            }

            if (
                Date.now() >
                injectDeadline
            ) {
                toast(
                    '자동 입력을 못했어. 클립보드의 인계문을 Ctrl+V 해줘.'
                );

                return;
            }

            injectTimer =
                setTimeout(
                    attempt,
                    500
                );
        }

        attempt();
    }

    function installStyle() {
        document
            .getElementById(
                STYLE_ID
            )
            ?.remove();

        const style =
            document.createElement(
                'style'
            );

        style.id =
            STYLE_ID;

        style.textContent = `

#${ROOT_ID}{
position:fixed!important;
left:14px!important;
right:auto!important;
top:auto!important;
bottom:14px!important;
z-index:2147483647!important;
display:block!important;
visibility:visible!important;
pointer-events:auto!important;
font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important
}

#${ROOT_ID} button{
height:38px!important;
padding:0 11px!important;
border:1px solid rgba(190,140,255,.42)!important;
border-radius:9px!important;
background:rgba(39,27,55,.96)!important;
color:#e2c8ff!important;
box-shadow:0 7px 20px rgba(0,0,0,.45)!important;
font-size:11px!important;
font-weight:900!important;
cursor:pointer!important
}

#${ROOT_ID} button:hover{
background:rgba(89,55,128,.98)!important
}

`;

        document.head
            .appendChild(
                style
            );
    }

    function createUI() {
        if (
            document.getElementById(
                ROOT_ID
            )
        ) {
            return;
        }

        [
            'wuxia-handoff-bridge-v10',
            'wuxia-handoff-bridge-v11',
            'wuxia-handoff-v12'
        ]
        .forEach(
            id =>
                document
                    .getElementById(id)
                    ?.remove()
        );

        const root =
            document.createElement(
                'div'
            );

        root.id =
            ROOT_ID;

        root.innerHTML = `
<button
    type="button"
    title="현재 상태를 새 ChatGPT 채팅으로 인계"
>
    ↗ 새 채팅 이어하기
</button>
`;

        root.querySelector(
            'button'
        )
        .addEventListener(
            'click',
            startHandoff
        );

        document.body
            .appendChild(root);
    }

    function ensureUI() {
        if (
            !document.getElementById(
                ROOT_ID
            )
        ) {
            createUI();
        }
    }

    function init() {
        if (!document.body) {
            setTimeout(
                init,
                250
            );

            return;
        }

        installStyle();
        createUI();

        /*
         * 평소에는 채팅 DOM을 전혀 스캔하지 않는다.
         * RPGMEMORY 저장도 Core v2.1이 담당한다.
         */
        if (
            new URLSearchParams(
                location.search
            )
            .has(
                'wuxia_handoff'
            )
            ||
            readState(
                PENDING_KEY,
                null
            )
        ) {
            beginPendingInjection();
        }

        window.addEventListener(
            'pageshow',
            () => {
                ensureUI();

                if (
                    readState(
                        PENDING_KEY,
                        null
                    )
                ) {
                    beginPendingInjection();
                }
            }
        );

        window.addEventListener(
            'popstate',
            () =>
                setTimeout(
                    () => {
                        ensureUI();

                        if (
                            readState(
                                PENDING_KEY,
                                null
                            )
                        ) {
                            beginPendingInjection();
                        }
                    },
                    50
                )
        );

        /*
         * 버튼 DOM 복구만 15초에 한 번.
         * 메시지/상태는 읽지 않는다.
         */
        setInterval(
            ensureUI,
            15000
        );

        console.log(
            '[무협 RPG] 새 채팅 이어하기 v1.3 · 저부하'
        );
    }

    init();

})();