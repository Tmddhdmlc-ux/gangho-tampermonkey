// ==UserScript==
// @name         무협 RPG 초상화 UI Lite v2.2
// @namespace    wuxia-rpg-portrait-lite
// @version      2.2
// @description  이벤트형 주인공/NPC 초상화 자동도킹 + 전투 중 적 초상화 숨김 + 저부하
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-portrait.user.js
// @downloadURL  https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-portrait.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const ROOT_ID =
        'wuxia-portrait-ui-v20';

    const STYLE_ID =
        'wuxia-portrait-style-v22';

    const PLAYER_KEY =
        'wuxia_rpg_status_v2';

    const TARGET_KEY =
        'wuxia_rpg_target_v1';

    const DB_NAME =
        'wuxia_portrait_db';

    const STORE_NAME =
        'portraits';

    const PLAYER_SLOT =
        '__PLAYER__';

    const SETTINGS_KEY =
        'wuxia_portrait_settings_v20';

    const OLD_SETTINGS_KEY =
        'wuxia_portrait_settings_v14';

    const GAP =
        10;

    const PLAYER_PANEL_IDS = [
        'wuxia-player-ui-v20',
        'wuxia-player-ui-v16'
    ];

    const TARGET_PANEL_IDS = [
        'wuxia-target-inspector-v20',
        'wuxia-target-inspector-v12'
    ];

    const DEFAULT_SETTINGS = {
        playerWidth: 165,
        targetWidth: 165,
        autoShrink: true,
        adjustOpen: false,
        managerOpen: false
    };

    let settings =
        loadSettings();

    let root =
        null;

    let dbPromise =
        null;

    let lastPlayerRaw =
        '';

    let lastTargetRaw =
        '';

    let state = {
        playerName:
            '',

        playerRealm:
            '',

        targetActive:
            false,

        targetMode:
            'npc',

        targetName:
            '',

        targetFaction:
            '',

        targetRealm:
            '',

        targetTags:
            []
    };

    const cache = {};

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

    function loadSettings() {
        const current =
            parse(
                localStorage.getItem(
                    SETTINGS_KEY
                ),
                null
            );

        const old =
            parse(
                localStorage.getItem(
                    OLD_SETTINGS_KEY
                ),
                null
            );

        return {
            ...DEFAULT_SETTINGS,
            ...(old || {}),
            ...(current || {})
        };
    }

    function saveSettings() {
        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(
                settings
            )
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

    function clamp(
        value,
        min,
        max
    ) {
        return Math.max(
            min,
            Math.min(
                max,
                Number(value)
            )
        );
    }

    function isPlayerFilename(
        filename
    ) {
        const base =
            String(filename || '')
                .replace(
                    /\.[^.]+$/,
                    ''
                )
                .trim();

        return /^player[_\- ]/i
            .test(base);
    }

    function filenameToKey(
        filename
    ) {
        if (
            isPlayerFilename(
                filename
            )
        ) {
            return PLAYER_SLOT;
        }

        return String(
            filename || ''
        )
            .replace(
                /\.[^.]+$/,
                ''
            )
            .replace(
                /^(npc|portrait)[_\- ]+/i,
                ''
            )
            .trim();
    }

    function getDB() {
        if (dbPromise) {
            return dbPromise;
        }

        dbPromise =
            new Promise(
                (
                    resolve,
                    reject
                ) => {
                    const request =
                        indexedDB.open(
                            DB_NAME,
                            1
                        );

                    request.onupgradeneeded =
                        () => {
                            const db =
                                request.result;

                            if (
                                !db.objectStoreNames
                                    .contains(
                                        STORE_NAME
                                    )
                            ) {
                                db.createObjectStore(
                                    STORE_NAME,
                                    {
                                        keyPath:
                                            'key'
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

        return dbPromise;
    }

    async function dbGet(key) {
        const db =
            await getDB();

        return new Promise(
            (
                resolve,
                reject
            ) => {
                const tx =
                    db.transaction(
                        STORE_NAME,
                        'readonly'
                    );

                const request =
                    tx.objectStore(
                        STORE_NAME
                    )
                    .get(key);

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
    }

    async function dbPut(record) {
        const db =
            await getDB();

        return new Promise(
            (
                resolve,
                reject
            ) => {
                const tx =
                    db.transaction(
                        STORE_NAME,
                        'readwrite'
                    );

                tx.objectStore(
                    STORE_NAME
                )
                .put(record);

                tx.oncomplete =
                    () =>
                        resolve(true);

                tx.onerror =
                    () =>
                        reject(
                            tx.error
                        );
            }
        );
    }

    async function dbAll() {
        const db =
            await getDB();

        return new Promise(
            (
                resolve,
                reject
            ) => {
                const tx =
                    db.transaction(
                        STORE_NAME,
                        'readonly'
                    );

                const request =
                    tx.objectStore(
                        STORE_NAME
                    )
                    .getAll();

                request.onsuccess =
                    () => {
                        const list =
                            request.result || [];

                        list.sort(
                            (a,b) => {
                                if (
                                    a.key ===
                                    PLAYER_SLOT
                                ) {
                                    return -1;
                                }

                                if (
                                    b.key ===
                                    PLAYER_SLOT
                                ) {
                                    return 1;
                                }

                                return String(
                                    a.key
                                )
                                .localeCompare(
                                    String(
                                        b.key
                                    ),
                                    'ko'
                                );
                            }
                        );

                        resolve(
                            list
                        );
                    };

                request.onerror =
                    () =>
                        reject(
                            request.error
                        );
            }
        );
    }

    async function dbDelete(key) {
        const db =
            await getDB();

        return new Promise(
            (
                resolve,
                reject
            ) => {
                const tx =
                    db.transaction(
                        STORE_NAME,
                        'readwrite'
                    );

                tx.objectStore(
                    STORE_NAME
                )
                .delete(key);

                tx.oncomplete =
                    () =>
                        resolve(true);

                tx.onerror =
                    () =>
                        reject(
                            tx.error
                        );
            }
        );
    }

    async function getPortrait(key) {
        if (
            cache[key] !==
            undefined
        ) {
            return cache[key];
        }

        cache[key] =
            await dbGet(key);

        return cache[key];
    }

    function readFile(file) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                const reader =
                    new FileReader();

                reader.onload =
                    () =>
                        resolve(
                            reader.result
                        );

                reader.onerror =
                    () =>
                        reject(
                            reader.error
                        );

                reader.readAsDataURL(
                    file
                );
            }
        );
    }

    function syncState() {
        const playerRaw =
            localStorage.getItem(
                PLAYER_KEY
            ) || '';

        const targetRaw =
            localStorage.getItem(
                TARGET_KEY
            ) || '';

        const changed =
            playerRaw !==
                lastPlayerRaw ||
            targetRaw !==
                lastTargetRaw;

        lastPlayerRaw =
            playerRaw;

        lastTargetRaw =
            targetRaw;

        const player =
            parse(
                playerRaw,
                {}
            ) || {};

        const target =
            parse(
                targetRaw,
                {}
            ) || {};

        state.playerName =
            player.name ||
            '';

        state.playerRealm =
            player.realm ||
            '';

        state.targetActive =
            !!target.active;

        state.targetMode =
            target.mode ||
            'npc';

        state.targetName =
            target.name ||
            '';

        state.targetFaction =
            target.faction ||
            '';

        state.targetRealm =
            target.realm ||
            '';

        state.targetTags =
            target.relation?.tags ||
            [];

        return changed;
    }

    function findPanel(ids) {
        for (const id of ids) {
            const el =
                document.getElementById(id);

            if (!el) continue;

            const rect =
                el.getBoundingClientRect();

            const style =
                getComputedStyle(el);

            if (
                rect.width > 20 &&
                rect.height > 20 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'
            ) {
                return el;
            }
        }

        return null;
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

#${ROOT_ID}{
position:fixed!important;
inset:0!important;
z-index:2147483600!important;
pointer-events:none!important;
font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important
}

#${ROOT_ID} *{box-sizing:border-box!important}

.p-card{
position:fixed!important;
width:var(--pw,165px)!important;
overflow:hidden!important;
border:1px solid rgba(255,255,255,.15)!important;
border-radius:14px!important;
background:rgba(15,15,21,.97)!important;
box-shadow:0 12px 30px rgba(0,0,0,.43)!important;
pointer-events:auto!important
}

.p-player{border-color:rgba(94,177,255,.38)!important}
.p-target{border-color:rgba(255,104,123,.4)!important}
.p-target.enemy{border-color:rgba(255,60,78,.58)!important}
.p-card.hidden{display:none!important}

.p-imgbox{
width:100%!important;
height:var(--ph,205px)!important;
overflow:hidden!important;
background:#24242d!important
}

.p-img{
width:100%!important;
height:100%!important;
object-fit:cover!important;
object-position:center 28%!important;
display:block!important
}

.p-placeholder{
width:100%!important;
height:100%!important;
display:flex!important;
align-items:center!important;
justify-content:center!important;
color:#858792!important;
font-size:11px!important
}

.p-info{padding:8px 9px 9px!important}

.p-name{
font-size:14px!important;
font-weight:950!important;
color:#fff!important;
white-space:nowrap!important;
overflow:hidden!important;
text-overflow:ellipsis!important
}

.p-sub{
margin-top:2px!important;
font-size:10px!important;
color:#acaeba!important;
white-space:nowrap!important;
overflow:hidden!important;
text-overflow:ellipsis!important
}

.p-tags{
margin-top:5px!important;
display:flex!important;
gap:3px!important;
overflow:hidden!important
}

.p-tag{
padding:2px 5px!important;
border:1px solid rgba(255,255,255,.1)!important;
border-radius:999px!important;
font-size:8px!important;
white-space:nowrap!important
}

.p-tools{
position:fixed!important;
top:10px!important;
right:12px!important;
display:flex!important;
gap:6px!important;
pointer-events:auto!important;
z-index:2147483640!important
}

.p-tool{
min-height:34px!important;
padding:6px 10px!important;
border:1px solid rgba(255,255,255,.14)!important;
border-radius:9px!important;
background:rgba(18,18,24,.97)!important;
cursor:pointer!important;
font-size:11px!important;
font-weight:900!important;
box-shadow:0 8px 22px rgba(0,0,0,.34)!important
}

.p-adjust-btn{color:#ffd66c!important}
.p-manager-btn{color:#d3a5ff!important}

.p-panel{
position:fixed!important;
top:50px!important;
right:12px!important;
width:310px!important;
padding:11px!important;
border:1px solid rgba(255,255,255,.13)!important;
border-radius:11px!important;
background:rgba(16,16,22,.99)!important;
box-shadow:0 18px 40px rgba(0,0,0,.48)!important;
pointer-events:auto!important;
z-index:2147483641!important;
display:none!important
}

#${ROOT_ID}.adjust-open .p-adjust{display:block!important}
#${ROOT_ID}.manager-open .p-manager{display:block!important}

.p-title{
margin-bottom:10px!important;
font-size:13px!important;
font-weight:950!important;
color:#fff!important
}

.p-slider-row{margin-bottom:13px!important}

.p-slider-head{
display:flex!important;
justify-content:space-between!important;
margin-bottom:5px!important;
font-size:11px!important;
color:#cbccd3!important
}

.p-slider{width:100%!important;accent-color:#d7a94f!important}

.p-check{
display:flex!important;
justify-content:space-between!important;
margin-bottom:12px!important;
font-size:11px!important;
color:#b0b2bc!important
}

.p-button{
width:100%!important;
min-height:32px!important;
border:1px solid rgba(100,175,255,.25)!important;
border-radius:8px!important;
background:rgba(70,135,210,.08)!important;
color:#8ec8ff!important;
cursor:pointer!important;
font-size:10px!important;
font-weight:900!important;
margin-bottom:8px!important
}

.p-row{
display:flex!important;
align-items:center!important;
gap:7px!important;
padding:6px!important;
margin-bottom:6px!important;
border:1px solid rgba(255,255,255,.08)!important;
border-radius:8px!important
}

.p-thumb{
width:42px!important;
height:42px!important;
object-fit:cover!important;
border-radius:7px!important
}

.p-rowtext{
flex:1!important;
min-width:0!important
}

.p-rowname{
font-size:11px!important;
font-weight:900!important;
white-space:nowrap!important;
overflow:hidden!important;
text-overflow:ellipsis!important
}

.p-rowfile{
font-size:9px!important;
color:#838690!important;
white-space:nowrap!important;
overflow:hidden!important;
text-overflow:ellipsis!important
}

.p-delete{
padding:4px 6px!important;
border:1px solid rgba(255,85,105,.25)!important;
border-radius:6px!important;
background:rgba(130,25,40,.12)!important;
color:#ff7786!important;
cursor:pointer!important;
font-size:9px!important
}

`;

        document.head.appendChild(
            style
        );
    }

    function updatePanelClasses() {
        root.classList.toggle(
            'adjust-open',
            !!settings.adjustOpen
        );

        root.classList.toggle(
            'manager-open',
            !!settings.managerOpen
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
            'wuxia-portrait-ui-v14',
            'wuxia-portrait-ui-v13',
            'wuxia-portrait-ui-v12'
        ]
        .forEach(
            id =>
                document.getElementById(
                    id
                )?.remove()
        );

        root =
            document.createElement(
                'div'
            );

        root.id =
            ROOT_ID;

        root.innerHTML = `
<div class="p-tools">
    <button class="p-tool p-adjust-btn" data-open="adjust">↔ 조정</button>
    <button class="p-tool p-manager-btn" data-open="manager">🖼 초상화</button>
</div>

<div class="p-card p-player"></div>
<div class="p-card p-target hidden"></div>

<div class="p-panel p-adjust">
    <div class="p-title">초상화 크기</div>

    <div class="p-slider-row">
        <div class="p-slider-head">
            <span>주인공</span>
            <b data-value="player"></b>
        </div>
        <input class="p-slider" type="range" min="80" max="320" step="5" data-slider="player">
    </div>

    <div class="p-slider-row">
        <div class="p-slider-head">
            <span>상대</span>
            <b data-value="target"></b>
        </div>
        <input class="p-slider" type="range" min="80" max="320" step="5" data-slider="target">
    </div>

    <label class="p-check">
        <span>좁을 때 자동 축소</span>
        <input type="checkbox" data-auto="1">
    </label>

    <button class="p-button" data-reset="1">기본 크기</button>
</div>

<div class="p-panel p-manager">
    <div class="p-title">초상화 관리</div>
    <button class="p-button" data-register="1">초상화 등록</button>
    <div class="p-list"></div>
</div>

<input type="file" accept="image/*" multiple style="display:none" class="p-file">
`;

        document.body.appendChild(
            root
        );

        bindEvents();
        syncControls();
    }

    function bindEvents() {
        root.addEventListener(
            'click',
            async event => {
                const open =
                    event.target.closest(
                        '[data-open]'
                    );

                if (open) {
                    const type =
                        open.dataset.open;

                    if (
                        type === 'adjust'
                    ) {
                        settings.adjustOpen =
                            !settings.adjustOpen;

                        settings.managerOpen =
                            false;
                    } else {
                        settings.managerOpen =
                            !settings.managerOpen;

                        settings.adjustOpen =
                            false;

                        if (
                            settings.managerOpen
                        ) {
                            await renderManager();
                        }
                    }

                    saveSettings();
                    updatePanelClasses();
                    return;
                }

                if (
                    event.target.closest(
                        '[data-register]'
                    )
                ) {
                    root.querySelector(
                        '.p-file'
                    ).click();

                    return;
                }

                if (
                    event.target.closest(
                        '[data-reset]'
                    )
                ) {
                    settings.playerWidth =
                        165;

                    settings.targetWidth =
                        220;

                    settings.autoShrink =
                        true;

                    saveSettings();
                    syncControls();
                    positionCards();
                    return;
                }

                const del =
                    event.target.closest(
                        '[data-delete]'
                    );

                if (del) {
                    const key =
                        del.dataset.delete;

                    if (
                        !confirm(
                            `${
                                key === PLAYER_SLOT
                                    ? '주인공'
                                    : key
                            } 초상화를 삭제할까?`
                        )
                    ) {
                        return;
                    }

                    await dbDelete(key);
                    delete cache[key];

                    await renderManager();
                    await refreshCards();
                }
            }
        );

        root.addEventListener(
            'input',
            event => {
                const slider =
                    event.target.closest(
                        '[data-slider]'
                    );

                if (slider) {
                    const value =
                        clamp(
                            slider.value,
                            80,
                            320
                        );

                    if (
                        slider.dataset.slider ===
                        'player'
                    ) {
                        settings.playerWidth =
                            value;
                    } else {
                        settings.targetWidth =
                            value;
                    }

                    saveSettings();
                    syncControls();
                    positionCards();
                    return;
                }

                const auto =
                    event.target.closest(
                        '[data-auto]'
                    );

                if (auto) {
                    settings.autoShrink =
                        auto.checked;

                    saveSettings();
                    positionCards();
                }
            }
        );

        root.querySelector(
            '.p-file'
        )
        .addEventListener(
            'change',
            async event => {
                for (
                    const file
                    of Array.from(
                        event.target.files ||
                        []
                    )
                ) {
                    const key =
                        filenameToKey(
                            file.name
                        );

                    if (!key) continue;

                    const image =
                        await readFile(
                            file
                        );

                    const record = {
                        key,
                        filename:
                            file.name,
                        image,
                        updatedAt:
                            Date.now()
                    };

                    await dbPut(
                        record
                    );

                    cache[key] =
                        record;
                }

                event.target.value =
                    '';

                await renderManager();
                await refreshCards();
            }
        );
    }

    function syncControls() {
        if (!root) return;

        root.querySelector(
            '[data-slider="player"]'
        ).value =
            settings.playerWidth;

        root.querySelector(
            '[data-slider="target"]'
        ).value =
            settings.targetWidth;

        root.querySelector(
            '[data-value="player"]'
        ).textContent =
            `${settings.playerWidth}px`;

        root.querySelector(
            '[data-value="target"]'
        ).textContent =
            `${settings.targetWidth}px`;

        root.querySelector(
            '[data-auto]'
        ).checked =
            !!settings.autoShrink;

        updatePanelClasses();
    }

    async function renderManager() {
        const list =
            await dbAll();

        root.querySelector(
            '.p-list'
        ).innerHTML =
            list.length
                ? list.map(
                    item => `
<div class="p-row">
    <img class="p-thumb" src="${esc(item.image)}">

    <div class="p-rowtext">
        <div class="p-rowname">
            ${esc(item.key === PLAYER_SLOT ? '★ 주인공' : item.key)}
        </div>
        <div class="p-rowfile">${esc(item.filename || '')}</div>
    </div>

    <button class="p-delete" data-delete="${esc(item.key)}">삭제</button>
</div>
`
                ).join('')
                : '<div style="font-size:10px;color:#888">등록된 초상화 없음</div>';
    }

    function cardHTML(
        isPlayer,
        portrait
    ) {
        const name =
            isPlayer
                ? state.playerName
                : state.targetName;

        const sub =
            isPlayer
                ? state.playerRealm
                : [
                    state.targetFaction,
                    state.targetRealm
                ]
                .filter(Boolean)
                .join(' · ');

        const tags =
            isPlayer
                ? []
                : state.targetTags.slice(
                    0,
                    2
                );

        return `
<div class="p-imgbox">
    ${
        portrait?.image
            ? `<img class="p-img" src="${esc(portrait.image)}">`
            : `<div class="p-placeholder">${esc(name)}<br>초상화 없음</div>`
    }
</div>

<div class="p-info">
    <div class="p-name">${esc(name)}</div>
    <div class="p-sub">${esc(sub)}</div>

    ${
        tags.length
            ? `<div class="p-tags">${tags.map(x=>`<span class="p-tag">${esc(x)}</span>`).join('')}</div>`
            : ''
    }
</div>
`;
    }

    async function refreshCards() {
        if (!root) return;

        const playerCard =
            root.querySelector(
                '.p-player'
            );

        const targetCard =
            root.querySelector(
                '.p-target'
            );

        if (
            state.playerName
        ) {
            playerCard.innerHTML =
                cardHTML(
                    true,
                    await getPortrait(
                        PLAYER_SLOT
                    )
                );

            playerCard.classList.remove(
                'hidden'
            );
        } else {
            playerCard.classList.add(
                'hidden'
            );
        }

        /*
         * 전투 대상(enemy)은 대상 정보창/다중 적 패널이 담당한다.
         * 초상화 카드까지 띄우면 패널을 덮고, 초상화가 없는 적은
         * 거대한 "초상화 없음" 카드가 생기므로 전투 중에는 숨긴다.
         * NPC도 실제 등록된 초상화가 있을 때만 표시한다.
         */
        if (
            state.targetActive &&
            state.targetMode !== 'enemy' &&
            state.targetName
        ) {
            const portrait =
                await getPortrait(
                    state.targetName
                );

            if (portrait?.image) {
                targetCard.innerHTML =
                    cardHTML(
                        false,
                        portrait
                    );

                targetCard.classList.remove(
                    'hidden'
                );

                targetCard.classList.remove(
                    'enemy'
                );
            } else {
                targetCard.classList.add(
                    'hidden'
                );
            }
        } else {
            targetCard.classList.add(
                'hidden'
            );
        }

        positionCards();
    }

    function actualWidth(wanted) {
        wanted =
            clamp(
                wanted,
                80,
                320
            );

        if (
            !settings.autoShrink
        ) {
            return wanted;
        }

        if (
            window.innerWidth <
            950
        ) {
            return Math.min(
                wanted,
                125
            );
        }

        if (
            window.innerWidth <
            1150
        ) {
            return Math.min(
                wanted,
                180
            );
        }

        return wanted;
    }

    function sizeCard(
        card,
        width
    ) {
        const height =
            Math.round(
                width *
                1.22
            );

        card.style.setProperty(
            '--pw',
            `${width}px`
        );

        card.style.setProperty(
            '--ph',
            `${height}px`
        );

        return height;
    }

    function positionCards() {
        if (!root) return;

        const playerCard =
            root.querySelector(
                '.p-player'
            );

        const targetCard =
            root.querySelector(
                '.p-target'
            );

        const playerPanel =
            findPanel(
                PLAYER_PANEL_IDS
            );

        const targetPanel =
            findPanel(
                TARGET_PANEL_IDS
            );

        const pw =
            actualWidth(
                settings.playerWidth
            );

        const tw =
            actualWidth(
                settings.targetWidth
            );

        const ph =
            sizeCard(
                playerCard,
                pw
            );

        const th =
            sizeCard(
                targetCard,
                tw
            );

        if (playerPanel) {
            const r =
                playerPanel.getBoundingClientRect();

            playerCard.style.left =
                `${Math.max(
                    8,
                    r.right + GAP
                )}px`;

            playerCard.style.right =
                'auto';

            playerCard.style.top =
                `${Math.max(
                    52,
                    Math.min(
                        r.top + 24,
                        window.innerHeight -
                        ph -
                        65
                    )
                )}px`;
        } else {
            playerCard.style.left =
                '12px';

            playerCard.style.top =
                '90px';
        }

        if (
            state.targetActive &&
            state.targetMode !== 'enemy' &&
            state.targetName &&
            !targetCard.classList.contains('hidden')
        ) {
            if (targetPanel) {
                const r =
                    targetPanel
                        .getBoundingClientRect();

                targetCard.style.left =
                    `${Math.max(
                        8,
                        r.left -
                        GAP -
                        tw
                    )}px`;

                targetCard.style.right =
                    'auto';

                targetCard.style.top =
                    `${Math.max(
                        52,
                        Math.min(
                            r.top + 24,
                            window.innerHeight -
                            th -
                            70
                        )
                    )}px`;
            } else {
                targetCard.style.left =
                    'auto';

                targetCard.style.right =
                    '12px';

                targetCard.style.top =
                    '90px';
            }
        }
    }

    async function migratePlayer() {
        const existing =
            await dbGet(
                PLAYER_SLOT
            );

        if (existing) {
            return;
        }

        const all =
            await dbAll();

        const old =
            all
                .filter(
                    item =>
                        isPlayerFilename(
                            item.filename
                        )
                )
                .sort(
                    (a,b) =>
                        Number(
                            b.updatedAt || 0
                        )
                        -
                        Number(
                            a.updatedAt || 0
                        )
                )[0];

        if (!old) {
            return;
        }

        const migrated = {
            ...old,
            key:
                PLAYER_SLOT,
            updatedAt:
                Date.now()
        };

        await dbPut(
            migrated
        );

        cache[
            PLAYER_SLOT
        ] =
            migrated;
    }

    async function refreshState() {
        const changed =
            syncState();

        if (changed) {
            await refreshCards();
        } else {
            positionCards();
        }
    }

    async function ensureUI() {
        if (
            !document.getElementById(
                ROOT_ID
            )
        ) {
            root = null;

            createUI();

            syncState();

            syncControls();

            await refreshCards();
        }
    }


    async function init() {
        installStyle();
        createUI();

        await migratePlayer();

        syncState();
        syncControls();

        await refreshCards();

        window.addEventListener(
            'wuxia:data-updated',
            refreshState
        );

        window.addEventListener(
            'wuxia:player-layout',
            positionCards
        );

        window.addEventListener(
            'wuxia:target-layout',
            positionCards
        );

        window.addEventListener(
            'resize',
            positionCards
        );

        window.addEventListener(
            'pageshow',
            refreshState
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
                        PLAYER_KEY ||
                    event.key ===
                        TARGET_KEY
                ) {
                    refreshState();
                }
            }
        );

        /*
         * DOM 복구만 15초에 한 번.
         * 평소에는 위치/상태 폴링 없음.
         */
        setInterval(
            ensureUI,
            15000
        );

        console.log(
            '[무협 RPG] 초상화 UI Lite v2.1 · 이벤트 모드'
        );
    }


    init();

})();