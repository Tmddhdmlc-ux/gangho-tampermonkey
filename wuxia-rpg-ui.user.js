// ==UserScript==
// @name         무협 RPG 통합 UI Lite v2.12
// @namespace    wuxia-rpg-ui-lite
// @version      2.12
// @description  이벤트형 통합 UI + 데미지 + 실적용 스탯 보정 표시 + 저부하 연동
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-ui.user.js
// @downloadURL  https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-ui.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /*
     * 기존 세션 컨트롤러 / 초상화 UI 호환 때문에
     * ROOT ID는 v20을 그대로 사용한다.
     */
    const ROOT_ID = 'wuxia-player-ui-v20';
    const STYLE_ID = 'wuxia-player-style-v212';

    const PLAYER_KEY = 'wuxia_rpg_status_v2';
    const TARGET_KEY = 'wuxia_rpg_target_v1';
    const LOCAL_NPCS_KEY = 'wuxia_rpg_local_npcs_v1';
    const ENEMY_KEY = 'wuxia_rpg_enemy_v2';

    const POSITION_KEY = 'wuxia_rpg_panel_position_v2';
    const COLLAPSE_KEY = 'wuxia_rpg_panel_collapsed_v2';

    const PORTRAIT_DB_NAME = 'wuxia_portrait_db';
    const PORTRAIT_STORE_NAME = 'portraits';

    const DIALOGUE_TAGS = new Set([
        '대화 중',
        '대화중',
        '대화 가능',
        '대화가능',
        '대화 불가',
        '대화불가'
    ]);

    const STAT_LABELS = {
        attack: '공격력',
        strength: '근력',
        agility: '민첩',
        intelligence: '지능',
        constitution: '체질',
        innerPower: '내공',
        accuracy: '명중',
        critical: '치명',
        combo: '연격',
        break: '파쇄',
        qiEfficiency: '내력효율',
        defense: '방어력',
        dodge: '회피'
    };

    let activeTab = 'status';

    let relationFilter = 'all';
    let localFilter = 'all';

    let mapExpanded = false;

    let player = readPlayer();
    let localNPCs = readLocalNPCs();
    let enemyState = readEnemy();

    let lastPlayerRaw =
        localStorage.getItem(PLAYER_KEY) || '';

    let lastTargetRaw =
        localStorage.getItem(TARGET_KEY) || '';

    let lastLocalRaw =
        localStorage.getItem(LOCAL_NPCS_KEY) || '';

    let lastEnemyRaw =
        localStorage.getItem(ENEMY_KEY) || '';

    let root = null;

    let savedPosition = parse(
        localStorage.getItem(POSITION_KEY),
        null
    );

    let portraitDBPromise = null;

    const portraitCache =
        Object.create(null);


    // =========================================================
    // 기본
    // =========================================================

    function parse(raw, fallback = null) {
        try {
            return raw
                ? JSON.parse(raw)
                : fallback;
        } catch (_) {
            return fallback;
        }
    }


    function readPlayer() {
        return (
            parse(
                localStorage.getItem(PLAYER_KEY),
                {}
            ) || {}
        );
    }


    function readTarget() {
        return (
            parse(
                localStorage.getItem(TARGET_KEY),
                {}
            ) || {}
        );
    }


    function readEnemy() {
        return (
            parse(
                localStorage.getItem(ENEMY_KEY),
                {active:false,enemies:[]}
            ) || {active:false,enemies:[]}
        );
    }


    function readLocalNPCs() {
        return (
            parse(
                localStorage.getItem(LOCAL_NPCS_KEY),
                {
                    active: false,
                    location: '',
                    playerPlace: '',
                    date: '',
                    npcs: []
                }
            )
            ||
            {
                active: false,
                location: '',
                playerPlace: '',
                date: '',
                npcs: []
            }
        );
    }


    function esc(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }


    function pct(value, max) {
        if (!max) {
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


    function gradeClass(grade) {
        switch (String(grade || '')) {
            case '하급':
                return 'grade-low';

            case '중급':
            case '고급':
                return 'grade-mid';

            case '절정':
                return 'grade-peak';

            case '상승':
                return 'grade-upper';

            case '절세':
                return 'grade-legend';

            default:
                return '';
        }
    }


    function cleanName(name) {
        return String(name || '')
            .replace(
                /\s*[×x]\s*\d+\s*$/i,
                ''
            )
            .replace(
                /^\((하급|중급|고급|절정|상승|절세)\)\s*/,
                ''
            )
            .trim();
    }


    function inferType(item) {
        if (
            item &&
            typeof item === 'object' &&
            item.type
        ) {
            return item.type;
        }

        const name =
            String(
                typeof item === 'string'
                    ? item
                    : item?.name || ''
            );

        if (
            /약|환|회기산|영약|단약/.test(name)
        ) {
            return 'consumable';
        }

        if (
            /비급|검법|도법|권법|심법|경공/.test(name)
        ) {
            return 'manual';
        }

        if (
            /검|도|창|봉|편|궁|권갑|철선|단도/.test(name)
        ) {
            return 'weapon';
        }

        return item?.slot
            ? 'equipment'
            : 'normal';
    }


    function itemGrade(item) {
        if (
            item &&
            typeof item === 'object' &&
            item.grade
        ) {
            return item.grade;
        }

        const name =
            typeof item === 'string'
                ? item
                : item?.name || '';

        return (
            name.match(
                /^\((하급|중급|고급|절정|상승|절세)\)/
            )?.[1]
            || null
        );
    }


    // =========================================================
    // ChatGPT 입력창
    // =========================================================

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
                document.createElement('p');

            p.textContent = text;

            editable.appendChild(p);

            editable.dispatchEvent(
                new InputEvent(
                    'input',
                    {
                        bubbles: true,
                        inputType: 'insertText',
                        data: text
                    }
                )
            );

            return true;
        }

        return false;
    }


    // =========================================================
    // 초상화 DB
    // =========================================================

    function getPortraitDB() {
        if (portraitDBPromise) {
            return portraitDBPromise;
        }

        portraitDBPromise =
            new Promise(
                (resolve, reject) => {
                    const request =
                        indexedDB.open(
                            PORTRAIT_DB_NAME,
                            1
                        );

                    request.onupgradeneeded =
                        () => {
                            const db =
                                request.result;

                            if (
                                !db.objectStoreNames
                                    .contains(
                                        PORTRAIT_STORE_NAME
                                    )
                            ) {
                                db.createObjectStore(
                                    PORTRAIT_STORE_NAME,
                                    {
                                        keyPath: 'key'
                                    }
                                );
                            }
                        };

                    request.onsuccess =
                        () =>
                            resolve(
                                request.result
                            );

                    request.onerror =
                        () =>
                            reject(
                                request.error
                            );
                }
            );

        return portraitDBPromise;
    }


    async function getPortrait(name) {
        if (!name) {
            return null;
        }

        if (
            portraitCache[name] !== undefined
        ) {
            return portraitCache[name];
        }

        try {
            const db =
                await getPortraitDB();

            const result =
                await new Promise(
                    (resolve, reject) => {
                        const tx =
                            db.transaction(
                                PORTRAIT_STORE_NAME,
                                'readonly'
                            );

                        const request =
                            tx.objectStore(
                                PORTRAIT_STORE_NAME
                            )
                            .get(name);

                        request.onsuccess =
                            () =>
                                resolve(
                                    request.result ||
                                    null
                                );

                        request.onerror =
                            () =>
                                reject(
                                    request.error
                                );
                    }
                );

            portraitCache[name] =
                result;

            return result;

        } catch (_) {
            portraitCache[name] =
                null;

            return null;
        }
    }


    async function hydrateVisiblePortraits() {
        if (
            !root ||
            ![
                'relations',
                'local'
            ].includes(activeTab)
        ) {
            return;
        }

        const boxes =
            root.querySelectorAll(
                '[data-small-portrait]'
            );

        for (const box of boxes) {
            if (
                !box.isConnected ||
                box.dataset.loaded === '1'
            ) {
                continue;
            }

            const name =
                box.dataset.smallPortrait;

            if (!name) {
                continue;
            }

            box.dataset.loaded = '1';

            const portrait =
                await getPortrait(name);

            if (!box.isConnected) {
                continue;
            }

            if (portrait?.image) {
                box.innerHTML =
                    `<img class="small-portrait-img" src="${esc(portrait.image)}" alt="">`;
            }
        }
    }


    function portraitBox(name) {
        return `
<div
    class="small-portrait"
    data-small-portrait="${esc(name)}"
>
    ${esc(
        (name || '?').slice(0, 1)
    )}
</div>
`;
    }


    // =========================================================
    // 대화 상태
    // =========================================================

    function cleanDialogueTags(npc) {
        const tags =
            npc?.tags ||
            npc?.relationTags ||
            ['초면'];

        return tags.filter(
            tag =>
                !DIALOGUE_TAGS.has(
                    String(tag)
                )
        );
    }


    function findLocalNPC(name) {
        return (
            localNPCs.npcs ||
            []
        ).find(
            npc =>
                npc.name === name
        ) || null;
    }


    function normalizePlace(text) {
        return String(text || '')
            .replace(
                /[·ㆍ>|/\\]/g,
                ' '
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim();
    }


    function sameVenue(
        playerPlace,
        npcPlace
    ) {
        const a =
            normalizePlace(
                playerPlace
            );

        const b =
            normalizePlace(
                npcPlace
            );

        if (
            !a ||
            !b
        ) {
            return false;
        }

        if (
            a === b ||
            a.includes(b) ||
            b.includes(a)
        ) {
            return true;
        }

        /*
         * 같은 마을이어도
         * 객잔 / 무관 등 시설이 다르면
         * 대화 불가.
         *
         * 객잔 1층 / 객잔 2층 정도는
         * 같은 시설로 취급.
         */
        const venues = [
            '객잔',
            '선술집',
            '여관',
            '무관',
            '대장간',
            '서점',
            '약방',
            '장터',
            '시장',
            '성문',
            '부두',
            '관아',
            '문파',
            '산문',
            '연무장',
            '사당',
            '광장',
            '찻집',
            '다루',
            '전장',
            '비무대'
        ];

        const venueA =
            venues.find(
                v =>
                    a.includes(v)
            );

        const venueB =
            venues.find(
                v =>
                    b.includes(v)
            );

        return !!(
            venueA &&
            venueB &&
            venueA === venueB
        );
    }


    function canTalkToLocalNPC(localNPC) {
        if (!localNPC) {
            return false;
        }

        /*
         * 엔진이 직접 canTalk 값을 보내면
         * 최우선 사용.
         */
        if (
            typeof localNPC.canTalk ===
            'boolean'
        ) {
            return localNPC.canTalk;
        }

        if (
            typeof localNPC.samePlace ===
            'boolean'
        ) {
            return localNPC.samePlace;
        }

        const playerPlace =
            localNPCs.playerPlace ||
            player.location ||
            '';

        const npcPlace =
            localNPC.place ||
            localNPC.area ||
            localNPC.locationDetail ||
            '';

        return sameVenue(
            playerPlace,
            npcPlace
        );
    }


    function targetIsActuallyTalkingTo(name) {
        const target =
            readTarget();

        if (
            !target.active ||
            target.mode !== 'npc' ||
            target.name !== name
        ) {
            return false;
        }

        if (
            target.dialogueState ===
                'talking' ||
            target.talking === true
        ) {
            return true;
        }

        const tags = [
            ...(
                target.relation?.tags ||
                []
            ),
            ...(
                target.tags ||
                []
            )
        ].map(String);

        return (
            tags.includes(
                '대화 중'
            )
            ||
            tags.includes(
                '대화중'
            )
        );
    }


    function getDialogueState(npc) {
        const localNPC =
            findLocalNPC(
                npc.name
            );

        const canTalk =
            canTalkToLocalNPC(
                localNPC
            );

        if (
            canTalk &&
            targetIsActuallyTalkingTo(
                npc.name
            )
        ) {
            return {
                text: '대화 중',
                className:
                    'dialogue-active'
            };
        }

        if (canTalk) {
            return {
                text: '대화 가능',
                className:
                    'dialogue-ready'
            };
        }

        return {
            text: '대화 불가',
            className:
                'dialogue-off'
        };
    }


    function renderDialogueState(npc) {
        const state =
            getDialogueState(npc);

        return `
<span
    class="
        chip
        ${state.className}
    "
>
    ${esc(state.text)}
</span>
`;
    }


    // =========================================================
    // CSS
    // =========================================================

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

#${ROOT_ID}{
position:fixed!important;
left:var(--wx-left,270px)!important;
top:var(--wx-top,72px)!important;
width:390px!important;
max-height:calc(100vh - 25px)!important;
z-index:2147483400!important;
overflow:hidden!important;
color:#ededf2!important;
background:rgba(19,19,24,.975)!important;
border:1px solid rgba(255,255,255,.14)!important;
border-radius:16px!important;
box-shadow:0 14px 42px rgba(0,0,0,.48)!important;
font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important
}

