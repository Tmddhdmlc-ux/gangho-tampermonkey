// ==UserScript==
// @name         무협 RPG 대상 정보창 Lite v2.8
// @namespace    wuxia-rpg-target-lite
// @version      2.8
// @description  이벤트형 대상창 - 다중 적 동시 표시/초상화 드래그/원위치/저부하
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-target.user.js
// @downloadURL  https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-target.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const ROOT_ID =
        'wuxia-target-inspector-v20';

    const STYLE_ID =
        'wuxia-target-style-v20';

    const TARGET_KEY =
        'wuxia_rpg_target_v1';

    const ENEMY_KEY =
        'wuxia_rpg_enemy_v2';

    const EXTRA_ENEMY_ROOT_ID =
        'wuxia-enemy-multi-v23';

    const POSITION_KEY =
        'wuxia_rpg_target_position_v2';

    const MODE_KEY =
        'wuxia_rpg_target_uimode_v1';

    let target =
        readTarget();

    let enemyState =
        readEnemies();

    let lastRaw =
        localStorage.getItem(
            TARGET_KEY
        ) || '';

    let lastEnemyRaw =
        localStorage.getItem(
            ENEMY_KEY
        ) || '';

    let uiMode =
        localStorage.getItem(
            MODE_KEY
        ) || 'mini';

    let actionMenuOpen =
        false;

    let root =
        null;

    let savedPosition =
        parse(
            localStorage.getItem(
                POSITION_KEY
            ),
            null
        );

    function parse(
        raw,
        fallback = null
    ) {
        try {
            return raw
                ? JSON.parse(raw)
                : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function readTarget() {
        return (
            parse(
                localStorage.getItem(
                    TARGET_KEY
                ),
                {
                    active: false
                }
            ) || {
                active: false
            }
        );
    }

    function readEnemies() {
        return (
            parse(
                localStorage.getItem(
                    ENEMY_KEY
                ),
                {
                    active: false,
                    enemies: []
                }
            ) || {
                active: false,
                enemies: []
            }
        );
    }

    function esc(value) {
        return String(
            value ?? ''
        )
            .replaceAll('&','&amp;')
            .replaceAll('<','&lt;')
            .replaceAll('>','&gt;')
            .replaceAll('"','&quot;')
            .replaceAll("'",'&#039;');
    }

    function pct(value,max) {
        if (
            value == null ||
            max == null ||
            !max
        ) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(
                100,
                Number(value) /
                Number(max) *
                100
            )
        );
    }

    const TARGET_STAT_LABELS = {
        attack: '공격력',
        strength: '근력',
        agility: '민첩',
        intelligence: '지능',
        constitution: '체질',
        innerPower: '내공'
    };


    function gradeClass(grade) {
        switch (
            String(
                grade || ''
            )
        ) {
            case '하급':
                return 'tg-low';

            case '중급':
            case '고급':
                return 'tg-mid';

            case '절정':
                return 'tg-peak';

            case '상승':
                return 'tg-upper';

            case '절세':
                return 'tg-legend';

            default:
                return '';
        }
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
                    {
                        bubbles: true
                    }
                )
            );

            return;
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
        }
    }

    function installStyle() {
        if (
            document.getElementById(
                STYLE_ID
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id =
            STYLE_ID;

        style.textContent = `

.action.locked{
opacity:.34!important;
filter:saturate(.35)!important;
cursor:not-allowed!important;
background:rgba(255,255,255,.025)!important;
border-color:rgba(255,255,255,.07)!important;
color:#888b94!important
}

.action.locked:hover{
background:rgba(255,255,255,.025)!important
}

#${ROOT_ID}{
position:fixed!important;
left:var(--target-left,auto)!important;
right:var(--target-right,18px)!important;
top:var(--target-top,105px)!important;
width:245px!important;
max-height:calc(100vh - 120px)!important;
overflow-y:auto!important;
z-index:2147483500!important;
color:#eef0f4!important;
background:rgba(18,18,24,.985)!important;
border:1px solid rgba(255,255,255,.14)!important;
border-radius:16px!important;
box-shadow:0 14px 40px rgba(0,0,0,.55)!important;
font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important
}

#${ROOT_ID}[hidden]{display:none!important}
#${ROOT_ID} *{box-sizing:border-box!important}
#${ROOT_ID}.npc-mode{border-color:rgba(90,180,255,.30)!important}
#${ROOT_ID}.enemy-mode{border-color:rgba(255,85,100,.34)!important}

#${ROOT_ID}.mode-collapsed{
width:180px!important;
max-height:185px!important;
overflow:hidden!important
}

#${ROOT_ID}.mode-mini{width:245px!important}
#${ROOT_ID}.mode-full{width:372px!important}

.target-header{
position:relative!important;
padding:11px 12px 10px!important;
padding-right:42px!important;
border-bottom:1px solid rgba(255,255,255,.08)!important;
background:linear-gradient(90deg,rgba(70,110,190,.16),rgba(255,255,255,.01))!important;
border-radius:16px 16px 0 0!important;
user-select:none!important;
touch-action:none!important
}

.target-close{
position:absolute!important;
top:8px!important;
right:9px!important;
width:25px!important;
height:25px!important;
padding:0!important;
display:grid!important;
place-items:center!important;
border:1px solid rgba(255,255,255,.14)!important;
border-radius:8px!important;
background:rgba(0,0,0,.20)!important;
color:#aeb1ba!important;
font-size:18px!important;
font-weight:850!important;
line-height:1!important;
cursor:pointer!important;
touch-action:manipulation!important
}

.target-close:hover{
border-color:rgba(255,105,120,.52)!important;
background:rgba(165,45,60,.22)!important;
color:#ff8f9a!important
}

.target-close:focus-visible{
outline:2px solid rgba(120,185,255,.78)!important;
outline-offset:2px!important
}

.target-head{
display:flex!important;
justify-content:space-between!important;
gap:8px!important
}

.target-name{
font-size:18px!important;
font-weight:1000!important;
white-space:nowrap!important;
overflow:hidden!important;
text-overflow:ellipsis!important
}

.npc-mode .target-name{color:#7bc9ff!important}
.enemy-mode .target-name{color:#ff7b86!important}

.target-sub{
margin-top:3px!important;
color:#b7bbc7!important;
font-size:11px!important;
font-weight:850!important
}

.target-tip{
margin-top:3px!important;
color:#777b87!important;
font-size:9px!important
}

.target-realm{
color:#d09aff!important;
font-size:13px!important;
font-weight:1000!important;
text-align:right!important
}

.target-danger{
margin-top:3px!important;
color:#ffaf66!important;
font-size:11px!important;
font-weight:950!important;
text-align:right!important
}

.mode-buttons{
display:flex!important;
gap:5px!important;
margin-top:9px!important
}

.mode-btn{
flex:1!important;
min-height:29px!important;
border:1px solid rgba(255,255,255,.11)!important;
border-radius:7px!important;
background:rgba(255,255,255,.04)!important;
color:#d7dae2!important;
cursor:pointer!important;
font-size:10px!important;
font-weight:900!important
}

.mode-btn.active{
color:#8fcfff!important;
border-color:rgba(100,170,255,.26)!important;
background:rgba(100,160,255,.12)!important
}

.body{
padding:10px 12px 12px!important
}

.line{
display:flex!important;
justify-content:space-between!important;
gap:10px!important;
margin:6px 0!important;
font-size:13px!important
}

.hp{color:#ff6d77!important;font-weight:950!important}
.qi{color:#63b6ff!important;font-weight:950!important}
.insight{color:#ffd25a!important;font-weight:950!important}

.bar{
height:10px!important;
margin:3px 0 8px!important;
border-radius:999px!important;
overflow:hidden!important;
background:rgba(255,255,255,.09)!important
}

.fill{height:100%!important;border-radius:inherit!important}
.fill-hp{background:linear-gradient(90deg,#9b2832,#ff5868,#ff8c97)!important}
.fill-qi{background:linear-gradient(90deg,#1f5d9e,#369dff,#72c2ff)!important}

.chip{
display:inline-block!important;
margin:4px 4px 0 0!important;
padding:3px 7px!important;
border-radius:999px!important;
border:1px solid rgba(255,255,255,.10)!important;
background:rgba(255,255,255,.045)!important;
font-size:10px!important
}

.actions{
display:grid!important;
grid-template-columns:1fr 1fr!important;
gap:7px!important;
margin-top:8px!important
}

.action{
min-height:38px!important;
padding:7px!important;
border:1px solid rgba(255,255,255,.11)!important;
border-radius:8px!important;
background:rgba(255,255,255,.05)!important;
color:#eeeef2!important;
cursor:pointer!important;
font-size:12px!important;
font-weight:900!important
}

.good{color:#73e39a!important;border-color:rgba(90,220,130,.3)!important}
.warning{color:#ffc76c!important;border-color:rgba(255,190,90,.3)!important}
.danger{color:#ff737e!important;border-color:rgba(255,80,95,.34)!important}
.deadly{color:#ff4554!important;border-color:rgba(255,45,60,.5)!important;background:rgba(155,20,30,.18)!important}

.extra{
margin-top:8px!important;
padding-top:8px!important;
border-top:1px solid rgba(255,255,255,.07)!important
}

.details{
margin-bottom:8px!important;
border:1px solid rgba(255,255,255,.09)!important;
border-radius:10px!important;
overflow:hidden!important;
background:rgba(255,255,255,.03)!important
}

.details summary{
padding:10px!important;
cursor:pointer!important;
font-size:12px!important;
font-weight:950!important;
color:#d7dae2!important
}

.details-body{
padding:10px!important;
border-top:1px solid rgba(255,255,255,.07)!important;
font-size:12px!important;
line-height:1.6!important
}

.tg-low{color:#f5f5f5!important;font-weight:900!important}
.tg-mid{color:#62df83!important;font-weight:900!important}
.tg-peak{color:#5ba8ff!important;font-weight:900!important}
.tg-upper{color:#bd7dff!important;font-weight:950!important}
.tg-legend{color:#ff5564!important;font-weight:1000!important}


.mode-btn.reset{
color:#ffd36c!important
}

#wuxia-portrait-ui-v20 .p-target{
cursor:grab!important;
touch-action:none!important;
user-select:none!important
}

#wuxia-portrait-ui-v20 .p-target.wuxia-target-dragging{
cursor:grabbing!important
}

#wuxia-portrait-ui-v20 .p-target img{
-webkit-user-drag:none!important;
user-select:none!important
}


#${EXTRA_ENEMY_ROOT_ID}{
position:fixed!important;
z-index:2147483495!important;
display:flex!important;
flex-direction:column!important;
gap:8px!important;
width:225px!important;
pointer-events:auto!important;
font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important
}

#${EXTRA_ENEMY_ROOT_ID}[hidden]{display:none!important}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-card{
width:225px!important;
padding:10px 11px!important;
color:#eef0f4!important;
background:rgba(18,18,24,.985)!important;
border:1px solid rgba(255,85,100,.34)!important;
border-radius:14px!important;
box-shadow:0 10px 30px rgba(0,0,0,.48)!important;
cursor:pointer!important;
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-card:hover{
border-color:rgba(255,105,120,.58)!important;
background:rgba(30,20,25,.99)!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-head{
display:flex!important;
justify-content:space-between!important;
gap:8px!important;
margin-bottom:5px!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-name{
color:#ff7b86!important;
font-size:15px!important;
font-weight:1000!important;
white-space:nowrap!important;
overflow:hidden!important;
text-overflow:ellipsis!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-realm{
color:#d09aff!important;
font-size:11px!important;
font-weight:950!important;
text-align:right!important;
white-space:nowrap!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-faction{
margin-bottom:6px!important;
color:#b7bbc7!important;
font-size:10px!important;
font-weight:850!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-line{
display:flex!important;
justify-content:space-between!important;
gap:8px!important;
margin:4px 0!important;
font-size:11px!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-bar{
height:8px!important;
margin:2px 0 6px!important;
border-radius:999px!important;
overflow:hidden!important;
background:rgba(255,255,255,.09)!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-fill{
height:100%!important;
border-radius:inherit!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-fill.hp{
background:linear-gradient(90deg,#9b2832,#ff5868,#ff8c97)!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-fill.qi{
background:linear-gradient(90deg,#1f5d9e,#369dff,#72c2ff)!important
}

#${EXTRA_ENEMY_ROOT_ID} .enemy-extra-tip{
margin-top:5px!important;
color:#777b87!important;
font-size:9px!important;
text-align:right!important
}

`;

        document.head.appendChild(
            style
        );
    }

    function clampPosition(
        left,
        top
    ) {
        if (!root) {
            return {
                left,
                top
            };
        }

        const rect =
            root.getBoundingClientRect();

        return {
            left:
                Math.max(
                    5,
                    Math.min(
                        left,
                        window.innerWidth -
                        rect.width -
                        5
                    )
                ),

            top:
                Math.max(
                    5,
                    Math.min(
                        top,
                        window.innerHeight -
                        Math.min(
                            rect.height,
                            window.innerHeight - 10
                        ) -
                        5
                    )
                )
        };
    }

    function applyPosition() {
        if (!root) return;

        if (
            savedPosition &&
            Number.isFinite(
                savedPosition.left
            )
        ) {
            const pos =
                clampPosition(
                    savedPosition.left,
                    savedPosition.top
                );

            savedPosition = pos;

            root.style.setProperty(
                '--target-left',
                `${pos.left}px`
            );

            root.style.setProperty(
                '--target-right',
                'auto'
            );

            root.style.setProperty(
                '--target-top',
                `${pos.top}px`
            );
        } else {
            root.style.setProperty(
                '--target-left',
                'auto'
            );

            root.style.setProperty(
                '--target-right',
                '18px'
            );

            root.style.setProperty(
                '--target-top',
                '105px'
            );
        }
    }


    function resetTargetPosition() {
        savedPosition =
            null;

        localStorage.removeItem(
            POSITION_KEY
        );

        applyPosition();

        bindExternalPortrait();

        window.dispatchEvent(
            new CustomEvent(
                'wuxia:target-layout'
            )
        );
    }


    function consumeUICommand() {
        const command =
            target?.uiCommand;

        if (!command) {
            return false;
        }

        switch (command) {
            case 'reset-position':
            case 'home':
                resetTargetPosition();
                break;

            case 'collapsed':
            case 'collapse':
                uiMode = 'collapsed';
                localStorage.setItem(
                    MODE_KEY,
                    uiMode
                );
                break;

            case 'mini':
                uiMode = 'mini';
                localStorage.setItem(
                    MODE_KEY,
                    uiMode
                );
                break;

            case 'full':
            case 'detail':
                uiMode = 'full';
                localStorage.setItem(
                    MODE_KEY,
                    uiMode
                );
                break;

            case 'close':
                target = {
                    ...target,
                    active: false
                };
                break;
        }

        target = {
            ...target
        };

        delete target.uiCommand;

        const cleanedRaw =
            JSON.stringify(
                target
            );

        localStorage.setItem(
            TARGET_KEY,
            cleanedRaw
        );

        lastRaw =
            cleanedRaw;

        return true;
    }


    function bindExternalPortrait() {
        const card =
            document.querySelector(
                '#wuxia-portrait-ui-v20 .p-target'
            );

        if (
            !card ||
            card.dataset.wuxiaTargetDrag ===
                '1'
        ) {
            return;
        }

        card.dataset.wuxiaTargetDrag =
            '1';

        let dragging = false;
        let pointerId = null;
        let sx = 0;
        let sy = 0;
        let sl = 0;
        let st = 0;

        card.addEventListener(
            'dragstart',
            event =>
                event.preventDefault()
        );

        card.addEventListener(
            'pointerdown',
            event => {
                if (
                    event.button !== 0 ||
                    !root ||
                    root.hidden
                ) {
                    return;
                }

                const rect =
                    root.getBoundingClientRect();

                dragging = true;
                pointerId = event.pointerId;
                sx = event.clientX;
                sy = event.clientY;
                sl = rect.left;
                st = rect.top;

                card.classList.add(
                    'wuxia-target-dragging'
                );

                try {
                    card.setPointerCapture(
                        pointerId
                    );
                } catch (_) {}

                event.preventDefault();
            }
        );

        card.addEventListener(
            'pointermove',
            event => {
                if (
                    !dragging ||
                    event.pointerId !==
                        pointerId
                ) {
                    return;
                }

                const dx =
                    event.clientX -
                    sx;

                const dy =
                    event.clientY -
                    sy;

                if (
                    Math.hypot(
                        dx,
                        dy
                    ) < 3
                ) {
                    return;
                }

                savedPosition =
                    clampPosition(
                        sl + dx,
                        st + dy
                    );

                applyPosition();

                window.dispatchEvent(
                    new CustomEvent(
                        'wuxia:target-layout'
                    )
                );

                event.preventDefault();
            }
        );

        function finish() {
            if (!dragging) {
                return;
            }

            dragging = false;

            card.classList.remove(
                'wuxia-target-dragging'
            );

            if (savedPosition) {
                localStorage.setItem(
                    POSITION_KEY,
                    JSON.stringify(
                        savedPosition
                    )
                );
            }

            try {
                card.releasePointerCapture(
                    pointerId
                );
            } catch (_) {}

            pointerId = null;

            window.dispatchEvent(
                new CustomEvent(
                    'wuxia:target-layout'
                )
            );
        }

        card.addEventListener(
            'pointerup',
            finish
        );

        card.addEventListener(
            'pointercancel',
            finish
        );
    }


    function installDrag(handle) {
        let timer = null;
        let dragging = false;

        let sx = 0;
        let sy = 0;

        let sl = 0;
        let st = 0;

        handle.addEventListener(
            'pointerdown',
            event => {
                if (
                    event.target.closest(
                        '[data-close-target]'
                    )
                ) {
                    return;
                }

                sx = event.clientX;
                sy = event.clientY;

                const rect =
                    root.getBoundingClientRect();

                sl = rect.left;
                st = rect.top;

                timer =
                    setTimeout(
                        () => {
                            dragging = true;

                            try {
                                handle.setPointerCapture(
                                    event.pointerId
                                );
                            } catch (_) {}
                        },
                        450
                    );
            }
        );

        handle.addEventListener(
            'pointermove',
            event => {
                if (!dragging) return;

                savedPosition =
                    clampPosition(
                        sl +
                        event.clientX -
                        sx,

                        st +
                        event.clientY -
                        sy
                    );

                applyPosition();

                window.dispatchEvent(
                    new CustomEvent(
                        'wuxia:target-layout'
                    )
                );
            }
        );

        function finish() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }

            if (!dragging) return;

            dragging = false;

            localStorage.setItem(
                POSITION_KEY,
                JSON.stringify(
                    savedPosition
                )
            );

            window.dispatchEvent(
                new CustomEvent(
                    'wuxia:target-layout'
                )
            );
        }

        handle.addEventListener(
            'pointerup',
            finish
        );

        handle.addEventListener(
            'pointercancel',
            finish
        );
    }

    function bar(
        label,
        value,
        max,
        type
    ) {
        if (
            value == null ||
            max == null
        ) {
            return `
<div class="line"><span>${esc(label)}</span><b>불명</b></div>
`;
        }

        return `
<div class="line">
    <span class="${type}">${esc(label)}</span>
    <b class="${type}">${esc(value)} / ${esc(max)}</b>
</div>
<div class="bar">
    <div class="fill fill-${type}" style="width:${pct(value,max)}%"></div>
</div>
`;
    }

    function getActions() {

    const name =
        target.name ||
        '상대';


    const relation =
        target.relation ||
        {};


    const affinity =
        Number(
            relation.affinity ??
            0
        );


    const trust =
        Number(
            relation.trust ??
            0
        );


    const tags = [
        ...(
            relation.tags ||
            []
        ),
        ...(
            target.tags ||
            []
        )
    ]
    .map(
        String
    );


    const hasTag =
        (...wanted) =>
            wanted.some(
                tag =>
                    tags.includes(
                        tag
                    )
            );


    /*
     * 현지 UI에서
     * 같은 장소인지 넘겨준다.
     *
     * 예전 데이터는
     * canTalk 필드가 없으므로 true 취급.
     */
    const canInteract =
        target.canTalk !==
        false;


    /*
     * NPC별 행동 가능 여부.
     *
     * false를 명시하면 관계가 좋아도
     * 해당 행동은 절대 열리지 않는다.
     */
    const caps =
        target.capabilities ||
        {};


    function capability(
        key,
        fallback = true
    ) {

        if (
            typeof caps[key] ===
            'boolean'
        ) {

            return caps[key];
        }


        return fallback;
    }


    /*
     * 교제/결혼/쌍수는
     * 기본 false.
     *
     * RPG 엔진이 가능한 NPC에게만
     * true를 보내준다.
     */
    const romancePossible =
        target.romanceEligible ===
            true

        ||

        capability(
            'romance',
            false
        );


    const marriagePossible =
        target.marriageEligible ===
            true

        ||

        capability(
            'marriage',
            false
        );


    const dualPossible =
        target.dualCultivationEligible ===
            true

        ||

        capability(
            'dualCultivation',
            false
        );


    const numericAge =
        Number(
            target.age
        );


    const adultConfirmed =
        target.adultConfirmed ===
            true

        ||

        (
            Number.isFinite(
                numericAge
            )

            &&

            numericAge >=
                18
        );


    const romanticPartner =
        hasTag(
            '교제',
            '연인',
            '배우자'
        );


    const safePrivateLocation =
        target.safePrivateLocation ===
            true

        ||

        target.privateLocation ===
            true;


    const cooldownReady =
        target.dualCultivationCooldownActive !==
            true

        &&

        target.dualCultivationCooldownReady !==
            false;


    function action(
        label,
        text,
        enabled = true,
        reason = '',
        tone = ''
    ) {

        return {
            label,
            text,
            enabled,
            reason,
            tone
        };
    }


    function minRelation(
        needAffinity,
        needTrust
    ) {

        return (
            affinity >=
                needAffinity

            &&

            trust >=
                needTrust
        );
    }


    function interactionRequired(
        okay
    ) {

        return (
            canInteract &&
            okay
        );
    }


    /*
     * 현재 관계 방향
     */
    const hostile =
        affinity <=
            -10

        ||

        trust <=
            -10

        ||

        hasTag(
            '적대',
            '원한',
            '숙적',
            '배신'
        );


    const friendly =
        !hostile

        &&

        (
            (
                affinity >=
                    20

                &&

                trust >=
                    10
            )

            ||

            hasTag(
                '우호',
                '친구',
                '동료',
                '사제',
                '연인',
                '배우자'
            )
        );


    // =========================================================
    // 공통 행동
    // =========================================================

    const talk =
        action(

            '이야기',

            `${name}에게 말을 건다`,

            canInteract,

            canInteract
                ? ''
                : '같은 장소에 있지 않음'
        );


    const befriend =
        action(

            '친해지기',

            `${name}에게 친근하게 다가가 대화를 이어간다`,

            interactionRequired(
                affinity >=
                    -9

                &&

                trust >=
                    -10
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : '호감 -9 / 신뢰 -10 이상 필요',

            'good'
        );


    // =========================================================
    // 우호 행동
    // =========================================================

    const trade =
        action(

            '교환',

            `${name}에게 물건 교환을 제안한다`,

            interactionRequired(
                minRelation(
                    10,
                    0
                )

                &&

                capability(
                    'trade',
                    true
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : !capability(
                    'trade',
                    true
                )
                    ? '이 NPC는 교환할 수 없음'
                    : '호감 10 / 신뢰 0 필요',

            'good'
        );


    const companion =
        action(

            '동행 의뢰',

            `${name}에게 함께 동행해 달라고 부탁한다`,

            interactionRequired(
                minRelation(
                    25,
                    20
                )

                &&

                capability(
                    'companion',
                    true
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : !capability(
                    'companion',
                    true
                )
                    ? '현재 동행할 수 없는 인물'
                    : '호감 25 / 신뢰 20 필요',

            'good'
        );


    const training =
        action(

            '수련법 전수',

            `${name}에게 수련법을 전수해 달라고 부탁한다`,

            interactionRequired(
                minRelation(
                    35,
                    40
                )

                &&

                capability(
                    'teachTraining',
                    true
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : !capability(
                    'teachTraining',
                    true
                )
                    ? '전수 가능한 수련법이 없음'
                    : '호감 35 / 신뢰 40 필요',

            'good'
        );


    const martialTeaching =
        action(

            '무공 사사',

            `${name}에게 무공을 사사받을 수 있는지 정중히 청한다`,

            interactionRequired(
                minRelation(
                    45,
                    50
                )

                &&

                capability(
                    'teachMartial',
                    true
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : !capability(
                    'teachMartial',
                    true
                )
                    ? '무공을 전수할 수 없는 인물'
                    : '호감 45 / 신뢰 50 필요',

            'good'
        );


    const dating =
        action(

            '교제',

            `${name}에게 교제를 제안한다`,

            interactionRequired(
                minRelation(
                    55,
                    35
                )

                &&

                romancePossible
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : !romancePossible
                    ? '교제 대상으로 발전할 수 없는 인물'
                    : '호감 55 / 신뢰 35 필요',

            'good'
        );


    const marriage =
        action(

            '결혼',

            `${name}에게 혼인을 청한다`,

            interactionRequired(
                minRelation(
                    80,
                    70
                )

                &&

                marriagePossible

                &&

                hasTag(
                    '연인'
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : !hasTag(
                    '연인'
                )
                    ? '먼저 연인 관계가 되어야 함'
                    : !marriagePossible
                        ? '현재 혼인이 불가능한 인물'
                        : '호감 80 / 신뢰 70 필요',

            'good'
        );


    const dualCultivation =
        action(

            '쌍수',

            `${name}에게 쌍수를 제안한다. 두 사람 모두 성인인지, 교제 관계·호감·신뢰·72시간 쿨다운·안전하고 사적인 장소·상호 동의를 먼저 확인한다. 수락되면 실제 성인 연인 간 성관계 이벤트로 판정하고 기록하되, 단순 합동 명상으로 바꾸지 말고 장면은 fade-to-black으로 처리한다.`,

            interactionRequired(
                minRelation(
                    80,
                    70
                )

                &&

                dualPossible

                &&

                adultConfirmed

                &&

                romanticPartner

                &&

                safePrivateLocation

                &&

                cooldownReady
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : !adultConfirmed
                    ? '성인 여부 확인 필요'
                    : !romanticPartner
                        ? '교제·연인·배우자 관계 필요'
                    : !dualPossible
                        ? '쌍수 제안 조건을 충족하지 않음'
                        : !safePrivateLocation
                            ? '안전하고 사적인 장소 필요'
                            : !cooldownReady
                                ? '72시간 쿨다운 진행 중'
                                : '호감 80 / 신뢰 70 필요',

            'good'
        );


    // =========================================================
    // 적대 행동
    // =========================================================

    const threaten =
        action(

            '협박',

            `${name}을 협박한다`,

            interactionRequired(
                affinity <=
                    -10

                ||

                trust <=
                    -10

                ||

                hasTag(
                    '적대',
                    '원한',
                    '숙적'
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : '호감 또는 신뢰 -10 이하 필요',

            'warning'
        );


    const attack =
        action(

            '공격',

            `${name}을 공격한다`,

            interactionRequired(
                affinity <=
                    -20

                ||

                trust <=
                    -20

                ||

                hasTag(
                    '적대',
                    '원한',
                    '숙적'
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : '호감 또는 신뢰 -20 이하 필요',

            'danger'
        );


    const robbery =
        action(

            '강도',

            `${name}의 돈과 소지품을 강탈하려 한다`,

            interactionRequired(
                affinity <=
                    -35

                ||

                trust <=
                    -30

                ||

                hasTag(
                    '적대',
                    '원한',
                    '숙적'
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : '호감 -35 또는 신뢰 -30 이하 필요',

            'danger'
        );


    const murder =
        action(

            '살해',

            `${name}을 죽이기 위해 공격한다`,

            interactionRequired(
                affinity <=
                    -60

                ||

                trust <=
                    -50

                ||

                hasTag(
                    '원한',
                    '숙적'
                )
            ),

            !canInteract
                ? '같은 장소에 있지 않음'
                : '호감 -60 / 신뢰 -50 수준 또는 원한 관계 필요',

            'deadly'
        );


    // =========================================================
    // 표시 분기
    // =========================================================

    if (
        hostile
    ) {

        return {

            primary: [
                talk,
                threaten
            ],

            extra: [
                attack,
                robbery,
                murder
            ]
        };
    }


    if (
        friendly
    ) {

        return {

            primary: [
                talk,
                trade
            ],

            extra: [
                companion,
                training,
                martialTeaching,
                dating,
                marriage,
                ...(
                    adultConfirmed &&
                    romanticPartner
                        ? [
                            dualCultivation
                        ]
                        : []
                )
            ]
        };
    }


    /*
     * 중립
     */
    return {

        primary: [
            talk,
            befriend
        ],

        extra: [
            trade,
            companion
        ]
    };
}

function actionHTML(
    action,
    index
) {

    const locked =
        action.enabled ===
        false;


    return `
<button
    class="
        action
        ${esc(
            action.tone ||
            ''
        )}
        ${
            locked
                ? 'locked'
                : ''
        }
    "

    data-action="${index}"

    ${
        locked
            ? 'disabled'
            : ''
    }

    title="${esc(
        action.reason ||
        ''
    )}"
>
    ${
        locked
            ? '🔒 '
            : ''
    }

    ${esc(
        action.label
    )}
</button>
`;
}
    function detail(
        title,
        body
    ) {
        return `
<details class="details">
    <summary>${title}</summary>
    <div class="details-body">${body}</div>
</details>
`;
    }



    function ensureExtraEnemyRoot() {
        let host =
            document.getElementById(
                EXTRA_ENEMY_ROOT_ID
            );

        if (!host) {
            host =
                document.createElement(
                    'div'
                );

            host.id =
                EXTRA_ENEMY_ROOT_ID;

            host.hidden = true;

            host.addEventListener(
                'click',
                event => {
                    const card =
                        event.target.closest(
                            '[data-enemy-extra-index]'
                        );

                    if (!card) {
                        return;
                    }

                    const index =
                        Number(
                            card.dataset
                                .enemyExtraIndex
                        );

                    const enemy =
                        host._enemyList?.[index];

                    if (!enemy) {
                        return;
                    }

                    const nextTarget =
                        enemyToTarget(enemy);

                    localStorage.setItem(
                        TARGET_KEY,
                        JSON.stringify(
                            nextTarget
                        )
                    );

                    target = nextTarget;
                    lastRaw =
                        localStorage.getItem(
                            TARGET_KEY
                        ) || '';

                    window.dispatchEvent(
                        new CustomEvent(
                            'wuxia:data-updated',
                            {
                                detail: {
                                    target: true
                                }
                            }
                        )
                    );

                    render();
                }
            );

            document.body.appendChild(
                host
            );
        }

        return host;
    }


    function enemyToTarget(enemy) {
        return {
            active: true,
            mode: 'enemy',
            name: enemy.name || '적',
            faction: enemy.faction || '불명',
            realm: enemy.realm || '불명',
            hp: enemy.hp ?? null,
            maxHp: enemy.maxHp ?? null,
            qi: enemy.qi ?? null,
            maxQi: enemy.maxQi ?? null,
            status: enemy.status || '',
            danger: enemy.danger || '',
            weapon:
                typeof enemy.weapon === 'string'
                    ? { name: enemy.weapon }
                    : enemy.weapon || null,
            martialArts: enemy.martialArts || [],
            inventory: enemy.inventory || [],
            note: enemy.note || '',
            registerRelation: false
        };
    }


    function compactEnemyBar(
        label,
        value,
        max,
        type
    ) {
        if (
            value == null ||
            max == null
        ) {
            return `
<div class="enemy-extra-line">
    <span>${esc(label)}</span>
    <b>불명</b>
</div>
`;
        }

        return `
<div class="enemy-extra-line">
    <span class="${type}">${esc(label)}</span>
    <b class="${type}">${esc(value)} / ${esc(max)}</b>
</div>
<div class="enemy-extra-bar">
    <div
        class="enemy-extra-fill ${type}"
        style="width:${pct(value,max)}%"
    ></div>
</div>
`;
    }


    function layoutExtraEnemies() {
        const host =
            document.getElementById(
                EXTRA_ENEMY_ROOT_ID
            );

        if (
            !host ||
            host.hidden ||
            !root ||
            root.hidden
        ) {
            return;
        }

        const rect =
            root.getBoundingClientRect();

        const gap = 8;
        const width = 225;

        let left =
            rect.left - width - gap;

        if (left < 6) {
            left = Math.min(
                window.innerWidth - width - 6,
                rect.right + gap
            );
        }

        host.style.left =
            `${Math.max(6,left)}px`;

        host.style.top =
            `${Math.max(6,rect.top)}px`;
    }


    function renderExtraEnemies() {
        const host =
            ensureExtraEnemyRoot();

        const all =
            enemyState?.active &&
            Array.isArray(
                enemyState.enemies
            )
                ? enemyState.enemies
                : [];

        if (
            !target.active ||
            target.mode !== 'enemy' ||
            all.length <= 1
        ) {
            host.hidden = true;
            host.innerHTML = '';
            host._enemyList = [];
            return;
        }

        let skippedPrimary = false;

        const extras =
            all.filter(
                enemy => {
                    const same =
                        !skippedPrimary &&
                        enemy.name === target.name;

                    if (same) {
                        skippedPrimary = true;
                        return false;
                    }

                    return true;
                }
            );

        if (!extras.length) {
            host.hidden = true;
            host.innerHTML = '';
            host._enemyList = [];
            return;
        }

        host._enemyList = extras;

        host.innerHTML =
            extras
                .map(
                    (enemy,index) => `
<div
    class="enemy-extra-card"
    data-enemy-extra-index="${index}"
>
    <div class="enemy-extra-head">
        <div class="enemy-extra-name">
            ${esc(enemy.name || '적')}
        </div>
        <div class="enemy-extra-realm">
            ${esc(enemy.realm || '불명')}
        </div>
    </div>

    <div class="enemy-extra-faction">
        소속 · ${esc(enemy.faction || '불명')}
    </div>

    ${compactEnemyBar(
        '체력',
        enemy.hp,
        enemy.maxHp,
        'hp'
    )}

    ${compactEnemyBar(
        '내력',
        enemy.qi,
        enemy.maxQi,
        'qi'
    )}

    <div class="enemy-extra-tip">
        클릭하면 주 대상 전환
    </div>
</div>
`
                )
                .join('');

        host.hidden = false;
        layoutExtraEnemies();
    }

    function renderPublicRelationships() {
        const list =
            Array.isArray(
                target.publicRelationships
            )
                ? target.publicRelationships
                : [];

        if (!list.length) {
            return target.publicRelationshipVerifiedNone === true
                ? '<div class="muted">공개 교제/혼인 관계 없음</div>'
                : '<div class="muted">공개 관계 정보 없음</div>';
        }

        return list
            .map(
                item => {
                    const type =
                        item.relationType ||
                        item.type ||
                        '관계';

                    const partner =
                        item.partnerName ||
                        item.name ||
                        '신원 불명';

                    const meta = [
                        item.partnerFaction ||
                            item.faction ||
                            '',
                        item.partnerTitle ||
                            item.title ||
                            '',
                        item.knownRealm ||
                            item.realm ||
                            ''
                    ]
                    .filter(Boolean)
                    .join(' · ');

                    return `
<div class="line">
    <span>${esc(type)}</span>
    <b>${esc(partner)}</b>
</div>
${meta ? `<div class="muted">${esc(meta)}</div>` : ''}
`;
                }
            )
            .join('');
    }


    function renderFullDetails() {
        const relation =
            target.relation || {};

        const weapon =
            target.weapon;

        const weaponHTML =
            weapon
                ? `
<div class="${gradeClass(weapon.grade)}">
    ${weapon.grade ? `(${esc(weapon.grade)}) ` : ''}${esc(weapon.name || '')}
</div>
<div>
    ${
        Object.entries(
            weapon.stats || {}
        )
        .map(
            ([k,v]) =>
                `<span class="chip">${esc(TARGET_STAT_LABELS[k] || k)} ${Number(v)>0?'+':''}${esc(v)}</span>`
        )
        .join('')
    }
</div>`
                : '확인되지 않음';

        return `
${detail(
    '기본 정보',
    `
<div class="line"><span>소속</span><b>${esc(target.faction || '불명')}</b></div>
${target.role ? `<div class="line"><span>직위</span><b>${esc(target.role)}</b></div>` : ''}
${target.title ? `<div class="line"><span>별호</span><b>${esc(target.title)}</b></div>` : ''}
${target.status ? `<div class="line"><span>상태</span><b>${esc(target.status)}</b></div>` : ''}
`
)}

${
    target.mode !== 'enemy'
        ? detail(
            '관계',
            `
<div>
    ${(relation.tags || ['초면']).map(x=>`<span class="chip">${esc(x)}</span>`).join('')}
</div>
<div class="line"><span>호감</span><b>${esc(relation.affinity ?? 0)}</b></div>
<div class="line"><span>신뢰</span><b>${esc(relation.trust ?? 0)}</b></div>
`
        )
        : ''
}

${detail(
    '공개 교제/혼인',
    renderPublicRelationships()
)}

${detail('무기',weaponHTML)}

${detail(
    `무공 (${target.martialArts?.length || 0})`,
    target.martialArts?.length
        ? target.martialArts
            .map(
                x =>
                    `<div class="${gradeClass(x.grade)}">${x.grade?`(${esc(x.grade)}) `:''}${esc(x.name)}${x.star!=null?` · ${esc(x.star)}성`:''}</div>`
            )
            .join('<br>')
        : '확인된 무공 없음'
)}

${detail(
    `수련법 (${target.trainingMethods?.length || 0})`,
    target.trainingMethods?.length
        ? target.trainingMethods
            .map(
                x =>
                    `<div class="${gradeClass(x.grade)}">${x.grade?`(${esc(x.grade)}) `:''}${esc(x.name)}</div>`
            )
            .join('<br>')
        : '확인된 수련법 없음'
)}

${detail(
    `소지품 (${target.inventory?.length || 0})`,
    target.inventory?.length
        ? target.inventory
            .map(
                x =>
                    `<div>${esc(typeof x==='string'?x:(x.quantity ? `${x.name} ×${x.quantity}` : x.name))}</div>`
            )
            .join('')
        : '확인 가능한 소지품 없음'
)}

${detail(
    `귀중품 (${target.valuables?.length || 0})`,
    target.valuables?.length
        ? target.valuables
            .map(x => `<div>${esc(typeof x==='string'?x:x.name)}</div>`)
            .join('')
        : '확인된 귀중품 없음'
)}

${
    target.observation
        ? detail(
            '관찰',
            esc(target.observation)
        )
        : ''
}
`;
    }

    function render() {
        if (!root) return;

        if (!target.active) {
            root.hidden = true;
            renderExtraEnemies();
            return;
        }

        root.hidden = false;

        root.classList.remove(
            'mode-collapsed',
            'mode-mini',
            'mode-full'
        );

        root.classList.add(
            `mode-${uiMode}`
        );

        root.classList.toggle(
            'npc-mode',
            target.mode !== 'enemy'
        );

        root.classList.toggle(
            'enemy-mode',
            target.mode === 'enemy'
        );

        const groups =
            getActions();

        const flat =
            [
                ...groups.primary,
                ...groups.extra
            ];

        let body = '';

        if (
            uiMode === 'mini'
        ) {
            body = `
<div class="body">
    <div class="line"><span>소속</span><b>${esc(target.faction || '불명')}</b></div>

    ${bar('체력',target.hp,target.maxHp,'hp')}
    ${bar('내력',target.qi,target.maxQi,'qi')}

    ${
        target.insightChance != null
            ? `<div class="line"><span class="insight">깨달음</span><b class="insight">${esc(target.insightChance)}%</b></div>`
            : ''
    }

    ${
        target.mode !== 'enemy'
            ? `<div>${(target.relation?.tags || ['초면']).slice(0,2).map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</div>`
            : ''
    }

    <div class="actions">
        ${groups.primary.map((a,i)=>actionHTML(a,i)).join('')}
        <button class="action" data-extra="1">${actionMenuOpen ? '행동 닫기' : '행동 ▾'}</button>
        <button class="action" data-mode="full">상세 ▾</button>
    </div>

    ${
        actionMenuOpen
            ? `<div class="actions extra">${groups.extra.map((a,i)=>actionHTML(a,groups.primary.length+i)).join('')}</div>`
            : ''
    }
</div>
`;
        }

        else if (
            uiMode === 'full'
        ) {
            body = `
<div class="body">
    ${bar('체력',target.hp,target.maxHp,'hp')}
    ${bar('내력',target.qi,target.maxQi,'qi')}

    ${
        target.insightChance != null
            ? `<div class="line"><span class="insight">깨달음 확률</span><b class="insight">${esc(target.insightChance)}%</b></div>`
            : ''
    }

    ${renderFullDetails()}

    <div class="actions">
        ${groups.primary.map((a,i)=>actionHTML(a,i)).join('')}
        <button class="action" data-extra="1">${actionMenuOpen ? '추가행동 닫기' : '추가행동 ▾'}</button>
        <button class="action" data-mode="mini">미니 보기</button>
    </div>

    ${
        actionMenuOpen
            ? `<div class="actions extra">${groups.extra.map((a,i)=>actionHTML(a,groups.primary.length+i)).join('')}</div>`
            : ''
    }
</div>
`;
        }

        root.innerHTML = `
<div class="target-header">
    <button
        class="target-close"
        data-close-target="1"
        type="button"
        title="상대창 닫기"
        aria-label="상대창 닫기"
    >×</button>

    <div class="target-head">
        <div>
            <div class="target-name">${esc(target.name || '대상')}</div>
            <div class="target-sub">${target.mode==='enemy'?'전투 대상':'대화 대상'}${target.faction?` · ${esc(target.faction)}`:''}</div>
            <div class="target-tip">헤더 또는 상대 초상화를 드래그해서 이동</div>
        </div>

        <div>
            <div class="target-realm">${esc(target.realm || '불명')}</div>
            ${target.danger?`<div class="target-danger">${esc(target.danger)}</div>`:''}
        </div>
    </div>

    <div class="mode-buttons">
        <button class="mode-btn ${uiMode==='collapsed'?'active':''}" data-mode="collapsed">접힘</button>
        <button class="mode-btn ${uiMode==='mini'?'active':''}" data-mode="mini">미니</button>
        <button class="mode-btn ${uiMode==='full'?'active':''}" data-mode="full">상세</button>
        <button class="mode-btn reset" data-reset-position="1">원위치</button>
    </div>
</div>

${body}
`;

        root._flatActions =
            flat;

        installDrag(
            root.querySelector(
                '.target-header'
            )
        );

        applyPosition();
        renderExtraEnemies();

        window.dispatchEvent(
            new CustomEvent(
                'wuxia:target-layout'
            )
        );
    }

    function createUI() {
        if (
            document.getElementById(
                ROOT_ID
            )
        ) {
            root =
                document.getElementById(
                    ROOT_ID
                );

            return;
        }

        [
            'wuxia-target-inspector-v12',
            'wuxia-target-inspector-v11',
            'wuxia-target-inspector-v1'
        ]
        .forEach(
            id =>
                document.getElementById(
                    id
                )?.remove()
        );

        root =
            document.createElement(
                'aside'
            );

        root.id =
            ROOT_ID;

        root.hidden =
            true;

        root.addEventListener(
            'click',
            event => {
                const close =
                    event.target.closest(
                        '[data-close-target]'
                    );

                if (close) {
                    target = {
                        ...target,
                        active: false
                    };

                    delete target.uiCommand;

                    const closedRaw =
                        JSON.stringify(
                            target
                        );

                    localStorage.setItem(
                        TARGET_KEY,
                        closedRaw
                    );

                    lastRaw =
                        closedRaw;

                    actionMenuOpen =
                        false;

                    render();
                    return;
                }

                const reset =
                    event.target.closest(
                        '[data-reset-position]'
                    );

                if (reset) {
                    resetTargetPosition();
                    render();
                    return;
                }

                const mode =
                    event.target.closest(
                        '[data-mode]'
                    );

                if (mode) {
                    uiMode =
                        mode.dataset.mode;

                    actionMenuOpen =
                        false;

                    localStorage.setItem(
                        MODE_KEY,
                        uiMode
                    );

                    render();
                    return;
                }

                const extra =
                    event.target.closest(
                        '[data-extra]'
                    );

                if (extra) {
                    actionMenuOpen =
                        !actionMenuOpen;

                    render();
                    return;
                }

                const action =
                    event.target.closest(
                        '[data-action]'
                    );

                if (action) {
                    const item =
                        root._flatActions?.[
                            Number(
                                action.dataset.action
                            )
                        ];

                   if (
    item &&
    item.enabled !== false
) {

    setComposerText(
        item.text
    );
}
                }
            }
        );

        document.body.appendChild(
            root
        );

        consumeUICommand();

        render();
        applyPosition();
        bindExternalPortrait();
    }

    function refreshFromStorage() {
        const raw =
            localStorage.getItem(
                TARGET_KEY
            ) || '';

        const enemyRaw =
            localStorage.getItem(
                ENEMY_KEY
            ) || '';

        let changed = false;

        if (raw !== lastRaw) {
            lastRaw = raw;
            target = readTarget();
            changed = true;
        }

        if (enemyRaw !== lastEnemyRaw) {
            lastEnemyRaw = enemyRaw;
            enemyState = readEnemies();
            changed = true;
        }

        if (changed) {
            consumeUICommand();
            render();
        } else {
            bindExternalPortrait();
            layoutExtraEnemies();
        }
    }

    function ensureUI() {
        if (
            !document.getElementById(
                ROOT_ID
            )
        ) {
            root =
                null;

            target =
                readTarget();

            enemyState =
                readEnemies();

            lastRaw =
                localStorage.getItem(
                    TARGET_KEY
                ) || '';

            lastEnemyRaw =
                localStorage.getItem(
                    ENEMY_KEY
                ) || '';

            createUI();
        }

        bindExternalPortrait();
    }


    function init() {
        installStyle();
        createUI();

        window.addEventListener(
            'wuxia:data-updated',
            event => {
                if (
                    event.detail?.target ||
                    event.detail?.enemy
                ) {
                    refreshFromStorage();
                }
            }
        );

        window.addEventListener(
            'wuxia:target-reset-position',
            () => {
                resetTargetPosition();
                render();
            }
        );

        window.addEventListener(
            'resize',
            () => {
                applyPosition();
                layoutExtraEnemies();

                window.dispatchEvent(
                    new CustomEvent(
                        'wuxia:target-layout'
                    )
                );
            }
        );

        window.addEventListener(
            'wuxia:target-layout',
            layoutExtraEnemies
        );

        window.addEventListener(
            'pageshow',
            refreshFromStorage
        );

        window.addEventListener(
            'popstate',
            () =>
                setTimeout(
                    ensureUI,
                    50
                )
        );

        window.addEventListener(
            'storage',
            event => {
                if (
                    event.key === TARGET_KEY
                    ||
                    event.key === ENEMY_KEY
                ) {
                    refreshFromStorage();
                }
            }
        );

        /*
         * 평소 상태 polling 없음.
         * SPA가 DOM을 날린 경우만 15초마다 복구.
         */
        setInterval(
            ensureUI,
            15000
        );

        console.log(
            '[무협 RPG] 대상 정보창 Lite v2.3 · 다중 적 동시 표시'
        );
    }


    init();

})();
