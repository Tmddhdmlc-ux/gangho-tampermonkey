// ==UserScript==
// @name         무협 RPG 세션 컨트롤러 v1.5
// @namespace    wuxia-rpg-session
// @version      1.5
// @description  이벤트형 세션 컨트롤러 - 런처 길게눌러 드래그/캐릭터 보관함/백업복구/이름별 파일저장
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-session.user.js
// @downloadURL  https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-session.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // RPG 데이터
    // =========================================================

    const SESSION_KEY =
        'wuxia_rpg_session_v1';

    const PLAYER_KEY =
        'wuxia_rpg_status_v2';

    const TARGET_KEY =
        'wuxia_rpg_target_v1';

    const ENEMY_KEY =
        'wuxia_rpg_enemy_v2';

    const BACKUP_KEY =
        'wuxia_rpg_save_guard_backups_v1';

    const CHARACTER_SLOTS_KEY =
        'wuxia_rpg_character_slots_v1';

    const NEW_GAME_KEY =
        'wuxia_rpg_new_game_pending_v1';


    /*
     * 기존 왼쪽 통합창 위치를 그대로 사용
     */
    const PLAYER_POSITION_KEY =
        'wuxia_rpg_panel_position_v2';


    /*
     * 스타트 런처는 통합 상태창과 별도로
     * 사용자가 옮긴 위치를 기억한다.
     */
    const LAUNCHER_POSITION_KEY =
        'wuxia_rpg_launcher_position_v1';


    const MAX_BACKUPS =
        30;


    // =========================================================
    // 세이브 폴더 Handle
    // =========================================================

    const FS_DB_NAME =
        'wuxia_rpg_file_system';

    const FS_STORE =
        'handles';

    const SAVE_DIR_KEY =
        'save-directory';


    // =========================================================
    // UI
    // =========================================================

    const ROOT_ID =
        'wuxia-session-launcher-v13';

    const STYLE_ID =
        'wuxia-session-style-v13';


    let fsDbPromise =
        null;


    let lastSessionSignature =
        '';


    let vaultOpen =
        false;


    // =========================================================
    // JSON
    // =========================================================

    function parse(
        raw,
        fallback = null
    ) {

        try {

            return raw
                ? JSON.parse(raw)
                : fallback;

        }

        catch (_) {

            return fallback;
        }
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

        }

        catch (error) {

            console.error(
                '[무협 RPG]',
                error
            );


            return false;
        }
    }


    function escapeHTML(value) {

        return String(
            value ?? ''
        )
            .replaceAll(
                '&',
                '&amp;'
            )
            .replaceAll(
                '<',
                '&lt;'
            )
            .replaceAll(
                '>',
                '&gt;'
            )
            .replaceAll(
                '"',
                '&quot;'
            )
            .replaceAll(
                "'",
                '&#039;'
            );
    }


    // =========================================================
    // 현재 캐릭터
    // =========================================================

    function getPlayer() {

        return parse(
            localStorage.getItem(
                PLAYER_KEY
            ),
            null
        );
    }


    function hasPlayerSave() {

        const player =
            getPlayer();


        return !!(
            player &&
            typeof player === 'object' &&
            Object.keys(player).length
        );
    }


    // =========================================================
    // 세션
    // =========================================================

    function getSession() {

        const session =
            parse(
                localStorage.getItem(
                    SESSION_KEY
                ),
                null
            );


        if (
            session &&
            typeof session.active ===
            'boolean'
        ) {

            return session;
        }


        return {
            active:
                hasPlayerSave()
        };
    }


    function setSession(
        active
    ) {

        saveJSON(
            SESSION_KEY,
            {
                ...getSession(),

                active:
                    !!active,

                changedAt:
                    new Date()
                        .toISOString()
            }
        );


        applySession();
    }


    // =========================================================
    // 스냅샷
    // =========================================================

    function makeSnapshot(
        reason = 'manual'
    ) {

        return {

            saveFormat:
                'wuxia-rpg-save',

            saveVersion:
                3,

            savedAt:
                new Date()
                    .toISOString(),

            reason,


            player:
                parse(
                    localStorage.getItem(
                        PLAYER_KEY
                    ),
                    {}
                ),


            target:
                parse(
                    localStorage.getItem(
                        TARGET_KEY
                    ),
                    {
                        active: false
                    }
                ),


            enemy:
                parse(
                    localStorage.getItem(
                        ENEMY_KEY
                    ),
                    {
                        active: false,
                        enemies: []
                    }
                )
        };
    }


    // =========================================================
    // 자동백업
    // =========================================================

    function backupCurrent(
        reason = 'manual'
    ) {

        if (
            !hasPlayerSave()
        ) {

            return false;
        }


        let backups =
            parse(
                localStorage.getItem(
                    BACKUP_KEY
                ),
                []
            ) || [];


        backups.push(
            makeSnapshot(
                reason
            )
        );


        backups =
            backups.slice(
                -MAX_BACKUPS
            );


        return saveJSON(
            BACKUP_KEY,
            backups
        );
    }


    // =========================================================
    // ★ 캐릭터 보관함
    // =========================================================

    function getCharacterSlots() {

        return (
            parse(
                localStorage.getItem(
                    CHARACTER_SLOTS_KEY
                ),
                {}
            )
            ||
            {}
        );
    }


    function characterSlotName(
        player
    ) {

        return String(
            player?.name ||
            '이름 없는 무인'
        ).trim();
    }


    function archiveCurrentCharacter(
        reason =
            'archive'
    ) {

        if (
            !hasPlayerSave()
        ) {

            return false;
        }


        const snapshot =
            makeSnapshot(
                reason
            );


        const player =
            snapshot.player;


        const name =
            characterSlotName(
                player
            );


        if (
            !name
        ) {

            return false;
        }


        const slots =
            getCharacterSlots();


        slots[
            name
        ] = {
            ...snapshot,

            slotName:
                name,

            archivedAt:
                new Date()
                    .toISOString()
        };


        const success =
            saveJSON(
                CHARACTER_SLOTS_KEY,
                slots
            );


        /*
         * 실제 저장됐는지 검증
         */
        const verify =
            getCharacterSlots();


        return !!(
            success &&
            verify[name]?.player
        );
    }


    function getSortedSlots() {

        return Object.values(
            getCharacterSlots()
        )
        .filter(
            slot =>
                slot?.player
        )
        .sort(
            (
                a,
                b
            ) => {

                const ad =
                    new Date(
                        a.archivedAt ||
                        a.savedAt ||
                        0
                    )
                    .getTime();


                const bd =
                    new Date(
                        b.archivedAt ||
                        b.savedAt ||
                        0
                    )
                    .getTime();


                return bd - ad;
            }
        );
    }


    function deleteCharacterSlot(
        name
    ) {

        const slots =
            getCharacterSlots();


        delete slots[
            name
        ];


        saveJSON(
            CHARACTER_SLOTS_KEY,
            slots
        );
    }


    // =========================================================
    // 최근 복구 후보
    // =========================================================

    function getLatestRecovery() {

        const candidates = [];


        /*
         * 캐릭터 보관함
         */
        for (
            const slot
            of getSortedSlots()
        ) {

            if (
                slot.player &&
                Object.keys(
                    slot.player
                ).length
            ) {

                candidates.push(
                    slot
                );
            }
        }


        /*
         * 과거 Save Guard / Core 백업
         */
        const backups =
            parse(
                localStorage.getItem(
                    BACKUP_KEY
                ),
                []
            ) || [];


        for (
            const backup
            of backups
        ) {

            if (
                backup?.player &&
                Object.keys(
                    backup.player
                ).length
            ) {

                candidates.push(
                    backup
                );
            }
        }


        if (
            !candidates.length
        ) {

            return null;
        }


        candidates.sort(
            (
                a,
                b
            ) => {

                const ad =
                    new Date(
                        a.archivedAt ||
                        a.savedAt ||
                        0
                    )
                    .getTime();


                const bd =
                    new Date(
                        b.archivedAt ||
                        b.savedAt ||
                        0
                    )
                    .getTime();


                return bd - ad;
            }
        );


        return candidates[0];
    }


    // =========================================================
    // 스냅샷 복구
    // =========================================================

    function restoreSnapshot(
        snapshot,
        loginAfter = true
    ) {

        if (
            !snapshot?.player ||
            !Object.keys(
                snapshot.player
            ).length
        ) {

            return false;
        }


        /*
         * 현재 캐릭터가 있다면 먼저 보호
         */
        if (
            hasPlayerSave()
        ) {

            backupCurrent(
                'before-restore'
            );


            archiveCurrentCharacter(
                'before-restore'
            );
        }


        saveJSON(
            PLAYER_KEY,
            snapshot.player
        );


        saveJSON(
            TARGET_KEY,
            snapshot.target ||
            {
                active: false
            }
        );


        saveJSON(
            ENEMY_KEY,
            snapshot.enemy ||
            {
                active: false,
                enemies: []
            }
        );


        /*
         * 복구한 캐릭터도 즉시 보관함에 등록
         */
        archiveCurrentCharacter(
            'restored'
        );


        localStorage.removeItem(
            NEW_GAME_KEY
        );


        notifyGameUI();


        if (
            loginAfter
        ) {

            setSession(
                true
            );
        }


        return true;
    }


    // =========================================================
    // 파일명
    // =========================================================

    function safeFileName(name) {

        let result =
            String(
                name ||
                '이름없는무인'
            )
            .trim()
            .replace(
                /[\\/:*?"<>|]/g,
                '_'
            )
            .replace(
                /\.+$/g,
                ''
            );


        return (
            result ||
            '이름없는무인'
        );
    }


    function currentSaveFileName() {

        const player =
            getPlayer() ||
            {};


        return (
            safeFileName(
                player.name
            )
            +
            '.json'
        );
    }


    // =========================================================
    // 폴더 DB
    // =========================================================

    function getFsDB() {

        if (
            fsDbPromise
        ) {

            return fsDbPromise;
        }


        fsDbPromise =
            new Promise(
                (
                    resolve,
                    reject
                ) => {

                    const request =
                        indexedDB.open(
                            FS_DB_NAME,
                            1
                        );


                    request
                        .onupgradeneeded =
                        () => {

                            const db =
                                request.result;


                            if (
                                !db.objectStoreNames
                                    .contains(
                                        FS_STORE
                                    )
                            ) {

                                db.createObjectStore(
                                    FS_STORE
                                );
                            }
                        };


                    request
                        .onsuccess =
                        () =>
                            resolve(
                                request.result
                            );


                    request
                        .onerror =
                        () =>
                            reject(
                                request.error
                            );
                }
            );


        return fsDbPromise;
    }


    async function setHandle(
        key,
        handle
    ) {

        const db =
            await getFsDB();


        return new Promise(
            (
                resolve,
                reject
            ) => {

                const tx =
                    db.transaction(
                        FS_STORE,
                        'readwrite'
                    );


                tx.objectStore(
                    FS_STORE
                )
                .put(
                    handle,
                    key
                );


                tx.oncomplete =
                    () =>
                        resolve(
                            true
                        );


                tx.onerror =
                    () =>
                        reject(
                            tx.error
                        );
            }
        );
    }


    async function getHandle(
        key
    ) {

        const db =
            await getFsDB();


        return new Promise(
            (
                resolve,
                reject
            ) => {

                const tx =
                    db.transaction(
                        FS_STORE,
                        'readonly'
                    );


                const request =
                    tx.objectStore(
                        FS_STORE
                    )
                    .get(
                        key
                    );


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


    async function hasPermission(
        handle,
        mode =
            'read'
    ) {

        if (!handle) {
            return false;
        }


        try {

            if (
                !handle.queryPermission
            ) {

                return true;
            }


            return (
                await handle.queryPermission(
                    {
                        mode
                    }
                )
            ) ===
                'granted';

        }

        catch (_) {

            return false;
        }
    }


    async function requestPermission(
        handle,
        mode =
            'readwrite'
    ) {

        if (!handle) {
            return false;
        }


        try {

            if (
                await hasPermission(
                    handle,
                    mode
                )
            ) {

                return true;
            }


            if (
                !handle.requestPermission
            ) {

                return true;
            }


            return (
                await handle.requestPermission(
                    {
                        mode
                    }
                )
            ) ===
                'granted';

        }

        catch (_) {

            return false;
        }
    }


    // =========================================================
    // 폴더 선택
    // =========================================================

    async function chooseSaveDirectory() {

        if (
            !window.showDirectoryPicker
        ) {

            showMessage(
                '현재 브라우저는 세이브 폴더 직접 연결을 지원하지 않아.'
            );


            return null;
        }


        try {

            const handle =
                await window
                    .showDirectoryPicker(
                        {
                            id:
                                'wuxia-rpg-save-directory',

                            mode:
                                'readwrite',

                            startIn:
                                'downloads'
                        }
                    );


            await setHandle(
                SAVE_DIR_KEY,
                handle
            );


            showMessage(
                `세이브 폴더: ${handle.name}`
            );


            await updateLauncher();


            return handle;

        }

        catch (
            error
        ) {

            if (
                error?.name !==
                'AbortError'
            ) {

                console.error(
                    error
                );
            }


            return null;
        }
    }


    // =========================================================
    // 다운로드 fallback
    // =========================================================

    function downloadSnapshot(
        snapshot
    ) {

        const name =
            safeFileName(
                snapshot
                    ?.player
                    ?.name
            );


        const blob =
            new Blob(
                [
                    JSON.stringify(
                        snapshot,
                        null,
                        2
                    )
                ],
                {
                    type:
                        'application/json;charset=utf-8'
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const a =
            document.createElement(
                'a'
            );


        a.href =
            url;


        a.download =
            `${name}.json`;


        document.body
            .appendChild(
                a
            );


        a.click();

        a.remove();


        setTimeout(
            () =>
                URL
                    .revokeObjectURL(
                        url
                    ),
            1000
        );
    }


    // =========================================================
    // 파일 저장
    // =========================================================

    async function saveCurrentToFile(
        askForFolder =
            true
    ) {

        if (
            !hasPlayerSave()
        ) {

            return false;
        }


        const snapshot =
            makeSnapshot(
                'file-save'
            );


        /*
         * 브라우저가 폴더 API를
         * 지원하지 않으면 다운로드
         */
        if (
            !window.showDirectoryPicker
        ) {

            if (
                askForFolder
            ) {

                downloadSnapshot(
                    snapshot
                );
            }


            return true;
        }


        let dir =
            await getHandle(
                SAVE_DIR_KEY
            );


        if (
            !dir &&
            askForFolder
        ) {

            dir =
                await chooseSaveDirectory();
        }


        if (!dir) {

            return false;
        }


        let permission =
            await hasPermission(
                dir,
                'readwrite'
            );


        if (
            !permission &&
            askForFolder
        ) {

            permission =
                await requestPermission(
                    dir,
                    'readwrite'
                );
        }


        if (
            !permission
        ) {

            return false;
        }


        try {

            const filename =
                currentSaveFileName();


            const handle =
                await dir
                    .getFileHandle(
                        filename,
                        {
                            create:
                                true
                        }
                    );


            const writable =
                await handle
                    .createWritable();


            await writable.write(
                JSON.stringify(
                    snapshot,
                    null,
                    2
                )
            );


            await writable.close();


            if (
                askForFolder
            ) {

                showMessage(
                    `${filename} 저장 완료`
                );
            }


            return true;

        }

        catch (
            error
        ) {

            console.error(
                error
            );


            return false;
        }
    }


    // =========================================================
    // 파일 불러오기
    // =========================================================

    async function openLoadPicker() {

        if (
            window.showOpenFilePicker
        ) {

            let dir =
                await getHandle(
                    SAVE_DIR_KEY
                );


            try {

                const handles =
                    await window
                        .showOpenFilePicker(
                            {
                                id:
                                    'wuxia-rpg-load-save',

                                startIn:
                                    dir ||
                                    'downloads',

                                multiple:
                                    false,

                                types: [
                                    {
                                        description:
                                            '무협 RPG 세이브',

                                        accept: {
                                            'application/json': [
                                                '.json'
                                            ]
                                        }
                                    }
                                ]
                            }
                        );


                if (
                    handles?.[0]
                ) {

                    const file =
                        await handles[0]
                            .getFile();


                    await importSaveFile(
                        file
                    );
                }


                return;

            }

            catch (
                error
            ) {

                if (
                    error?.name !==
                    'AbortError'
                ) {

                    console.error(
                        error
                    );
                }


                return;
            }
        }


        document
            .querySelector(
                `#${ROOT_ID} .wxs-file`
            )
            ?.click();
    }


    async function importSaveFile(
        file
    ) {

        try {

            const text =
                await file.text();


            const data =
                JSON.parse(
                    text
                );


            let snapshot;


            if (
                data.player &&
                typeof data.player ===
                'object'
            ) {

                snapshot =
                    data;

            }

            else if (
                data.name ||
                data.realm ||
                data.stats
            ) {

                snapshot = {
                    player:
                        data,

                    target: {
                        active: false
                    },

                    enemy: {
                        active: false,
                        enemies: []
                    }
                };

            }

            else {

                throw new Error(
                    'invalid save'
                );
            }


            restoreSnapshot(
                snapshot,
                true
            );


            await updateLauncher();


            showMessage(
                `${
                    snapshot.player
                        ?.name ||
                    '캐릭터'
                } 불러오기 완료`
            );

        }

        catch (
            error
        ) {

            console.error(
                error
            );


            showMessage(
                '올바른 세이브 파일이 아니야.'
            );
        }
    }


    // =========================================================
    // 이어하기
    // =========================================================

    function continueGame() {

        if (
            !hasPlayerSave()
        ) {

            showMessage(
                '현재 세이브가 없어.'
            );


            return;
        }


        archiveCurrentCharacter(
            'continue'
        );


        localStorage
            .removeItem(
                NEW_GAME_KEY
            );


        setSession(
            true
        );


        notifyGameUI();
    }


    // =========================================================
    // 최근 백업 복구
    // =========================================================

    function recoverLatest() {

        const recovery =
            getLatestRecovery();


        if (!recovery) {

            showMessage(
                '복구 가능한 백업이 없어.'
            );


            return;
        }


        const name =
            recovery.player
                ?.name ||
            '캐릭터';


        if (
            hasPlayerSave()
        ) {

            const ok =
                confirm(
                    `현재 세이브를 보관하고 "${name}" 백업으로 복구할까?`
                );


            if (!ok) {
                return;
            }
        }


        if (
            restoreSnapshot(
                recovery,
                true
            )
        ) {

            showMessage(
                `${name} 복구 완료`
            );
        }
    }


    // =========================================================
    // 보관함 캐릭터 로드
    // =========================================================

    function loadCharacterSlot(
        name
    ) {

        const slot =
            getCharacterSlots()[
                name
            ];


        if (
            !slot
        ) {

            return;
        }


        if (
            restoreSnapshot(
                slot,
                true
            )
        ) {

            showMessage(
                `${name} 불러오기 완료`
            );
        }
    }


    // =========================================================
    // 새 게임
    // =========================================================

    async function startNewGame() {

        if (
            hasPlayerSave()
        ) {

            const player =
                getPlayer();


            const ok =
                confirm(
                    `${player.name || '현재 캐릭터'}을 보관하고 새 게임을 시작할까?\n\n` +
                    `캐릭터 보관함 + 자동백업 후에만 초기화한다.`
                );


            if (!ok) {
                return;
            }


            /*
             * 1. 브라우저 백업
             */
            const backupOK =
                backupCurrent(
                    'before-new-game'
                );


            /*
             * 2. 이름별 캐릭터 보관함
             */
            const archiveOK =
                archiveCurrentCharacter(
                    'before-new-game'
                );


            /*
             * 둘 다 실패하면
             * 절대 현재 세이브를 지우지 않는다.
             */
            if (
                !backupOK &&
                !archiveOK
            ) {

                showMessage(
                    '현재 캐릭터 보관에 실패해서 새 게임을 중단했어.'
                );


                return;
            }


            /*
             * 3. 권한이 이미 살아있으면
             * 청명.json 같은 파일도 갱신.
             */
            await saveCurrentToFile(
                false
            );
        }


        /*
         * 안전 보관 성공 후에만
         * 현재 활성 슬롯 비움.
         */
        localStorage.removeItem(
            PLAYER_KEY
        );


        localStorage.removeItem(
            TARGET_KEY
        );


        localStorage.removeItem(
            ENEMY_KEY
        );


        localStorage.setItem(
            NEW_GAME_KEY,
            '1'
        );


        setSession(
            false
        );


        notifyGameUI();


        await updateLauncher();


        if (
            setComposerText(
                '!새 게임 시작'
            )
        ) {

            showMessage(
                '새 게임 명령을 전송하면 천명문답이 시작돼.'
            );

        }

        else {

            showMessage(
                '채팅에 "!새 게임 시작"이라고 입력하면 돼.'
            );
        }
    }


    // =========================================================
    // ChatGPT 입력
    // =========================================================

    function setComposerText(
        text
    ) {

        const textarea =
            document.querySelector(
                'textarea#prompt-textarea'
            );


        if (
            textarea
        ) {

            textarea.focus();


            textarea.value =
                text;


            textarea.dispatchEvent(
                new Event(
                    'input',
                    {
                        bubbles:
                            true
                    }
                )
            );


            return true;
        }


        const editable =
            document.querySelector(
                '#prompt-textarea[contenteditable="true"], div[contenteditable="true"]#prompt-textarea'
            );


        if (
            editable
        ) {

            editable.focus();


            editable.innerHTML =
                '';


            const p =
                document.createElement(
                    'p'
                );


            p.textContent =
                text;


            editable.appendChild(
                p
            );


            editable.dispatchEvent(
                new InputEvent(
                    'input',
                    {
                        bubbles:
                            true,

                        inputType:
                            'insertText',

                        data:
                            text
                    }
                )
            );


            return true;
        }


        return false;
    }


    // =========================================================
    // UI 업데이트 알림
    // =========================================================

    function notifyGameUI() {

        window.dispatchEvent(
            new CustomEvent(
                'wuxia:data-updated',
                {
                    detail: {
                        player:
                            true,

                        target:
                            true,

                        enemy:
                            true
                    }
                }
            )
        );
    }


    // =========================================================
    // 시작화면 위치
    // =========================================================

    function findSidebarRight() {

        let right =
            0;


        const candidates =
            document.querySelectorAll(
                'nav, [class*="sidebar"], [data-testid*="sidebar"]'
            );


        for (
            const el
            of candidates
        ) {

            const rect =
                el.getBoundingClientRect();


            if (
                rect.left <= 12 &&
                rect.width >= 140 &&
                rect.width <= 450 &&
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


        return right;
    }


    function getLauncherPosition() {

        const launcherPosition =
            parse(
                localStorage.getItem(
                    LAUNCHER_POSITION_KEY
                ),
                null
            );


        const playerPosition =
            parse(
                localStorage.getItem(
                    PLAYER_POSITION_KEY
                ),
                null
            );


        let left;
        let top;


        const savedPosition =
            launcherPosition &&
            Number.isFinite(
                launcherPosition.left
            ) &&
            Number.isFinite(
                launcherPosition.top
            )
                ? launcherPosition
                : playerPosition;


        if (
            savedPosition &&
            Number.isFinite(
                savedPosition.left
            ) &&
            Number.isFinite(
                savedPosition.top
            )
        ) {

            left =
                savedPosition.left;


            top =
                savedPosition.top;

        }

        else {

            const sidebar =
                findSidebarRight();


            left =
                sidebar > 40
                    ? sidebar + 10
                    : 12;


            top =
                72;
        }


        left =
            Math.max(
                6,
                Math.min(
                    left,
                    window.innerWidth -
                    400
                )
            );


        top =
            Math.max(
                6,
                Math.min(
                    top,
                    window.innerHeight -
                    150
                )
            );


        return {
            left,
            top
        };
    }


    function applyLauncherPosition() {

        const launcher =
            document.getElementById(
                ROOT_ID
            );


        if (!launcher) {
            return;
        }


        const position =
            getLauncherPosition();


        launcher.style
            .setProperty(
                '--launcher-left',
                `${position.left}px`
            );


        launcher.style
            .setProperty(
                '--launcher-top',
                `${position.top}px`
            );
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

/* ==================================================
   로그아웃 HUD OFF
   ================================================== */

html.wuxia-rpg-logged-out
#wuxia-player-ui-v20,

html.wuxia-rpg-logged-out
#wuxia-target-inspector-v20,

html.wuxia-rpg-logged-out
#wuxia-portrait-ui-v20,

html.wuxia-rpg-logged-out
#wuxia-player-ui-v16,

html.wuxia-rpg-logged-out
#wuxia-target-inspector-v12,

html.wuxia-rpg-logged-out
#wuxia-portrait-ui-v14 {

    display:
        none !important;
}


/* ==================================================
   시작화면
   상태창 자리 사용
   ================================================== */

#${ROOT_ID} {

    position:
        fixed !important;


    left:
        var(
            --launcher-left,
            270px
        )
        !important;


    top:
        var(
            --launcher-top,
            72px
        )
        !important;


    /*
     * 통합 상태창과 거의 같은 폭
     */
    width:
        390px !important;


    max-height:
        calc(
            100vh - 95px
        )
        !important;


    overflow-y:
        auto !important;


    z-index:
        2147483600 !important;


    padding:
        14px !important;


    border:
        1px solid
        rgba(
            190,
            145,
            255,
            .22
        )
        !important;


    border-radius:
        16px !important;


    background:
        rgba(
            19,
            19,
            24,
            .98
        )
        !important;


    box-shadow:
        0 14px 42px
        rgba(
            0,
            0,
            0,
            .48
        )
        !important;


    color:
        #ededf2 !important;


    font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif
        !important;


    display:
        none !important;
}


html.wuxia-rpg-logged-out
#${ROOT_ID} {

    display:
        block !important;
}


#${ROOT_ID} * {

    box-sizing:
        border-box !important;
}


/* 타이틀 */

.wxs-head {

    padding:
        4px 3px 12px
        !important;


    cursor:
        grab !important;


    user-select:
        none !important;


    touch-action:
        none !important;


    border-bottom:
        1px solid
        rgba(
            255,
            255,
            255,
            .08
        )
        !important;
}


#${ROOT_ID}.wxs-dragging {

    transition:
        none !important;


    box-shadow:
        0 18px 50px
        rgba(
            0,
            0,
            0,
            .62
        )
        !important;
}


#${ROOT_ID}.wxs-dragging
.wxs-head {

    cursor:
        grabbing !important;
}


.wxs-title {

    color:
        #d5afff !important;


    font-size:
        20px !important;


    font-weight:
        1000 !important;
}


.wxs-subtitle {

    margin-top:
        2px !important;


    color:
        #777b87 !important;


    font-size:
        10px !important;
}


/* 현재 세이브 */

.wxs-current {

    margin:
        11px 0 9px
        !important;


    padding:
        11px !important;


    border:
        1px solid
        rgba(
            255,
            255,
            255,
            .08
        )
        !important;


    border-radius:
        10px !important;


    background:
        rgba(
            255,
            255,
            255,
            .03
        )
        !important;
}


.wxs-name {

    color:
        #fff !important;


    font-size:
        15px !important;


    font-weight:
        950 !important;
}


.wxs-detail {

    margin-top:
        4px !important;


    color:
        #aaaeb9 !important;


    font-size:
        11px !important;


    line-height:
        1.55 !important;
}


.wxs-nosave {

    color:
        #8b8e99 !important;


    font-size:
        12px !important;
}


/* 복구 */

.wxs-recovery {

    display:
        none !important;


    margin-bottom:
        9px !important;


    padding:
        9px !important;


    border:
        1px solid
        rgba(
            255,
            190,
            80,
            .17
        )
        !important;


    border-radius:
        9px !important;


    background:
        rgba(
            150,
            95,
            20,
            .06
        )
        !important;
}


.wxs-recovery.visible {

    display:
        block !important;
}


.wxs-recovery-info {

    margin-bottom:
        7px !important;


    color:
        #e0c27c !important;


    font-size:
        10px !important;


    line-height:
        1.45 !important;
}


/* 버튼 */

.wxs-grid {

    display:
        grid !important;


    grid-template-columns:
        1fr 1fr
        !important;


    gap:
        7px !important;
}


.wxs-button {

    min-height:
        39px !important;


    padding:
        6px 8px
        !important;


    border:
        1px solid
        rgba(
            255,
            255,
            255,
            .10
        )
        !important;


    border-radius:
        8px !important;


    background:
        rgba(
            255,
            255,
            255,
            .04
        )
        !important;


    color:
        #dddfe6 !important;


    cursor:
        pointer !important;


    font-size:
        11px !important;


    font-weight:
        900 !important;
}


.wxs-button:hover {

    background:
        rgba(
            255,
            255,
            255,
            .08
        )
        !important;
}


.wxs-continue {

    color:
        #70df96 !important;
}


.wxs-load {

    color:
        #78c5ff !important;
}


.wxs-save {

    color:
        #ffd56f !important;
}


.wxs-new {

    color:
        #d2a1ff !important;
}


.wxs-recover {

    width:
        100% !important;


    color:
        #ffc65f !important;


    border-color:
        rgba(
            255,
            190,
            80,
            .25
        )
        !important;
}


.wxs-secondary {

    margin-top:
        7px !important;


    min-height:
        33px !important;


    width:
        100% !important;


    color:
        #aeb1bc !important;
}


/* 폴더 */

.wxs-folder {

    margin:
        9px 0
        !important;


    color:
        #7e828e !important;


    font-size:
        9px !important;


    text-align:
        center !important;
}


/* 보관함 */

.wxs-vault {

    display:
        none !important;


    margin-top:
        9px !important;


    padding-top:
        9px !important;


    border-top:
        1px solid
        rgba(
            255,
            255,
            255,
            .07
        )
        !important;
}


.wxs-vault.visible {

    display:
        block !important;
}


.wxs-vault-title {

    margin-bottom:
        7px !important;


    color:
        #c6c8d0 !important;


    font-size:
        11px !important;


    font-weight:
        950 !important;
}


.wxs-slot {

    display:
        flex !important;


    align-items:
        center !important;


    gap:
        7px !important;


    margin-bottom:
        6px !important;


    padding:
        7px !important;


    border:
        1px solid
        rgba(
            255,
            255,
            255,
            .07
        )
        !important;


    border-radius:
        8px !important;


    background:
        rgba(
            255,
            255,
            255,
            .025
        )
        !important;
}


.wxs-slot-info {

    flex:
        1 !important;


    min-width:
        0 !important;
}


.wxs-slot-name {

    color:
        #fff !important;


    font-size:
        11px !important;


    font-weight:
        900 !important;
}


.wxs-slot-sub {

    margin-top:
        2px !important;


    color:
        #858995 !important;


    font-size:
        9px !important;
}


.wxs-slot-load,

.wxs-slot-delete {

    padding:
        5px 7px
        !important;


    border-radius:
        6px !important;


    cursor:
        pointer !important;


    font-size:
        9px !important;


    font-weight:
        900 !important;
}


.wxs-slot-load {

    border:
        1px solid
        rgba(
            90,
            175,
            255,
            .22
        )
        !important;


    background:
        rgba(
            70,
            140,
            220,
            .08
        )
        !important;


    color:
        #86c7ff !important;
}


.wxs-slot-delete {

    border:
        1px solid
        rgba(
            255,
            80,
            100,
            .2
        )
        !important;


    background:
        rgba(
            130,
            25,
            40,
            .08
        )
        !important;


    color:
        #ff7885 !important;
}


/* 메시지 */

.wxs-message {

    display:
        none !important;


    margin-top:
        9px !important;


    padding:
        7px !important;


    border-radius:
        7px !important;


    background:
        rgba(
            75,
            135,
            205,
            .08
        )
        !important;


    color:
        #8fc8ff !important;


    font-size:
        10px !important;


    line-height:
        1.4 !important;


    text-align:
        center !important;
}


.wxs-message.visible {

    display:
        block !important;
}

`;


        document.head
            .appendChild(
                style
            );
    }


    // =========================================================
    // UI 생성
    // =========================================================

    function createLauncher() {

        if (
            document.getElementById(
                ROOT_ID
            )
        ) {

            return;
        }


        /*
         * 이전 런처 DOM 제거
         */
        [
            'wuxia-session-launcher-v11',
            'wuxia-session-launcher-v12'
        ]
        .forEach(
            id =>
                document
                    .getElementById(
                        id
                    )
                    ?.remove()
        );


        const root =
            document.createElement(
                'aside'
            );


        root.id =
            ROOT_ID;


        root.innerHTML = `

<div class="wxs-head">

    <div class="wxs-title">
        《강호기행》
    </div>

    <div class="wxs-subtitle">
        WUXIA TEXT RPG
    </div>

</div>


<div class="wxs-current">
</div>


<div class="wxs-recovery">

    <div class="wxs-recovery-info">
    </div>

    <button
        class="
            wxs-button
            wxs-recover
        "
        data-action="recover"
    >
        ↶ 최근 백업 복구
    </button>

</div>


<div class="wxs-grid">

    <button
        class="
            wxs-button
            wxs-continue
        "
        data-action="continue"
    >
        ▶ 이어하기
    </button>


    <button
        class="
            wxs-button
            wxs-load
        "
        data-action="load"
    >
        ↥ 파일 불러오기
    </button>


    <button
        class="
            wxs-button
            wxs-save
        "
        data-action="save"
    >
        💾 파일 저장
    </button>


    <button
        class="
            wxs-button
            wxs-new
        "
        data-action="new"
    >
        ＋ 새로하기
    </button>

</div>


<button
    class="
        wxs-button
        wxs-secondary
    "
    data-action="vault"
>
    ▾ 캐릭터 보관함
</button>


<div class="wxs-folder">
</div>


<button
    class="
        wxs-button
        wxs-secondary
    "
    data-action="folder"
>
    📁 세이브 폴더 설정
</button>


<div class="wxs-vault">

    <div class="wxs-vault-title">
        보관된 캐릭터
    </div>

    <div class="wxs-slot-list">
    </div>

</div>


<div class="wxs-message">
</div>


<input
    class="wxs-file"
    type="file"
    accept=".json,application/json"
    style="display:none"
>

`;


        document.body
            .appendChild(
                root
            );


        bindLauncher(
            root
        );


        bindLauncherDrag(
            root
        );


        applyLauncherPosition();

        updateLauncher();
    }


    // =========================================================
    // 런처 이벤트
    // =========================================================

    function bindLauncherDrag(
        root
    ) {

        const head =
            root.querySelector(
                '.wxs-head'
            );


        if (!head) {
            return;
        }


        const LONG_PRESS_MS =
            400;


        const MOVE_TOLERANCE =
            8;


        let pressTimer =
            null;


        let pointerId =
            null;


        let startX =
            0;


        let startY =
            0;


        let originLeft =
            0;


        let originTop =
            0;


        let dragging =
            false;


        function clearPressTimer() {

            if (
                pressTimer !==
                null
            ) {

                clearTimeout(
                    pressTimer
                );


                pressTimer =
                    null;
            }
        }


        function clampPosition(
            left,
            top
        ) {

            const rect =
                root.getBoundingClientRect();


            const maxLeft =
                Math.max(
                    6,
                    window.innerWidth -
                    rect.width -
                    6
                );


            const maxTop =
                Math.max(
                    6,
                    window.innerHeight -
                    Math.min(
                        rect.height,
                        window.innerHeight -
                        12
                    ) -
                    6
                );


            return {
                left:
                    Math.max(
                        6,
                        Math.min(
                            left,
                            maxLeft
                        )
                    ),

                top:
                    Math.max(
                        6,
                        Math.min(
                            top,
                            maxTop
                        )
                    )
            };
        }


        function applyDragPosition(
            left,
            top
        ) {

            const position =
                clampPosition(
                    left,
                    top
                );


            root.style
                .setProperty(
                    '--launcher-left',
                    `${position.left}px`
                );


            root.style
                .setProperty(
                    '--launcher-top',
                    `${position.top}px`
                );


            return position;
        }


        function finishDrag(
            event
        ) {

            clearPressTimer();


            if (
                pointerId ===
                null
            ) {

                return;
            }


            if (
                dragging
            ) {

                const rect =
                    root.getBoundingClientRect();


                saveJSON(
                    LAUNCHER_POSITION_KEY,
                    {
                        left:
                            Math.round(
                                rect.left
                            ),

                        top:
                            Math.round(
                                rect.top
                            )
                    }
                );


                event
                    ?.preventDefault();
            }


            root.classList
                .remove(
                    'wxs-dragging'
                );


            try {

                if (
                    head.hasPointerCapture(
                        pointerId
                    )
                ) {

                    head.releasePointerCapture(
                        pointerId
                    );
                }

            }

            catch (_) {}


            pointerId =
                null;


            dragging =
                false;
        }


        head.addEventListener(
            'pointerdown',
            event => {

                if (
                    event.pointerType ===
                        'mouse' &&
                    event.button !==
                        0
                ) {

                    return;
                }


                clearPressTimer();


                pointerId =
                    event.pointerId;


                startX =
                    event.clientX;


                startY =
                    event.clientY;


                const rect =
                    root.getBoundingClientRect();


                originLeft =
                    rect.left;


                originTop =
                    rect.top;


                try {

                    head.setPointerCapture(
                        pointerId
                    );

                }

                catch (_) {}


                pressTimer =
                    setTimeout(
                        () => {

                            pressTimer =
                                null;


                            dragging =
                                true;


                            root.classList
                                .add(
                                    'wxs-dragging'
                                );

                        },
                        LONG_PRESS_MS
                    );
            }
        );


        head.addEventListener(
            'pointermove',
            event => {

                if (
                    pointerId !==
                        event.pointerId
                ) {

                    return;
                }


                const dx =
                    event.clientX -
                    startX;


                const dy =
                    event.clientY -
                    startY;


                if (
                    !dragging
                ) {

                    if (
                        Math.hypot(
                            dx,
                            dy
                        ) >
                        MOVE_TOLERANCE
                    ) {

                        clearPressTimer();
                    }


                    return;
                }


                event.preventDefault();


                applyDragPosition(
                    originLeft +
                        dx,
                    originTop +
                        dy
                );
            }
        );


        head.addEventListener(
            'pointerup',
            finishDrag
        );


        head.addEventListener(
            'pointercancel',
            finishDrag
        );


        head.addEventListener(
            'lostpointercapture',
            event => {

                if (
                    pointerId ===
                        event.pointerId
                ) {

                    finishDrag(
                        event
                    );
                }
            }
        );
    }


    function bindLauncher(
        root
    ) {

        root.addEventListener(
            'click',
            async event => {

                const actionButton =
                    event.target.closest(
                        '[data-action]'
                    );


                if (
                    actionButton
                ) {

                    const action =
                        actionButton
                            .dataset
                            .action;


                    switch (
                        action
                    ) {

                        case 'continue':

                            continueGame();

                            break;


                        case 'load':

                            await openLoadPicker();

                            break;


                        case 'save':

                            await saveCurrentToFile(
                                true
                            );

                            break;


                        case 'new':

                            await startNewGame();

                            break;


                        case 'recover':

                            recoverLatest();

                            break;


                        case 'folder':

                            await chooseSaveDirectory();

                            break;


                        case 'vault':

                            vaultOpen =
                                !vaultOpen;


                            updateLauncher();

                            break;
                    }


                    return;
                }


                const slotLoad =
                    event.target.closest(
                        '[data-slot-load]'
                    );


                if (
                    slotLoad
                ) {

                    loadCharacterSlot(
                        slotLoad.dataset
                            .slotLoad
                    );


                    return;
                }


                const slotDelete =
                    event.target.closest(
                        '[data-slot-delete]'
                    );


                if (
                    slotDelete
                ) {

                    const name =
                        slotDelete.dataset
                            .slotDelete;


                    if (
                        confirm(
                            `"${name}" 보관 슬롯을 삭제할까?\n자동백업은 별도로 남아 있을 수 있어.`
                        )
                    ) {

                        deleteCharacterSlot(
                            name
                        );


                        updateLauncher();
                    }
                }
            }
        );


        root.querySelector(
            '.wxs-file'
        )
        .addEventListener(
            'change',
            async event => {

                const file =
                    event.target
                        .files?.[0];


                if (
                    file
                ) {

                    await importSaveFile(
                        file
                    );
                }


                event.target.value =
                    '';
            }
        );
    }


    // =========================================================
    // 런처 갱신
    // =========================================================

    async function updateLauncher() {

        const root =
            document.getElementById(
                ROOT_ID
            );


        if (!root) {
            return;
        }


        const player =
            getPlayer();


        const current =
            root.querySelector(
                '.wxs-current'
            );


        const continueButton =
            root.querySelector(
                '[data-action="continue"]'
            );


        const saveButton =
            root.querySelector(
                '[data-action="save"]'
            );


        if (
            player &&
            Object.keys(player).length
        ) {

            current.innerHTML = `

<div class="wxs-name">
    ${escapeHTML(
        player.name ||
        '이름 없는 무인'
    )}
</div>


<div class="wxs-detail">

    Lv.${escapeHTML(
        player.level ??
        '?'
    )}

    ·

    ${escapeHTML(
        player.realm ||
        '경지 미상'
    )}

    <br>

    ${escapeHTML(
        player.location ||
        '위치 미상'
    )}

    <br>

    저장 파일:
    <b>
        ${escapeHTML(
            safeFileName(
                player.name
            )
        )}.json
    </b>

</div>

`;


            continueButton.disabled =
                false;


            saveButton.disabled =
                false;

        }

        else {

            current.innerHTML = `

<div class="wxs-nosave">
    현재 활성 캐릭터가 없습니다.
</div>

`;


            continueButton.disabled =
                true;


            saveButton.disabled =
                true;
        }


        // ---------------------------------------------
        // 복구 후보
        // ---------------------------------------------

        const recovery =
            getLatestRecovery();


        const recoveryBox =
            root.querySelector(
                '.wxs-recovery'
            );


        if (
            recovery?.player
        ) {

            const p =
                recovery.player;


            recoveryBox.classList
                .add(
                    'visible'
                );


            recoveryBox.querySelector(
                '.wxs-recovery-info'
            ).innerHTML = `

복구 가능:
<b>
    ${escapeHTML(
        p.name ||
        '캐릭터'
    )}
</b>

· Lv.${escapeHTML(
    p.level ??
    '?'
)}

· ${escapeHTML(
    p.realm ||
    '경지 미상'
)}

`;

        }

        else {

            recoveryBox.classList
                .remove(
                    'visible'
                );
        }


        // ---------------------------------------------
        // 폴더
        // ---------------------------------------------

        const dir =
            await getHandle(
                SAVE_DIR_KEY
            );


        root.querySelector(
            '.wxs-folder'
        ).textContent =
            dir
                ? `📁 ${dir.name}`
                : '📁 세이브 폴더 미설정';


        // ---------------------------------------------
        // 보관함
        // ---------------------------------------------

        const vault =
            root.querySelector(
                '.wxs-vault'
            );


        vault.classList.toggle(
            'visible',
            vaultOpen
        );


        const slots =
            getSortedSlots();


        const list =
            root.querySelector(
                '.wxs-slot-list'
            );


        if (
            !slots.length
        ) {

            list.innerHTML = `

<div class="wxs-nosave">
    보관된 캐릭터 없음
</div>

`;

        }

        else {

            list.innerHTML =
                slots.map(
                    slot => {

                        const p =
                            slot.player ||
                            {};


                        const name =
                            p.name ||
                            slot.slotName ||
                            '캐릭터';


                        return `

<div class="wxs-slot">

    <div class="wxs-slot-info">

        <div class="wxs-slot-name">
            ${escapeHTML(name)}
        </div>

        <div class="wxs-slot-sub">

            Lv.${escapeHTML(
                p.level ??
                '?'
            )}

            ·

            ${escapeHTML(
                p.realm ||
                '경지 미상'
            )}

            <br>

            ${escapeHTML(
                p.location ||
                ''
            )}

        </div>

    </div>


    <button
        class="wxs-slot-load"
        data-slot-load="${escapeHTML(name)}"
    >
        불러오기
    </button>


    <button
        class="wxs-slot-delete"
        data-slot-delete="${escapeHTML(name)}"
    >
        삭제
    </button>

</div>

`;

                    }
                )
                .join('');
        }
    }


    // =========================================================
    // 메시지
    // =========================================================

    function showMessage(
        message
    ) {

        const box =
            document.querySelector(
                `#${ROOT_ID} .wxs-message`
            );


        if (!box) {
            return;
        }


        box.textContent =
            message;


        box.classList.add(
            'visible'
        );


        clearTimeout(
            showMessage._timer
        );


        showMessage._timer =
            setTimeout(
                () => {

                    box.classList
                        .remove(
                            'visible'
                        );

                },
                3200
            );
    }


    // =========================================================
    // 세션 적용
    // =========================================================

    function applySession() {

        const session =
            getSession();


        document.documentElement
            .classList.toggle(
                'wuxia-rpg-logged-out',
                session.active ===
                    false
            );


        if (
            session.active ===
            false
        ) {

            /*
             * 로그아웃 순간에도
             * 현재 캐릭터를 보관함에 복사.
             */
            if (
                hasPlayerSave()
            ) {

                archiveCurrentCharacter(
                    'logout'
                );
            }
        }


        applyLauncherPosition();

        updateLauncher();
    }


    // =========================================================
    // RPGSESSION 읽기
    // =========================================================

    function scanSessionMessages() {

        const messages =
            Array.from(
                document.querySelectorAll(
                    '[data-message-author-role="assistant"]'
                )
            )
            .slice(
                -6
            );


        for (
            let i =
                messages.length - 1;

            i >= 0;

            i--
        ) {

            const message =
                messages[i];


            const text =
                message.textContent ||
                '';


            if (
                !text.includes(
                    '[RPGSESSION]'
                )
            ) {

                continue;
            }


            /*
             * 태그 숨김
             */
            message
                .querySelectorAll(
                    'p, pre'
                )
                .forEach(
                    node => {

                        if (
                            (
                                node.textContent ||
                                ''
                            )
                            .includes(
                                '[RPGSESSION]'
                            )
                        ) {

                            node.style
                                .setProperty(
                                    'display',
                                    'none',
                                    'important'
                                );
                        }
                    }
                );


            const match =
                text.match(
                    /\[RPGSESSION\]\s*([\s\S]*?)\s*\[\/RPGSESSION\]/i
                );


            if (!match) {
                return;
            }


            const data =
                parse(
                    match[1].trim(),
                    null
                );


            if (
                !data ||
                typeof data.active !==
                    'boolean'
            ) {

                return;
            }


            const signature =
                JSON.stringify(
                    data
                );


            if (
                signature ===
                lastSessionSignature
            ) {

                return;
            }


            lastSessionSignature =
                signature;


            /*
             * 로그아웃 전에 현재 상태 보호
             */
            if (
                data.active ===
                    false &&
                hasPlayerSave()
            ) {

                backupCurrent(
                    'logout'
                );


                archiveCurrentCharacter(
                    'logout'
                );


                /*
                 * 폴더 권한이 이미 있다면
                 * 파일도 조용히 저장
                 */
                saveCurrentToFile(
                    false
                );
            }


            saveJSON(
                SESSION_KEY,
                {
                    ...getSession(),
                    ...data
                }
            );


            applySession();

            return;
        }
    }


    // =========================================================
    // 시작
    // =========================================================

    function handleCoreSessionUpdate() {
        const session =
            getSession();

        if (
            session.active ===
                false &&
            hasPlayerSave()
        ) {
            backupCurrent(
                'logout'
            );

            archiveCurrentCharacter(
                'logout'
            );

            /*
             * 이미 폴더 권한이 있다면
             * 사용자 팝업 없이 조용히 파일 갱신.
             */
            saveCurrentToFile(
                false
            );
        }

        applySession();
    }


    function init() {

        if (
            !document.body
        ) {

            setTimeout(
                init,
                250
            );

            return;
        }


        installStyle();

        createLauncher();


        if (
            hasPlayerSave()
        ) {

            archiveCurrentCharacter(
                'startup'
            );
        }


        applySession();


        /*
         * Core v2.1이 RPGSESSION을 읽고
         * 이 이벤트 하나만 보내준다.
         */
        window.addEventListener(
            'wuxia:data-updated',
            event => {

                if (
                    event.detail?.session
                ) {

                    handleCoreSessionUpdate();
                }

                else if (
                    event.detail?.player
                ) {

                    updateLauncher();
                }
            }
        );


        window.addEventListener(
            'wuxia:player-layout',
            () => {

                if (
                    getSession().active ===
                        false
                ) {

                    applyLauncherPosition();
                }
            }
        );


        window.addEventListener(
            'resize',
            applyLauncherPosition
        );


        window.addEventListener(
            'pageshow',
            () => {

                applySession();
            }
        );


        window.addEventListener(
            'popstate',
            () => {

                setTimeout(
                    () => {

                        if (
                            !document.getElementById(
                                ROOT_ID
                            )
                        ) {

                            createLauncher();
                        }

                        applySession();

                    },
                    50
                );
            }
        );


        window.addEventListener(
            'storage',
            event => {

                if (
                    event.key ===
                        SESSION_KEY

                    ||

                    event.key ===
                        PLAYER_KEY

                    ||

                    event.key ===
                        CHARACTER_SLOTS_KEY
                ) {

                    applySession();
                }
            }
        );


        /*
         * SPA 재렌더로 런처 DOM이 사라진 경우만
         * 15초에 한 번 복구. 채팅 내용은 읽지 않는다.
         */
        setInterval(
            () => {

                if (
                    !document.getElementById(
                        ROOT_ID
                    )
                ) {

                    createLauncher();

                    applySession();
                }

            },
            15000
        );


        console.log(
            '[무협 RPG] 세션 컨트롤러 v1.5 · 길게눌러 드래그'
        );
    }


    init();

})();