#${ROOT_ID} *{
box-sizing:border-box!important
}

#${ROOT_ID}.collapsed{
width:54px!important
}

#${ROOT_ID}.collapsed .wx-headtext,
#${ROOT_ID}.collapsed .wx-body{
display:none!important
}

#${ROOT_ID}.map-expanded{
width:min(930px,calc(100vw - var(--wx-left,10px) - 18px))!important
}


/* 등급 */

.grade-low{
color:#f5f5f5!important;
font-weight:900!important
}

.grade-mid{
color:#62df83!important;
font-weight:900!important
}

.grade-peak{
color:#5ba8ff!important;
font-weight:900!important
}

.grade-upper{
color:#bd7dff!important;
font-weight:950!important
}

.grade-legend{
color:#ff5564!important;
font-weight:1000!important
}


/* 헤더 */

.wx-header{
min-height:64px!important;
padding:10px!important;
display:flex!important;
align-items:center!important;
gap:10px!important;
border-bottom:1px solid rgba(255,255,255,.09)!important;
background:linear-gradient(90deg,rgba(125,74,195,.16),transparent)!important
}

.wx-toggle{
width:36px!important;
height:36px!important;
flex:0 0 36px!important;
border:1px solid rgba(255,216,60,.35)!important;
border-radius:9px!important;
background:rgba(255,216,60,.07)!important;
color:#ffd83e!important;
cursor:grab!important;
user-select:none!important;
touch-action:none!important
}

.wx-name{
font-size:18px!important;
font-weight:950!important;
color:#fff!important
}

.wx-sub{
font-size:11px!important;
color:#c49cff!important
}

.wx-connected{
font-size:10px!important;
color:#67df8a!important
}


/* 본체 */

.wx-body{
display:grid!important;
grid-template-columns:84px minmax(0,1fr)!important;
height:calc(100vh - 150px)!important;
max-height:720px!important
}

.wx-tabs{
padding:8px 5px!important;
display:flex!important;
flex-direction:column!important;
gap:5px!important;
border-right:1px solid rgba(255,255,255,.09)!important;
background:rgba(0,0,0,.12)!important;
overflow-y:auto!important
}

.wx-tab{
min-height:39px!important;
border:0!important;
border-radius:9px!important;
background:transparent!important;
color:#aaaab3!important;
cursor:pointer!important;
font-size:12px!important;
flex:0 0 auto!important
}

.wx-tab.active{
color:#d1aeff!important;
font-weight:900!important;
background:rgba(153,96,240,.16)!important;
border:1px solid rgba(178,132,250,.21)!important
}

.wx-content{
padding:12px!important;
overflow-y:auto!important;
overflow-x:hidden!important
}


/* 카드 */

.card{
margin-bottom:10px!important;
padding:10px!important;
border:1px solid rgba(255,255,255,.10)!important;
border-radius:11px!important;
background:rgba(255,255,255,.035)!important
}

.row{
margin:5px 0!important;
display:flex!important;
justify-content:space-between!important;
gap:12px!important;
font-size:13px!important
}

.muted{
margin-top:4px!important;
color:#999ba5!important;
font-size:11px!important;
line-height:1.55!important
}

.section{
margin-bottom:7px!important;
color:#b7b7c0!important;
font-size:11px!important;
font-weight:900!important
}


/* 바 */

.bar{
height:10px!important;
margin:4px 0 9px!important;
overflow:hidden!important;
border-radius:999px!important;
background:rgba(255,255,255,.1)!important
}

.fill{
height:100%!important;
border-radius:inherit!important
}

.hp{
color:#ff6570!important;
font-weight:950!important
}

.qi{
color:#59aaff!important;
font-weight:950!important
}

.exp{
color:#ffd54b!important;
font-weight:950!important
}

.insight{
color:#efbd45!important;
font-weight:950!important
}

.fame{
color:#65cfff!important;
font-weight:950!important
}

.infamy{
color:#ff657d!important;
font-weight:950!important
}

.damage-value{
color:#ff9a5b!important;
font-weight:950!important;
font-size:14px!important
}

.stat-total{
font-weight:950!important
}

.stat-bonus{
margin-left:4px!important;
color:#ffd166!important;
font-size:11px!important;
font-weight:950!important
}

.stat-source{
margin-top:7px!important;
padding-top:7px!important;
border-top:1px solid rgba(255,255,255,.07)!important;
color:#8f929d!important;
font-size:10px!important;
line-height:1.5!important
}

.fill-hp{
background:linear-gradient(90deg,#98232e,#ff4e5d,#ff858d)!important
}

.fill-qi{
background:linear-gradient(90deg,#1f5cab,#3599ff,#73c1ff)!important
}

.fill-exp{
background:linear-gradient(90deg,#99720c,#e8b729,#ffe16c)!important
}

.fill-insight{
background:linear-gradient(90deg,#7e5d08,#d4a51d,#f4d057)!important
}

.fill-fame{
background:linear-gradient(90deg,#166d96,#42bfea,#8ae2ff)!important
}

.fill-infamy{
background:linear-gradient(90deg,#792031,#da3553,#ff7188)!important
}


/* 태그 */

.chip{
display:inline-block!important;
margin:5px 4px 0 0!important;
padding:4px 8px!important;
border-radius:8px!important;
background:rgba(255,255,255,.055)!important;
border:1px solid rgba(255,255,255,.11)!important;
font-size:11px!important;
font-weight:850!important
}

.chip-blue{
color:#8ec4ff!important
}

.chip-gold{
color:#ffd166!important
}

.chip-purple{
color:#cc9bff!important
}

.chip-green{
color:#72df92!important
}

.chip-red{
color:#ff7882!important
}


/* 대화상태 */

.dialogue-active{
color:#ffd568!important;
border-color:rgba(255,205,85,.35)!important;
background:rgba(255,190,60,.09)!important
}

.dialogue-ready{
color:#6fe095!important;
border-color:rgba(80,220,125,.30)!important;
background:rgba(60,175,100,.08)!important
}

.dialogue-off{
color:#888c96!important;
border-color:rgba(150,150,160,.15)!important;
background:rgba(100,100,110,.035)!important
}


/* 무기 */

.weapon-stats{
display:grid!important;
grid-template-columns:repeat(auto-fit,minmax(105px,1fr))!important;
gap:5px!important;
margin-top:8px!important
}

.weapon-stat,
.item-stat{
padding:5px 6px!important;
border-radius:7px!important;
background:rgba(0,0,0,.16)!important;
font-size:10px!important;
color:#efb76d!important
}


/* 무공 / 행낭 */

.art-card,
.bag-card{
margin-bottom:8px!important;
padding:9px!important;
border:1px solid rgba(255,255,255,.09)!important;
border-radius:10px!important;
background:rgba(255,255,255,.035)!important
}

.bag-card.equipped{
border-color:rgba(92,219,134,.28)!important;
background:rgba(55,150,90,.07)!important
}

.item-stats{
margin-top:7px!important;
display:flex!important;
flex-wrap:wrap!important;
gap:4px!important
}

.bag-action,
.npc-detail{
margin-top:7px!important;
min-height:29px!important;
padding:4px 9px!important;
border:1px solid rgba(100,180,255,.22)!important;
border-radius:7px!important;
background:rgba(70,140,220,.09)!important;
color:#8ec8ff!important;
cursor:pointer!important;
font-size:10px!important;
font-weight:900!important
}

.bag-action.use{
color:#72df92!important
}

.bag-action.learn{
color:#d0a3ff!important
}

.bag-action:disabled{
opacity:.6!important;
cursor:default!important
}

.npc-detail:disabled{
opacity:.6!important;
cursor:default!important
}

.relation-action-note{
margin-top:5px!important;
font-size:9px!important;
color:#9b9ba5!important
}


/* 필터 */

.rel-filters{
display:flex!important;
flex-wrap:wrap!important;
gap:5px!important;
margin-bottom:10px!important
}

.rel-filter{
padding:5px 8px!important;
border:1px solid rgba(255,255,255,.1)!important;
border-radius:8px!important;
background:rgba(255,255,255,.04)!important;
color:#bcbcc4!important;
cursor:pointer!important;
font-size:10px!important
}

.rel-filter.active{
color:#d0b0ff!important;
border-color:rgba(192,139,255,.35)!important
}


/* NPC */

.npc-card{
display:grid!important;
grid-template-columns:54px minmax(0,1fr)!important;
gap:10px!important;
align-items:start!important
}

.small-portrait{
width:52px!important;
height:52px!important;
border-radius:10px!important;
overflow:hidden!important;
display:flex!important;
align-items:center!important;
justify-content:center!important;
background:rgba(255,255,255,.06)!important;
border:1px solid rgba(255,255,255,.11)!important;
color:#c6a3ff!important;
font-size:19px!important;
font-weight:950!important;
flex:none!important
}

.small-portrait-img{
width:100%!important;
height:100%!important;
display:block!important;
object-fit:cover!important;
object-position:center 25%!important
}

.npc-card-main{
min-width:0!important
}

.local-place{
color:#ffd36b!important;
font-size:10px!important;
font-weight:900!important
}

.unknown-npc .small-portrait{
filter:saturate(.55)!important;
opacity:.78!important
}

.important-star{
color:#ffd258!important
}


/* 지도 */

.map-toolbar{
display:flex!important;
justify-content:space-between!important;
align-items:center!important;
margin-bottom:10px!important
}

.map-button{
padding:5px 9px!important;
border:1px solid rgba(90,167,255,.28)!important;
border-radius:8px!important;
background:rgba(70,145,225,.1)!important;
color:#8ec7ff!important;
cursor:pointer!important
}

.map-pre{
margin:0!important;
padding:14px!important;
overflow:auto!important;
white-space:pre!important;
word-break:normal!important;
overflow-wrap:normal!important;
font-family:"Cascadia Mono","Consolas","Courier New",monospace!important;
font-size:11px!important;
line-height:1.55!important;
letter-spacing:0!important;
word-spacing:0!important;
font-variant-ligatures:none!important;
background:rgba(0,0,0,.22)!important;
border:1px solid rgba(255,255,255,.1)!important;
border-radius:10px!important
}

.map-expanded .map-pre{
font-size:14px!important
}

.map-town{
color:#5ba9ff!important
}

.map-faction{
color:#60db80!important
}

.map-dungeon{
color:#ff5964!important
}

.map-neutral{
color:#b5b5bc!important
}

.map-hidden{
color:#c082ff!important
}

.current-map-node{
color:#ffd82b!important;
text-shadow:0 0 7px rgba(255,215,40,.8)!important
}

`;

        document.head.appendChild(
            style
        );
    }


    // =========================================================
    // 바 표시
    // =========================================================

    function bar(
        label,
        value,
        max,
        type
    ) {
        return `
<div class="row">
    <span class="${type}">
        ${esc(label)}
    </span>

    <b class="${type}">
        ${esc(value ?? 0)}
        /
        ${esc(max ?? 0)}
    </b>
</div>

<div class="bar">
    <div
        class="fill fill-${type}"
        style="width:${pct(value,max)}%"
    ></div>
</div>
`;
    }


    function simpleBar(
        label,
        value,
        type
    ) {
        const width =
            Math.max(
                0,
                Math.min(
                    100,
                    Number(value) ||
                    0
                )
            );

        return `
<div class="row">
    <span class="${type}">
        ${esc(label)}
    </span>

    <b class="${type}">
        ${esc(value ?? 0)}
    </b>
</div>

<div class="bar">
    <div
        class="fill fill-${type}"
        style="width:${width}%"
    ></div>
</div>
`;
    }


    // =========================================================
    // 최종 데미지 / 실제 적용 스탯
    // =========================================================

    const CORE_STAT_KEYS = [
        'strength',
        'agility',
        'intelligence',
        'constitution',
        'innerPower'
    ];

    const KOR_STAT_TO_KEY = {
        '근력': 'strength',
        '민첩': 'agility',
        '지능': 'intelligence',
        '체질': 'constitution',
        '내공': 'innerPower'
    };

    function finiteNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function blankStatMap() {
        return {
            strength: 0,
            agility: 0,
            intelligence: 0,
            constitution: 0,
            innerPower: 0
        };
    }

    function mergeStatMap(target, source) {
        if (!source || typeof source !== 'object') return target;

        for (const key of CORE_STAT_KEYS) {
            const n = finiteNumber(source[key]);
            if (n !== null) target[key] += n;
        }

        return target;
    }

    function parseNumericEffectTexts(list) {
        const out = blankStatMap();

        for (const raw of Array.isArray(list) ? list : []) {
            const text = String(raw || '').trim();
            const match = text.match(/^(근력|민첩|지능|체질|내공)\s*([+-])\s*(\d+(?:\.\d+)?)/);
            if (!match) continue;

            const key = KOR_STAT_TO_KEY[match[1]];
            const value = Number(match[3]) * (match[2] === '-' ? -1 : 1);
            out[key] += value;
        }

        return out;
    }

    function passiveStatBonuses() {
        const out = blankStatMap();
        mergeStatMap(out, player.passive?.statEffects);
        mergeStatMap(out, parseNumericEffectTexts(player.passive?.numericEffects));
        return out;
    }

    function weaponStatBonuses() {
        const out = blankStatMap();
        mergeStatMap(out, player.weaponData?.stats);
        return out;
    }

    function combatStatBonuses() {
        const out = blankStatMap();

        if (!enemyState?.active) return out;

        /* 경지 전투보정은 전투 중에만 실제 5스탯에 가산 */
        const realm = finiteNumber(player.realmInfo?.combatBonus) ?? 0;
        for (const key of CORE_STAT_KEYS) out[key] += realm;

        /* 외공/심법/경공 발동 중 보정은 RPGSTATE.combatModifiers.stats에 기록 */
        mergeStatMap(out, player.combatModifiers?.stats);
        mergeStatMap(out, player.activeCombatBonuses?.stats);

        return out;
    }

    function statBreakdown(key) {
        const base = finiteNumber(player.stats?.[key]) ?? 0;
        const passive = passiveStatBonuses()[key] || 0;
        const weapon = weaponStatBonuses()[key] || 0;
        const combat = combatStatBonuses()[key] || 0;
        const bonus = passive + weapon + combat;

        return {
            base,
            passive,
            weapon,
            combat,
            bonus,
            total: base + bonus
        };
    }

    function statValueHTML(key, color) {
        const b = statBreakdown(key);
        const signed = b.bonus > 0 ? `+${b.bonus}` : `${b.bonus}`;

        return `
<b class="stat-total" style="color:${color}">
    ${esc(b.total)}
    ${b.bonus !== 0 ? `<span class="stat-bonus">(${esc(signed)})</span>` : ''}
</b>`;
    }

    function activeBonusSummary() {
        const pieces = [];
        const passive = passiveStatBonuses();
        const weapon = weaponStatBonuses();
        const combat = combatStatBonuses();

        function add(label, map) {
            const parts = CORE_STAT_KEYS
                .filter(k => Number(map[k] || 0) !== 0)
                .map(k => `${STAT_LABELS[k]} ${map[k] > 0 ? '+' : ''}${map[k]}`);
            if (parts.length) pieces.push(`${label}: ${parts.join(' · ')}`);
        }

        add('선천', passive);
        add('무기', weapon);
        if (enemyState?.active) add('전투중', combat);

        const sourceNames = (player.combatModifiers?.sources || [])
            .map(x => typeof x === 'string' ? x : x?.name)
            .filter(Boolean);

        if (enemyState?.active && sourceNames.length) {
            pieces.push(`발동: ${sourceNames.join(' · ')}`);
        }

        return pieces.join('<br>');
    }

    function normalizeDamageValue(value) {
        if (value === null || value === undefined || value === '') return null;
        const direct = finiteNumber(value);
        if (direct !== null) return String(Math.max(0, Math.round(direct)));
        if (typeof value === 'string') return value.trim() || null;
        if (typeof value === 'object') {
            const exact = finiteNumber(value.final) ?? finiteNumber(value.value) ?? finiteNumber(value.damage);
            if (exact !== null) return String(Math.max(0, Math.round(exact)));
            const min = finiteNumber(value.min);
            const max = finiteNumber(value.max);
            if (min !== null && max !== null) return `${Math.round(min)} ~ ${Math.round(max)}`;
        }
        return null;
    }

    function basicDamageNumber() {
        const explicit = [
            player.combatDamage?.basic,
            player.combatDamage?.normal,
            player.basicDamage,
            player.damage?.basic
        ];

        for (const candidate of explicit) {
            const n = finiteNumber(candidate);
            if (n !== null) return Math.max(0, Math.round(n));
        }

        const weaponAttack = finiteNumber(player.weaponData?.stats?.attack) ?? 0;
        const strength = statBreakdown('strength').total;
        return Math.max(1, Math.round(weaponAttack + strength));
    }

    function basicDamageDisplay() {
        const explicit = [
            player.combatDamage?.basic,
            player.combatDamage?.normal,
            player.basicDamage,
            player.damage?.basic
        ];
        for (const candidate of explicit) {
            const d = normalizeDamageValue(candidate);
            if (d !== null) return d;
        }
        return String(basicDamageNumber());
    }

    function artDamageDisplay(art, category) {
        const explicit = [art?.finalDamage, art?.damage, art?.combatDamage, art?.damageValue];
        for (const candidate of explicit) {
            const d = normalizeDamageValue(candidate);
            if (d !== null) return d;
        }
        if (category !== 'external') return null;

        const effects = art?.statEffects && typeof art.statEffects === 'object' && !Array.isArray(art.statEffects)
            ? art.statEffects
            : {};
        let bonus = 0;
        for (const key of CORE_STAT_KEYS) {
            const n = finiteNumber(effects[key]);
            if (n !== null && n > 0) bonus += n;
        }
        return String(Math.max(1, Math.round(basicDamageNumber() + bonus)));
    }


    // =========================================================
    // 상태
    // =========================================================

    function renderWeapon() {
        const w =
            player.weaponData;

        if (!w) {
            return '';
        }

        /*
         * 무기창은 직관성을 위해
         * 공격력 + 5대 기본 스탯만 표시한다.
         * 0 / null / 빈 값은 아예 렌더링하지 않는다.
         */
        const visibleKeys = [
            'attack',
            'strength',
            'agility',
            'intelligence',
            'constitution',
            'innerPower'
        ];

        const visibleStats =
            visibleKeys
                .map(
                    key => [
                        key,
                        w.stats?.[key]
                    ]
                )
                .filter(
                    ([, value]) => {
                        if (
                            value === null ||
                            value === undefined ||
                            value === ''
                        ) {
                            return false;
                        }

                        const n = Number(value);

                        return (
                            Number.isFinite(n) &&
                            n !== 0
                        );
                    }
                );

        return `
<div class="card">

    <div class="section">
        현재 주무기
    </div>

    <div
        class="${gradeClass(w.grade)}"
        style="font-size:15px"
    >
        ${
            w.grade
                ? `(${esc(w.grade)}) `
                : ''
        }

        ${esc(w.name || '')}
    </div>

    ${
        visibleStats.length
            ? `
<div class="weapon-stats">
    ${
        visibleStats
            .map(
                ([k,v]) => `
<div class="weapon-stat">
    ${esc(STAT_LABELS[k] || k)}

    <b style="float:right">
        ${Number(v) > 0 ? '+' : ''}${esc(v)}
    </b>
</div>
`
            )
            .join('')
    }
</div>
`
            : ''
    }

    ${
        w.effects?.length
            ? `
<div style="margin-top:7px">
    ${
        w.effects
            .map(
                x => `
<span class="chip chip-gold">
    ${esc(x)}
</span>
`
            )
            .join('')
    }
</div>
`
            : ''
    }

</div>
`;
    }


    function renderStatus() {
        const r =
            player.realmInfo ||
            {};

        const rep =
            player.reputation ||
            {
                fame: 0,
                infamy: 0
            };

        const stats =
            player.stats ||
            {};

        return `
<div class="card">

    <div class="row">
        <b>
            ${esc(
                player.name ||
                '주인공'
            )}
        </b>

        <span>
            Lv.${esc(
                player.level ??
                '?'
            )}
        </span>
    </div>

    <div class="muted">
        ${esc(player.realm || '')}
        ·
        ${esc(
            player.faction ||
            '무소속'
        )}
    </div>

</div>


<div class="card">

    ${bar(
        '체력',
        player.hp,
        player.maxHp,
        'hp'
    )}

    ${bar(
        '내력',
        player.qi,
        player.maxQi,
        'qi'
    )}

    ${bar(
        '경험치',
        player.exp,
        player.maxExp,
        'exp'
    )}

    ${simpleBar(
        '깨달음 확률',
        r.insightChance || 0,
        'insight'
    )}

    <div class="muted">
        ${esc(
            r.insightText ||
            ''
        )}
    </div>

</div>


<div class="card">

    <div class="section">
        강호 평판
    </div>

    ${simpleBar(
        '명성',
        rep.fame || 0,
        'fame'
    )}

    ${simpleBar(
        '악명',
        rep.infamy || 0,
        'infamy'
    )}

    <div class="row" style="margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)">
        <span>기본 데미지</span>
        <b class="damage-value">${esc(basicDamageDisplay())}</b>
    </div>

</div>


${renderWeapon()}


<div class="card">

    <div class="row">
        <span>근력</span>
        ${statValueHTML('strength','#ff8950')}
    </div>

    <div class="row">
        <span>민첩</span>
        ${statValueHTML('agility','#52dfe7')}
    </div>

    <div class="row">
        <span>지능</span>
        ${statValueHTML('intelligence','#c18bff')}
    </div>

    <div class="row">
        <span>체질</span>
        ${statValueHTML('constitution','#61db82')}
    </div>

    <div class="row">
        <span>내공</span>
        ${statValueHTML('innerPower','#638fff')}
    </div>

    ${activeBonusSummary() ? `<div class="stat-source">${activeBonusSummary()}</div>` : ''}

</div>


${
    player.passive
        ? `
<div class="card">

    <div class="section">
        선천패시브
    </div>

    <div
        class="${gradeClass(
            player.passive.grade
        )}"
    >
        (${esc(
            player.passive.grade
        )})
        ${esc(
            player.passive.name
        )}
    </div>

    <div class="muted" style="margin-top:7px;margin-bottom:4px">효과</div>

    ${
        (
            player.passive
                .numericEffects ||
            []
        )
        .map(
            x => `
<span class="chip chip-purple">
    ${esc(x)}
</span>
`
        )
        .join('')
    }

    <div class="muted">
        ${esc(
            player.passive
                .description ||
            ''
        )}
    </div>

</div>
`
        : ''
}
`;
    }


    // =========================================================
    // 무공
    // =========================================================

    function renderArt(art, category) {
        const coreKeys = [
            'strength',
            'agility',
            'intelligence',
            'constitution',
            'innerPower'
        ];

        const coreStats = [];

        if (
            art.statEffects &&
            typeof art.statEffects === 'object' &&
            !Array.isArray(art.statEffects)
        ) {
            for (const key of coreKeys) {
                const value = art.statEffects[key];
                const n = Number(value);

                if (
                    value !== null &&
                    value !== undefined &&
                    value !== '' &&
                    Number.isFinite(n) &&
                    n !== 0
                ) {
                    coreStats.push(
                        `${STAT_LABELS[key]} ${n > 0 ? '+' : ''}${n}`
                    );
                }
            }
        } else if (Array.isArray(art.statBonuses)) {
            /* 구버전 데이터 호환 */
            for (const item of art.statBonuses) {
                const text = String(item || '');

                if (
                    /^(근력|민첩|지능|체질|내공)\s*[+-]?\d+/.test(text)
                ) {
                    coreStats.push(text);
                }
            }
        }

        const rawEffects = Array.isArray(art.effects)
            ? art.effects
            : art.effects
                ? [art.effects]
                : [];

        /* 5대 스탯 문구는 위에서 이미 보여주므로 중복 제거 */
        const specialEffects = rawEffects
            .map(String)
            .filter(
                text =>
                    !/^(근력|민첩|지능|체질|내공)\s*[+-]?\d+/.test(text)
            );

        const stars =
            art.stars ??
            art.star ??
            '?';

        const damage =
            artDamageDisplay(
                art,
                category
            );

        return `
<div class="art-card">

    <div class="row">

        <b class="${gradeClass(art.grade)}">
            (${esc(art.grade || '?')})
            ${esc(art.name || '')}
        </b>

        <b>
            ${esc(stars)}성
        </b>

    </div>

    ${
        damage !== null
            ? `<span class="chip chip-red">데미지 ${esc(damage)}</span>`
            : ''
    }

    <span class="chip chip-gold">
        발동 ${esc(art.activationRate ?? '')}%
    </span>

    <span class="chip chip-blue">
        ${
            art.qiCostText
                ? esc(art.qiCostText)
                : Number(art.qiCost || 0) > 0
                    ? `내력 ${esc(art.qiCost)}`
                    : '내력 소모 없음'
        }
    </span>

    ${
        coreStats
            .map(
                text => `
<span class="chip chip-purple">
    ${esc(text)}
</span>
`
            )
            .join('')
    }

    ${
        art.description
            ? `
<div class="muted" style="margin-top:7px;line-height:1.55">
    ${esc(art.description)}
</div>
`
            : ''
    }

    ${
        specialEffects.length
            ? `
<div style="margin-top:6px">
    ${
        specialEffects
            .map(
                text => `
<span class="chip chip-gold">
    ${esc(text)}
</span>
`
            )
            .join('')
    }
</div>
`
            : ''
    }

</div>
`;
    }


    function renderArts() {
        const arts =
            player.martialArts ||
            {};

        function group(
            title,
            list,
            category
        ) {
            return `
<div class="section">
    ${title}
</div>

${
    list?.length
        ? list
            .map(art => renderArt(art, category))
            .join('')
        : `
<div class="card">
    <div class="muted">
        없음
    </div>
</div>
`
}
`;
        }

        return (
            group(
                '⚔ 외공',
                arts.external
            )
            +
            group(
                '◈ 심법',
                arts.internal
            )
            +
            group(
                '➤ 경공',
                arts.movement
            )
        );
    }


    // =========================================================
    // 경지
    // =========================================================

    function renderRealm() {
        const r =
            player.realmInfo ||
            {};

        return `
<div class="card">

    <div class="section">
        현재 경지
    </div>

    <b
        style="
            color:#c28cff;
            font-size:16px
        "
    >
        ${esc(player.realm || '')}
    </b>

    <div class="row">
        <span>전투 올스탯</span>
        <b>
            +${esc(
                r.combatBonus || 0
            )}
        </b>
    </div>

    <div class="row">
        <span>체력 보너스</span>
        <b class="hp">
            +${esc(
                r.hpRealmBonus || 0
            )}
        </b>
    </div>

    <div class="row">
        <span>내력 보너스</span>
        <b class="qi">
            +${esc(
                r.qiRealmBonus || 0
            )}
        </b>
    </div>

</div>


<div class="card">

    <div class="section">
        다음 경지
    </div>

    <b style="color:#dfc1ff">
        ${esc(r.next || '-')}
    </b>

    <div class="row">
        <span>다음 전투보정</span>
        <b>
            +${esc(
                r.nextCombatBonus || 0
            )}
        </b>
    </div>

    <div class="row">
        <span>다음 체력보너스</span>
        <b class="hp">
            +${esc(
                r.nextHpRealmBonus ||
                0
            )}
        </b>
    </div>

    <div class="row">
        <span>다음 내력보너스</span>
        <b class="qi">
            +${esc(
                r.nextQiRealmBonus ||
                0
            )}
        </b>
    </div>

</div>


<div class="card">

    <div class="section">
        깨달음
    </div>

    <div class="row">
        <span>현재 확률</span>

        <b class="insight">
            ${esc(
                r.insightChance || 0
            )}%
        </b>
    </div>

    <div class="muted">
        ${esc(
            r.insightText ||
            ''
        )}
    </div>

</div>


<div class="card">

    <div class="section">
        돌파
    </div>

    <div class="row">
        <span>방식</span>
        <b>
            ${esc(
                r.breakthroughType ||
                '-'
            )}
        </b>
    </div>

    <div class="row">
        <span>장소</span>
        <b>
            ${esc(
                r.breakthroughLocation ||
                '-'
            )}
        </b>
    </div>

    <div class="muted">
        ${
            (
                r.requirements ||
                []
            )
            .map(
                x =>
                    `• ${esc(x)}`
            )
            .join('<br>')
        }
    </div>

</div>
`;
    }


    // =========================================================
    // 수련
    // =========================================================

    function renderTraining() {
        let html = `
<div class="card">

    <div class="row">
        <span>보유 수련점</span>

        <b style="color:#65de88">
            ${esc(
                player.trainingPoints ??
                0
            )}
        </b>
    </div>

</div>
`;

        for (
            const m
            of player.training?.methods ||
            []
        ) {
            const uses =
                Number(
                    m.uses || 0
                );

            const max =
                Number(
                    m.maxEfficientUses ||
                    10
                );

            html += `
<div class="card">

    <div class="row">

        <b>
            ${esc(m.name)}
        </b>

        <b style="color:#68bfff">
            ${uses}/${max}
        </b>

    </div>

    <b
        style="
            color:
            ${
                uses < max
                    ? '#65de88'
                    : '#ff726f'
            }
        "
    >
        ${
            uses < max
                ? '● 정상 효율'
                : '● 효율 저하'
        }
    </b>

    <div class="muted">
        예상:
        ${esc(m.expected || '')}
    </div>

    <div class="muted">
        ${esc(
            m.description || ''
        )}
    </div>

</div>
`;
        }

        return html;
    }


    // =========================================================
    // 지도
    // =========================================================

    function mapHTML(
        text,
        currentNode
    ) {
        const regex =
            /\{(town|faction|dungeon|neutral|hidden):([^}]+)\}/g;

        let result = '';
        let last = 0;
        let match;

        while (
            (
                match =
                    regex.exec(text)
            )
        ) {
            result +=
                esc(
                    text.slice(
                        last,
                        match.index
                    )
                );

            const type =
                match[1];

            const label =
                match[2];

            const current =
                label ===
                currentNode;

            /*
             * 중요:
             * PRE 안이라 span 주변에
             * 개행이나 스페이스를 넣으면
             * 지도가 찢어진다.
             */
            result +=
                `<span class="map-${type}${current ? ' current-map-node' : ''}">${current ? '★' : ''}${esc(label)}</span>`;

            last =
                regex.lastIndex;
        }

        result +=
            esc(
                text.slice(last)
            );

        return result;
    }


    function resolveMapCurrentNode(map) {
        const text = String(map?.text || '');
        const location = normalizePlace(
            player.location ||
            map?.current ||
            ''
        );

        if (text && location) {
            const regex = /\{(?:town|faction|dungeon|neutral|hidden):([^}]+)\}/g;
            let match;

            while ((match = regex.exec(text))) {
                const label = normalizePlace(match[1]);

                if (
                    label &&
                    (
                        location === label ||
                        location.includes(label) ||
                        label.includes(location)
                    )
                ) {
                    return match[1];
                }
            }
        }

        return (
            map?.currentNode ||
            map?.current ||
            ''
        );
    }


    function renderMap() {
        const map =
            player.map ||
            {};

        return `
<div class="map-toolbar">

    <div>
        <b>현재 위치</b>

        <div
            style="
                color:#ffd82b;
                font-weight:950
            "
        >
            ★
            ${esc(
                player.location ||
                map.current ||
                ''
            )}
        </div>
    </div>

    <button
        class="map-button"
        data-map-expand="1"
    >
        ${
            mapExpanded
                ? '원래 크기'
                : '크게 보기'
        }
    </button>

</div>

<pre class="map-pre">${mapHTML(
    map.text || '',
    resolveMapCurrentNode(map)
)}</pre>

<div class="muted">
    🔵 도시 ·
    🟢 문파 ·
    🔴 위험 ·
    ⚪ 야외 ·
    🟣 숨김 ·
    ⭐ 현재
</div>
`;
    }


    // =========================================================
    // 관계
    // =========================================================

    function relationCategory(npc) {
        const joined =
            cleanDialogueTags(npc)
            .join(' ');

        if (
            /적대|원한|숙적|배신/.test(
                joined
            )
        ) {
            return 'hostile';
        }

        if (
            /우호|친구|동료|연인|사제|배우자/.test(
                joined
            )
        ) {
            return 'friendly';
        }

        return 'neutral';
    }


    function relationMatch(npc) {
        if (
            relationFilter === 'all'
        ) {
            return true;
        }

        if (
            relationFilter ===
            'important'
        ) {
            return !!npc.important;
        }

        if (
            relationFilter === 'dead'
        ) {
            return (
                npc.status === '사망'
                ||
                npc.status === '실종'
            );
        }

        return (
            relationCategory(npc)
            ===
            relationFilter
        );
    }


    function relationHasTag(
        npc,
        ...wanted
    ) {
        const tags =
            cleanDialogueTags(
                npc
            )
            .map(
                String
            );

        return wanted.some(
            tag =>
                tags.includes(
                    tag
                )
        );
    }


    function relationAdultConfirmed(npc) {
        const age =
            Number(
                npc?.age
            );

        return (
            npc?.adultConfirmed ===
                true

            ||

            (
                Number.isFinite(
                    age
                )

                &&

                age >=
                    18
            )
        );
    }


    function relationInteractionContext(npc) {
        const local =
            localNPCs.active ===
                true

            ? (
                localNPCs.npcs ||
                []
            )
            .find(
                item =>
                    item.name ===
                    npc.name
            )

            : null;

        return {
            ...npc,
            ...(
                local ||
                {}
            ),
            name:
                npc.name,
            tags:
                npc.tags ||
                local?.tags ||
                [],
            affinity:
                npc.affinity ??
                local?.affinity ??
                0,
            trust:
                npc.trust ??
                local?.trust ??
                0,
            currentlyPresent:
                !!local,
            safePrivateLocation:
                local?.safePrivateLocation ===
                    true

                ||

                local?.privateLocation ===
                    true

                ||

                localNPCs.safePrivateLocation ===
                    true

                ||

                player.currentScene
                    ?.safePrivateLocation ===
                    true
        };
    }


    function dualCultivationState(npc) {
        const visible =
            relationAdultConfirmed(
                npc
            )

            &&

            relationHasTag(
                npc,
                '교제',
                '연인',
                '배우자'
            );

        if (!visible) {
            return {
                visible: false,
                enabled: false,
                reason: ''
            };
        }

        const affinity =
            Number(
                npc.affinity ??
                0
            );

        const trust =
            Number(
                npc.trust ??
                0
            );

        const capable =
            npc.dualCultivationEligible ===
                true

            ||

            npc.capabilities
                ?.dualCultivation ===
                true;

        const privatePlace =
            npc.safePrivateLocation ===
                true

            ||

            npc.privateLocation ===
                true;

        let reason = '';

        if (!npc.currentlyPresent) {
            reason =
                '같은 장소에 있지 않음';
        }
        else if (!capable) {
            reason =
                '현재 쌍수 제안 불가';
        }
        else if (
            affinity < 80 ||
            trust < 70
        ) {
            reason =
                '호감 80 / 신뢰 70 필요';
        }
        else if (!privatePlace) {
            reason =
                '안전하고 사적인 장소 필요';
        }
        else if (
            npc.dualCultivationCooldownActive ===
                true

            ||

            npc.dualCultivationCooldownReady ===
                false
        ) {
            reason =
                '72시간 쿨다운 진행 중';
        }

        return {
            visible: true,
            enabled: !reason,
            reason
        };
    }


    function dualCultivationPrompt(npc) {
        return `${npc.name}에게 쌍수를 제안한다. 두 사람 모두 성인인지, 교제 관계·호감·신뢰·72시간 쿨다운·안전하고 사적인 장소·상호 동의를 먼저 확인한다. 수락되면 실제 성인 연인 간 성관계 이벤트로 판정하고 기록하되, 단순 합동 명상으로 바꾸지 말고 장면은 fade-to-black으로 처리한다.`;
    }


    function renderRelations() {
        const list =
            [
                ...(
                    player.relations ||
                    []
                )
            ]
            .filter(
                relationMatch
            );

        let html = `
<div class="rel-filters">

    ${
        [
            ['all','전체'],
            ['friendly','우호'],
            ['hostile','적대'],
            ['important','★ 중요'],
            ['dead','사망/실종']
        ]
        .map(
            ([v,label]) => `
<button
    class="
        rel-filter
        ${
            relationFilter === v
                ? 'active'
                : ''
        }
    "
    data-rel-filter="${v}"
>
    ${label}
</button>
`
        )
        .join('')
    }

</div>
`;

        if (!list.length) {
            return (
                html
                +
                `
<div class="card">
    <div class="muted">
        해당 NPC 없음
    </div>
</div>
`
            );
        }

        for (
            const [index, npc]
            of list.entries()
        ) {
            const tags =
                cleanDialogueTags(npc);

            const dualNpc =
                relationInteractionContext(
                    npc
                );

            const dualState =
                dualCultivationState(
                    dualNpc
                );

            html += `
<div class="card npc-card">

    ${portraitBox(npc.name)}

    <div class="npc-card-main">

        <div class="row">

            <b>
                ${esc(npc.name)}

                ${
                    npc.important
                        ? `
<span class="important-star">
    ★
</span>
`
                        : ''
                }
            </b>

            <b style="color:#c49cff">
                ${esc(
                    npc.realm ||
                    '불명'
                )}
            </b>

        </div>

        <div class="muted">

            ${esc(
                npc.faction ||
                '무소속'
            )}

            ${
                npc.role
                    ? ` · ${esc(
                        npc.role
                    )}`
                    : ''
            }

            ${
                npc.title
                    ? ` · ${esc(
                        npc.title
                    )}`
                    : ''
            }

        </div>

        <div>

            ${
                tags
                    .map(
                        tag => `
<span class="chip">
    ${esc(tag)}
</span>
`
                    )
                    .join('')
            }

            ${renderDialogueState(npc)}

        </div>

        <div class="row">
            <span>호감</span>

            <b style="color:#ff9fc8">
                ${esc(
                    npc.affinity ??
                    0
                )}
            </b>
        </div>

        <div class="row">
            <span>신뢰</span>

            <b style="color:#73c4ff">
                ${esc(
                    npc.trust ??
                    0
                )}
            </b>
        </div>

        <div class="row">
            <span>상태</span>

            <b>
                ${esc(
                    npc.status ||
                    '생존'
                )}
            </b>
        </div>

        <div class="muted">

            마지막:
            ${esc(
                npc.lastLocation ||
                '기록 없음'
            )}

            ${
                npc.lastDate
                    ? ` · ${esc(
                        npc.lastDate
                    )}`
                    : ''
            }

        </div>

        ${
            npc.lastEvent
                ? `
<div class="muted">
    ${esc(npc.lastEvent)}
</div>
`
                : ''
        }

        ${
            dualState.visible
                ? `
<button
    class="npc-detail"
    data-rel-dual="${index}"
    ${
        dualState.enabled
            ? ''
            : 'disabled'
    }
    title="${esc(dualState.reason)}"
>
    쌍수 제안
</button>
${
    dualState.reason
        ? `
<div class="relation-action-note">
    ${esc(dualState.reason)}
</div>
`
        : ''
}
`
                : ''
        }

    </div>

</div>
`;
        }

        return html;
    }


    // =========================================================
    // 현지 NPC
    // =========================================================

    function localNPCMatch(npc) {
        if (
            localFilter === 'all'
        ) {
            return true;
        }

        if (
            localFilter ===
            'important'
        ) {
            return !!npc.important;
        }

        if (
            localFilter === 'met'
        ) {
            return (
                npc.met === true
            );
        }

        if (
            localFilter ===
            'unknown'
        ) {
            return (
                npc.met === false
                ||
                npc.known === false
            );
        }

        return true;
    }


    function renderLocalNPCs() {
        const location =
            localNPCs.location ||
            player.location ||
            '현재 지역';

        const list =
            (
                localNPCs.npcs ||
                []
            )
            .filter(
                localNPCMatch
            );

        let html = `
<div class="card">

    <div class="section">
        현재 지역의 주요 인물
    </div>

    <div
        style="
            font-size:15px;
            font-weight:950;
            color:#ffd36b
        "
    >
        ${esc(location)}
    </div>

    ${
        localNPCs.playerPlace
            ? `
<div class="muted">
    내 위치:
    ${esc(
        localNPCs.playerPlace
    )}
</div>
`
            : ''
    }

    ${
        localNPCs.date
            ? `
<div class="muted">
    ${esc(localNPCs.date)}
</div>
`
            : ''
    }

    <div class="muted">
        현재 확인 가능한 주요 인물입니다.
        다른 장소에 있는 사람은 대화 불가로 표시됩니다.
    </div>

</div>


<div class="rel-filters">

    ${
        [
            ['all','전체'],
            ['met','만난 사람'],
            ['unknown','미접촉'],
            ['important','★ 중요']
        ]
        .map(
            ([v,label]) => `
<button
    class="
        rel-filter
        ${
            localFilter === v
                ? 'active'
                : ''
        }
    "
    data-local-filter="${v}"
>
    ${label}
</button>
`
        )
        .join('')
    }

</div>
`;

        if (
            !localNPCs.active ||
            !list.length
        ) {
            return (
                html
                +
                `
<div class="card">
    <div class="muted">
        현재 확인 가능한 주요 인물이 없습니다.
    </div>
</div>
`
            );
        }

        list.forEach(
            (npc, index) => {

                const tags =
                    (
                        npc.relation?.tags
                        ||
                        npc.tags
                        ||
                        (
                            npc.met === false
                                ? ['미접촉']
                                : ['초면']
                        )
                    )
                    .filter(
                        tag =>
                            !DIALOGUE_TAGS
                                .has(
                                    String(tag)
                                )
                    );

                const place =
                    npc.place ||
                    npc.area ||
                    npc.locationDetail ||
                    npc.statusText ||
                    '';

                const unknown =
                    npc.met === false
                    ||
                    npc.known === false;

                const state =
                    getDialogueState(
                        {
                            name:
                                npc.name
                        }
                    );

                html += `
<div
    class="
        card
        npc-card
        ${
            unknown
                ? 'unknown-npc'
                : ''
        }
    "
>

    ${
        portraitBox(
            npc.portraitKey ||
            npc.name
        )
    }

    <div class="npc-card-main">

        <div class="row">

            <b>
                ${esc(
                    npc.name ||
                    '정체불명 인물'
                )}

                ${
                    npc.important
                        ? `
<span class="important-star">
    ★
</span>
`
                        : ''
                }
            </b>

            <b style="color:#c49cff">
                ${esc(
                    npc.realm ||
                    '불명'
                )}
            </b>

        </div>

        <div class="muted">

            ${esc(
                npc.faction ||
                '소속 불명'
            )}

            ${
                npc.role
                    ? ` · ${esc(
                        npc.role
                    )}`
                    : ''
            }

            ${
                npc.title
                    ? ` · ${esc(
                        npc.title
                    )}`
                    : ''
            }

        </div>

        ${
            place
                ? `
<div class="local-place">
    📍
    ${esc(place)}
</div>
`
                : ''
        }

        <div>

            ${
                tags
                    .slice(0,4)
                    .map(
                        tag => `
<span class="chip">
    ${esc(tag)}
</span>
`
                    )
                    .join('')
            }

            <span
                class="
                    chip
                    ${state.className}
                "
            >
                ${esc(state.text)}
            </span>

        </div>

        ${
            npc.summary
                ? `
<div class="muted">
    ${esc(
        npc.summary
    )}
</div>
`
                : ''
        }

        <button
            class="npc-detail"
            data-local-detail="${index}"
        >
            상세 보기 →
        </button>

    </div>

</div>
`;
            }
        );

        return html;
    }


    // =========================================================
    // 현지 → 오른쪽 대상창
    // =========================================================

    function openLocalNPCDetail(index) {
        const visibleList =
            (
                localNPCs.npcs ||
                []
            )
            .filter(
                localNPCMatch
            );

        const npc =
            visibleList[index];

        if (!npc) {
            return;
        }

        const relationTags =
            (
                npc.relation?.tags
                ||
                npc.tags
                ||
                (
                    npc.met === false
                        ? ['미접촉']
                        : ['초면']
                )
            )
            .filter(
                tag =>
                    !DIALOGUE_TAGS
                        .has(
                            String(tag)
                        )
            );

        const canTalk =
            canTalkToLocalNPC(
                npc
            );

        /*
         * 상세 보기만 누른 것은
         * 대화 시작이 아니다.
         */
        const target = {

            active: true,

            mode: 'npc',

            name:
                npc.name ||
                '정체불명 인물',

            portraitKey:
                npc.portraitKey ||
                npc.name ||
                '',

            canTalk,

            dialogueState:
                'idle',

            faction:
                npc.faction ||
                '불명',

            role:
                npc.role ||
                '',

            title:
                npc.title ||
                '',

            realm:
                npc.realm ||
                '불명',

            hp:
                npc.hp ??
                null,

            maxHp:
                npc.maxHp ??
                null,

            qi:
                npc.qi ??
                null,

            maxQi:
                npc.maxQi ??
                null,

            status:
                npc.status ||
                npc.condition ||
                '',

            weapon:
                npc.weapon ||
                null,

            equipment:
                npc.equipment ||
                [],

            martialArts:
                npc.martialArts ||
                [],

            inventory:
                npc.inventory ||
                [],

            trainingMethods:
                npc.trainingMethods ||
                [],

            valuables:
                npc.valuables ||
                [],

            insightChance:
                npc.insightChance ??
                null,

            nextRealm:
                npc.nextRealm ||
                '',

            danger:
                npc.danger ||
                '',

            note:
                npc.note ||
                npc.summary ||
                '',


            /*
             * 상대 행동창에서 사용.
             */
            capabilities:
                npc.capabilities ||
                {},

            romanceEligible:
                npc.romanceEligible ===
                true,

            marriageEligible:
                npc.marriageEligible ===
                true,

            dualCultivationEligible:
                npc.dualCultivationEligible ===
                true,

            age:
                npc.age ??
                null,

            adultConfirmed:
                npc.adultConfirmed ===
                true,

            safePrivateLocation:
                npc.safePrivateLocation ===
                true
                ||
                npc.privateLocation ===
                true,

            dualCultivationCooldownUntil:
                npc.dualCultivationCooldownUntil ??
                null,

            dualCultivationCooldownActive:
                npc.dualCultivationCooldownActive ??
                false,

            dualCultivationCooldownReady:
                npc.dualCultivationCooldownReady ??
                true,


            relation: {

                tags:
                    relationTags,

                affinity:
                    npc.relation?.affinity ??
                    npc.affinity ??
                    0,

                trust:
                    npc.relation?.trust ??
                    npc.trust ??
                    0
            },

            publicRelationships:
                Array.isArray(
                    npc.publicRelationships
                )
                    ? npc.publicRelationships
                    : [],

            publicRelationshipVerifiedNone:
                npc.publicRelationshipVerifiedNone ===
                    true,

            location:
                localNPCs.location ||
                player.location ||
                '',

            place:
                npc.place ||
                '',

            date:
                localNPCs.date ||
                '',

            important:
                !!npc.important,

            /*
             * 미접촉 NPC를
             * 상세보기 했다고 관계 등록하지 않음.
             */
            registerRelation:
                npc.met === true
        };

        localStorage.setItem(
            TARGET_KEY,
            JSON.stringify(target)
        );

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

        window.dispatchEvent(
            new CustomEvent(
                'wuxia:target-layout'
            )
        );
    }


    // =========================================================
    // 행낭
    // =========================================================

    function normalizeBag() {
        const bag =
            (
                player.bag ||
                []
            )
            .map(
                item =>
                    typeof item ===
                    'string'
                        ? {
                            name: item
                        }
                        : {
                            ...item
                        }
            );

        const equipped = [];

        if (player.weaponData) {
            equipped.push({
                ...player.weaponData,

                type:
                    player.weaponData.type ||
                    'weapon',

                equipped: true,

                slot:
                    player.weaponData.slot ||
                    '주무기'
            });
        }

        for (
            const item
            of player.equipment ||
            []
        ) {
            equipped.push({
                ...item,
                equipped: true
            });
        }

        for (const eq of equipped) {
            const found =
                bag.find(
                    item =>
                        cleanName(item.name)
                        ===
                        cleanName(eq.name)
                );

            if (found) {
                Object.assign(
                    found,
                    eq,
                    {
                        equipped: true
                    }
                );
            } else {
                bag.unshift(eq);
            }
        }

        return bag;
    }


    function actionForItem(item) {
        if (item.equipped) {
            return {
                label: '장착 중',
                disabled: true
            };
        }

        const type =
            inferType(item);

        const name =
            cleanName(item.name);

        if (
            [
                'weapon',
                'equipment',
                'armor',
                'accessory'
            ].includes(type)
        ) {
            return {
                label: '장착',
                command:
                    `${name}을 장착한다`
            };
        }

        if (
            [
                'consumable',
                'medicine'
            ].includes(type)
        ) {
            return {
                label: '사용',
                command:
                    `${name}을 사용한다`,
                className: 'use'
            };
        }

        if (
            type === 'manual'
        ) {
            return {
                label: '익히기',
                command:
                    `${name}을 익힌다`,
                className: 'learn'
            };
        }

        return null;
    }


    function renderBag() {
        const bag =
            normalizeBag();

        let html = `
<div class="card">

    <div class="row">
        <span>보유금</span>

        <b style="color:#ffd15e">
            ${esc(
                player.money ||
                '0'
            )}
        </b>
    </div>

</div>
`;

        for (const item of bag) {
            const grade =
                itemGrade(item);

            const action =
                actionForItem(item);

            html += `
<div
    class="
        bag-card
        ${
            item.equipped
                ? 'equipped'
                : ''
        }
    "
>

    <div class="${gradeClass(grade)}">
        <b>
            ${esc(
                item.name ||
                ''
            )}
            ×${esc(
                Number.isFinite(Number(item.quantity))
                    ? Number(item.quantity)
                    : 1
            )}
        </b>
    </div>

    ${
        item.equipped
            ? `
<div
    style="
        color:#69df91;
        font-size:10px
    "
>
    ●
    ${esc(
        item.slot ||
        '장비'
    )}
    장착 중
</div>
`
            : ''
    }

    ${
        (() => {
            const allowed = new Set([
                'attack',
                'strength',
                'agility',
                'intelligence',
                'constitution',
                'innerPower'
            ]);

            const entries = Object.entries(
                item.stats || {}
            ).filter(
                ([k,v]) => {
                    if (!allowed.has(k)) return false;
                    const n = Number(v);
                    return Number.isFinite(n) && n !== 0;
                }
            );

            if (!entries.length) return '';

            return `
<div class="item-stats">
    ${entries.map(([k,v]) => `
<span class="item-stat">
    ${esc(STAT_LABELS[k] || k)}
    ${Number(v) > 0 ? '+' : ''}${esc(v)}
</span>
`).join('')}
</div>
`;
        })()
    }

    ${
        item.effects?.length
            ? `
<div>
    ${
        item.effects
            .map(
                x => `
<span class="chip chip-gold">
    ${esc(x)}
</span>
`
            )
            .join('')
    }
</div>
`
            : ''
    }

    ${
        item.description
            ? `
<div class="muted">
    ${esc(
        item.description
    )}
</div>
`
            : ''
    }

    ${
        action
            ? `
<button
    class="
        bag-action
        ${
            action.className ||
            ''
        }
    "

    ${
        action.disabled
            ? 'disabled'
            : ''
    }

    data-bag-command="${esc(
        action.command ||
        ''
    )}"
>
    ${esc(action.label)}
</button>
`
            : ''
    }

</div>
`;
        }

        return html;
    }


    // =========================================================
    // 전체 렌더
    // =========================================================

    function render() {
        if (!root) {
            return;
        }

        root.querySelector(
            '.wx-name'
        ).textContent =
            `${
                player.name ||
                '주인공'
            } Lv.${
                player.level ??
                '?'
            }`;

        root.querySelector(
            '.wx-sub'
        ).textContent =
            `${
                player.realm ||
                ''
            } · ${
                player.location ||
                ''
            }`;

        root.querySelectorAll(
            '.wx-tab'
        )
        .forEach(
            button => {
                button.classList.toggle(
                    'active',
                    button.dataset.tab ===
                    activeTab
                );
            }
        );

        const renders = {
            status:
                renderStatus,

            arts:
                renderArts,

            realm:
                renderRealm,

            training:
                renderTraining,

            map:
                renderMap,

            relations:
                renderRelations,

            local:
                renderLocalNPCs,

            bag:
                renderBag
        };

        root.querySelector(
            '.wx-content'
        ).innerHTML =
            (
                renders[activeTab]
                ||
                renderStatus
            )();

        if (
            [
                'relations',
                'local'
            ].includes(activeTab)
        ) {
            hydrateVisiblePortraits();
        }
    }


    // =========================================================
    // 위치
    // =========================================================

    function defaultLeft() {
        let right = 0;

        const candidates =
            document.querySelectorAll(
                'nav, [class*="sidebar"], [data-testid*="sidebar"]'
            );

        for (const el of candidates) {
            const rect =
                el.getBoundingClientRect();

            if (
                rect.left <= 12
                &&
                rect.width >= 140
                &&
                rect.width <= 450
                &&
                rect.height >
                    window.innerHeight *
                    .4
            ) {
                right =
                    Math.max(
                        right,
                        rect.right
                    );
            }
        }

        return (
            right > 40
                ? right + 10
                : 12
        );
    }


    function applyPosition() {
        if (!root) {
            return;
        }

        const left =
            savedPosition?.left ??
            defaultLeft();

        const top =
            savedPosition?.top ??
            72;

        root.style.setProperty(
            '--wx-left',
            `${Math.max(5,left)}px`
        );

        root.style.setProperty(
            '--wx-top',
            `${Math.max(5,top)}px`
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
                sx = event.clientX;
                sy = event.clientY;

                const rect =
                    root.getBoundingClientRect();

                sl = rect.left;
                st = rect.top;

                timer =
                    setTimeout(
                        () => {
                            dragging =
                                true;

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
                if (!dragging) {
                    return;
                }

                savedPosition = {
                    left:
                        Math.max(
                            5,
                            sl +
                            event.clientX -
                            sx
                        ),

                    top:
                        Math.max(
                            5,
                            st +
                            event.clientY -
                            sy
                        )
                };

                applyPosition();

                window.dispatchEvent(
                    new CustomEvent(
                        'wuxia:player-layout'
                    )
                );
            }
        );

        function finish() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }

            if (dragging) {
                dragging = false;

                localStorage.setItem(
                    POSITION_KEY,
                    JSON.stringify(
                        savedPosition
                    )
                );

                window.dispatchEvent(
                    new CustomEvent(
                        'wuxia:player-layout'
                    )
                );

                return;
            }

            root.classList.toggle(
                'collapsed'
            );

            const collapsed =
                root.classList.contains(
                    'collapsed'
                );

            handle.textContent =
                collapsed
                    ? '▶'
                    : '◀';

            localStorage.setItem(
                COLLAPSE_KEY,
                collapsed
                    ? '1'
                    : '0'
            );

            window.dispatchEvent(
                new CustomEvent(
                    'wuxia:player-layout'
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


    // =========================================================
    // UI 생성
    // =========================================================

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
            'wuxia-player-ui-v16',
            'wuxia-player-ui-v15',
            'wuxia-player-ui-v14',
            'wuxia-player-ui-v13'
        ]
        .forEach(
            id =>
                document
                    .getElementById(id)
                    ?.remove()
        );

        root =
            document.createElement(
                'aside'
            );

        root.id =
            ROOT_ID;

        root.innerHTML = `

<div class="wx-header">

    <button class="wx-toggle">
        ◀
    </button>

    <div class="wx-headtext">

        <div class="wx-name">
        </div>

        <div class="wx-sub">
        </div>

        <div class="wx-connected">
            ● RPG UI 연결됨
        </div>

    </div>

</div>


<div class="wx-body">

    <div class="wx-tabs">

        <button
            class="wx-tab active"
            data-tab="status"
        >
            상태
        </button>

        <button
            class="wx-tab"
            data-tab="arts"
        >
            무공
        </button>

        <button
            class="wx-tab"
            data-tab="realm"
        >
            경지
        </button>

        <button
            class="wx-tab"
            data-tab="training"
        >
            수련
        </button>

        <button
            class="wx-tab"
            data-tab="map"
        >
            지도
        </button>

        <button
            class="wx-tab"
            data-tab="relations"
        >
            관계
        </button>

        <button
            class="wx-tab"
            data-tab="local"
        >
            현지
        </button>

        <button
            class="wx-tab"
            data-tab="bag"
        >
            행낭
        </button>

    </div>


    <div class="wx-content">
    </div>

</div>
`;

        document.body.appendChild(
            root
        );

        if (
            localStorage.getItem(
                COLLAPSE_KEY
            ) === '1'
        ) {
            root.classList.add(
                'collapsed'
            );

            root.querySelector(
                '.wx-toggle'
            ).textContent =
                '▶';
        }

        installDrag(
            root.querySelector(
                '.wx-toggle'
            )
        );

        root.addEventListener(
            'click',
            event => {

                const tab =
                    event.target.closest(
                        '[data-tab]'
                    );

                if (tab) {
                    activeTab =
                        tab.dataset.tab;

                    if (
                        activeTab !== 'map'
                    ) {
                        mapExpanded =
                            false;

                        root.classList.remove(
                            'map-expanded'
                        );
                    }

                    render();

                    return;
                }


                const expand =
                    event.target.closest(
                        '[data-map-expand]'
                    );

                if (expand) {
                    mapExpanded =
                        !mapExpanded;

                    root.classList.toggle(
                        'map-expanded',
                        mapExpanded
                    );

                    render();

                    window.dispatchEvent(
                        new CustomEvent(
                            'wuxia:player-layout'
                        )
                    );

                    return;
                }


                const relation =
                    event.target.closest(
                        '[data-rel-filter]'
                    );

                if (relation) {
                    relationFilter =
                        relation.dataset
                            .relFilter;

                    render();

                    return;
                }


                const local =
                    event.target.closest(
                        '[data-local-filter]'
                    );

                if (local) {
                    localFilter =
                        local.dataset
                            .localFilter;

                    render();

                    return;
                }


                const detail =
                    event.target.closest(
                        '[data-local-detail]'
                    );

                if (detail) {
                    openLocalNPCDetail(
                        Number(
                            detail.dataset
                                .localDetail
                        )
                    );

                    return;
                }


                const relationDual =
                    event.target.closest(
                        '[data-rel-dual]'
                    );

                if (
                    relationDual &&
                    !relationDual.disabled
                ) {
                    const visibleRelations =
                        [
                            ...(
                                player.relations ||
                                []
                            )
                        ]
                        .filter(
                            relationMatch
                        );

                    const npc =
                        visibleRelations[
                            Number(
                                relationDual.dataset
                                    .relDual
                            )
                        ];

                    const contextualNpc =
                        npc
                            ? relationInteractionContext(
                                npc
                            )
                            : null;

                    if (
                        contextualNpc &&
                        dualCultivationState(
                            contextualNpc
                        ).enabled
                    ) {
                        setComposerText(
                            dualCultivationPrompt(
                                contextualNpc
                            )
                        );
                    }

                    return;
                }


                const action =
                    event.target.closest(
                        '[data-bag-command]'
                    );

                if (
                    action &&
                    !action.disabled
                ) {
                    const command =
                        action.dataset
                            .bagCommand;

                    if (command) {
                        setComposerText(
                            command
                        );
                    }
                }
            }
        );

        applyPosition();

        render();
    }


    // =========================================================
    // 데이터 갱신
    // =========================================================

    function refreshFromStorage() {
        const pRaw =
            localStorage.getItem(
                PLAYER_KEY
            ) || '';

        const tRaw =
            localStorage.getItem(
                TARGET_KEY
            ) || '';

        const lRaw =
            localStorage.getItem(
                LOCAL_NPCS_KEY
            ) || '';

        const eRaw =
            localStorage.getItem(
                ENEMY_KEY
            ) || '';

        let changed = false;

        if (
            pRaw !== lastPlayerRaw
        ) {
            lastPlayerRaw =
                pRaw;

            player =
                readPlayer();

            changed = true;
        }

        if (
            tRaw !== lastTargetRaw
        ) {
            lastTargetRaw =
                tRaw;

            changed = true;
        }

        if (
            lRaw !== lastLocalRaw
        ) {
            lastLocalRaw =
                lRaw;

            localNPCs =
                readLocalNPCs();

            changed = true;
        }

        if (
            eRaw !== lastEnemyRaw
        ) {
            lastEnemyRaw =
                eRaw;

            enemyState =
                readEnemy();

            changed = true;
        }

        if (changed) {
            render();
        }
    }


    // =========================================================
    // 시작
    // =========================================================

    function ensureUI() {
        if (
            !document.getElementById(
                ROOT_ID
            )
        ) {
            root = null;

            player =
                readPlayer();

            localNPCs =
                readLocalNPCs();

            enemyState =
                readEnemy();

            lastPlayerRaw =
                localStorage.getItem(
                    PLAYER_KEY
                ) || '';

            lastTargetRaw =
                localStorage.getItem(
                    TARGET_KEY
                ) || '';

            lastLocalRaw =
                localStorage.getItem(
                    LOCAL_NPCS_KEY
                ) || '';

            lastEnemyRaw =
                localStorage.getItem(
                    ENEMY_KEY
                ) || '';

            createUI();
        }
    }


    function init() {
        installStyle();

        createUI();

        window.addEventListener(
            'wuxia:data-updated',
            event => {
                if (
                    event.detail?.player
                    ||
                    event.detail?.target
                    ||
                    event.detail?.local
                    ||
                    event.detail?.enemy
                ) {
                    refreshFromStorage();
                }
            }
        );

        window.addEventListener(
            'wuxia:local-npcs-updated',
            refreshFromStorage
        );

        window.addEventListener(
            'resize',
            applyPosition
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
                    event.key ===
                        PLAYER_KEY
                    ||
                    event.key ===
                        TARGET_KEY
                    ||
                    event.key ===
                        LOCAL_NPCS_KEY
                    ||
                    event.key ===
                        ENEMY_KEY
                ) {
                    refreshFromStorage();
                }
            }
        );

        /*
         * 평소 상태 polling 제거.
         * SPA가 UI DOM을 날린 경우만 15초마다 복구.
         */
        setInterval(
            ensureUI,
            15000
        );

        console.log(
            '[무협 RPG] 통합 UI Lite v2.11 · 이벤트 모드'
        );
    }


    init();

})();
