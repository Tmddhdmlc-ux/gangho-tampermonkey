/* 강호기행 Runtime Bundle
 * 이 파일은 Loader가 F5 때 1회 받아 실행한다.
 * 개별 Tampermonkey 메타데이터는 제거된 실행 코드만 포함한다.
 */

/* ===== wuxia-rpg-core.user.js ===== */
(function () {
    'use strict';


    // =========================================================
    // 저장키
    // =========================================================

    const PLAYER_KEY =
        'wuxia_rpg_status_v2';

    const TARGET_KEY =
        'wuxia_rpg_target_v1';

    const ENEMY_KEY =
        'wuxia_rpg_enemy_v2';

    const SESSION_KEY =
        'wuxia_rpg_session_v1';

    const LOCAL_NPCS_KEY =
        'wuxia_rpg_local_npcs_v1';

    const MEMORY_KEY =
        'wuxia_rpg_ai_memory_v1';

    const BACKUP_KEY =
        'wuxia_rpg_save_guard_backups_v1';


    const MAX_BACKUPS =
        30;


    // =========================================================
    // 성능 설정
    // =========================================================

    /*
     * MutationObserver 없음.
     *
     * 채팅 DOM은 1.8초마다,
     * 최근 assistant 메시지 4개만 확인.
     */
    const SCAN_INTERVAL =
        1800;


    /*
     * 외부 UI에서 localStorage를 직접 바꾼 경우
     * 백업만 저빈도로 확인.
     *
     * DOM 접근 없음.
     */
    const BACKUP_INTERVAL =
        10000;


    const RECENT_MESSAGE_COUNT =
        4;


    // =========================================================
    // 처리 기록
    // =========================================================

    const processedHashes =
        new Set();


    const processedQueue =
        [];


    const MAX_PROCESSED =
        60;


    let scanScheduled =
        false;


    let lastBackupFingerprint =
        '';


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
                '[무협 RPG Core]',
                error
            );


            return false;
        }
    }


    // =========================================================
    // Deep Merge
    //
    // 객체 = 병합
    // 배열 = 통째 교체
    // =========================================================

    function deepMerge(
        base,
        patch
    ) {

        if (
            patch === null

            ||

            typeof patch !==
                'object'

            ||

            Array.isArray(
                patch
            )
        ) {

            return patch;
        }


        const result = {
            ...(
                base ||
                {}
            )
        };


        for (
            const [
                key,
                value
            ]
            of Object.entries(
                patch
            )
        ) {

            if (
                value

                &&

                typeof value ===
                    'object'

                &&

                !Array.isArray(
                    value
                )
            ) {

                result[key] =
                    deepMerge(
                        result[key] ||
                        {},
                        value
                    );

            }

            else {

                result[key] =
                    value;
            }
        }


        return result;
    }


    // =========================================================
    // Hash
    // =========================================================

    function hashText(
        text
    ) {

        let hash =
            2166136261;


        for (
            let i = 0;
            i < text.length;
            i++
        ) {

            hash ^=
                text.charCodeAt(
                    i
                );


            hash =
                Math.imul(
                    hash,
                    16777619
                );
        }


        return (
            `${text.length}:${hash >>> 0}`
        );
    }


    function rememberHash(
        hash
    ) {

        processedHashes.add(
            hash
        );


        processedQueue.push(
            hash
        );


        while (
            processedQueue.length >
            MAX_PROCESSED
        ) {

            const old =
                processedQueue.shift();


            processedHashes.delete(
                old
            );
        }
    }


    // =========================================================
    // 태그 파싱
    // =========================================================

    function parseBlock(
        text,
        tag
    ) {

        const regex =
            new RegExp(
                '\\[' +
                tag +
                '\\]\\s*([\\s\\S]*?)\\s*\\[\\/' +
                tag +
                '\\]',
                'i'
            );


        const match =
            text.match(
                regex
            );


        if (
            !match
        ) {

            return null;
        }


        return parse(
            match[1].trim(),
            null
        );
    }


    // =========================================================
    // UI 이벤트
    // =========================================================

    function dispatchUpdate(
        detail
    ) {

        window.dispatchEvent(
            new CustomEvent(
                'wuxia:data-updated',
                {
                    detail
                }
            )
        );


        if (
            detail.local
        ) {

            window.dispatchEvent(
                new CustomEvent(
                    'wuxia:local-npcs-updated'
                )
            );
        }


        if (
            detail.session
        ) {

            window.dispatchEvent(
                new CustomEvent(
                    'wuxia:session-updated'
                )
            );
        }
    }


    // =========================================================
    // PLAYER
    // =========================================================

    function applyPlayerPatch(
        patch
    ) {

        if (
            !patch ||
            typeof patch !==
                'object'
        ) {

            return false;
        }


        const current =
            parse(
                localStorage.getItem(
                    PLAYER_KEY
                ),
                {}
            ) || {};


        /*
         * 오래된 revision이
         * 최신 세이브를 덮지 못하게 함.
         */
        const incomingRev =
            Number(
                patch?.meta?.revision
            );


        const currentRev =
            Number(
                current?.meta?.revision
            );


        if (
            Number.isFinite(
                incomingRev
            )

            &&

            Number.isFinite(
                currentRev
            )

            &&

            incomingRev <
                currentRev
        ) {

            return false;
        }


        const merged =
            deepMerge(
                current,
                patch
            );


        return saveJSON(
            PLAYER_KEY,
            merged
        );
    }


    // =========================================================
    // NPC 관계 자동 기록
    // =========================================================

    function upsertRelation(
        targetState
    ) {

        if (
            !targetState?.active

            ||

            targetState.mode !==
                'npc'

            ||

            !targetState.name

            ||

            targetState.registerRelation ===
                false
        ) {

            return false;
        }


        const player =
            parse(
                localStorage.getItem(
                    PLAYER_KEY
                ),
                {}
            ) || {};


        if (
            !Array.isArray(
                player.relations
            )
        ) {

            player.relations =
                [];
        }


        const relation =
            targetState.relation ||
            {};


        let npc =
            player.relations.find(
                item =>
                    item.name ===
                    targetState.name
            );


        /*
         * UI용 대화 상태 태그는
         * 장기관계 태그에 저장하지 않음.
         */
        const cleanTags =
            (
                relation.tags ||
                npc?.tags ||
                ['초면']
            )
            .filter(
                tag =>
                    ![
                        '대화 중',
                        '대화중',
                        '대화 가능',
                        '대화가능',
                        '대화 불가',
                        '대화불가'
                    ]
                    .includes(
                        String(tag)
                    )
            );


        const patch = {

            name:
                targetState.name,

            faction:
                targetState.faction ||
                npc?.faction ||
                '불명',

            role:
                targetState.role ||
                npc?.role ||
                '',

            title:
                targetState.title ||
                npc?.title ||
                '',

            realm:
                targetState.realm ||
                npc?.realm ||
                '불명',

            tags:
                cleanTags,

            affinity:
                relation.affinity ??
                npc?.affinity ??
                0,

            trust:
                relation.trust ??
                npc?.trust ??
                0,

            status:
                targetState.lifeStatus ||
                npc?.status ||
                '생존',

            lastLocation:
                targetState.location ||
                npc?.lastLocation ||
                '',

            lastDate:
                targetState.date ||
                npc?.lastDate ||
                '',

            lastEvent:
                targetState.lastEvent ||
                npc?.lastEvent ||
                '직접 만남',

            important:
                targetState.important ??
                npc?.important ??
                false,

            /*
             * 관계 탭의 성인 관계 행동은
             * 엔진이 명시한 안전 필드만 사용한다.
             * 성인 여부가 미확정이면 false로 유지한다.
             */
            age:
                targetState.age ??
                npc?.age ??
                null,

            adultConfirmed:
                targetState.adultConfirmed === true
                ||
                targetState.isAdult === true
                ||
                npc?.adultConfirmed === true,

            romanceEligible:
                targetState.romanceEligible ??
                npc?.romanceEligible ??
                false,

            marriageEligible:
                targetState.marriageEligible ??
                npc?.marriageEligible ??
                false,

            dualCultivationEligible:
                targetState.dualCultivationEligible ??
                npc?.dualCultivationEligible ??
                false,

            safePrivateLocation:
                targetState.safePrivateLocation ??
                targetState.privateLocation ??
                npc?.safePrivateLocation ??
                false,

            dualCultivationCooldownUntil:
                targetState.dualCultivationCooldownUntil ??
                npc?.dualCultivationCooldownUntil ??
                null,

            dualCultivationCooldownActive:
                targetState.dualCultivationCooldownActive ??
                npc?.dualCultivationCooldownActive ??
                false,

            dualCultivationCooldownReady:
                targetState.dualCultivationCooldownReady ??
                npc?.dualCultivationCooldownReady ??
                true,

            capabilities: {
                ...(
                    npc?.capabilities ||
                    {}
                ),
                ...(
                    targetState.capabilities ||
                    {}
                )
            }
        };


        if (
            npc
        ) {

            Object.assign(
                npc,
                patch
            );

        }

        else {

            player.relations.push(
                patch
            );
        }


        saveJSON(
            PLAYER_KEY,
            player
        );


        return true;
    }


    // =========================================================
    // TARGET
    // =========================================================

    function applyTargetPatch(
        patch
    ) {

        if (
            !patch ||
            typeof patch !==
                'object'
        ) {

            return {
                targetChanged:
                    false,

                playerChanged:
                    false
            };
        }


        const current =
            parse(
                localStorage.getItem(
                    TARGET_KEY
                ),
                {}
            ) || {};


        const merged =
            deepMerge(
                current,
                patch
            );


        saveJSON(
            TARGET_KEY,
            merged
        );


        const relationChanged =
            upsertRelation(
                merged
            );


        return {

            targetChanged:
                true,

            playerChanged:
                relationChanged
        };
    }


    // =========================================================
    // ENEMY
    // =========================================================

    function applyEnemyPatch(
        patch,
        hasTargetPatch
    ) {

        if (
            !patch ||
            typeof patch !==
                'object'
        ) {

            return {
                targetChanged:
                    false
            };
        }


        saveJSON(
            ENEMY_KEY,
            patch
        );


        /*
         * RPGTARGET도 같은 답변에 있으면
         * 명시적 TARGET을 우선.
         */
        if (
            hasTargetPatch
        ) {

            return {
                targetChanged:
                    false
            };
        }


        const currentTarget =
            parse(
                localStorage.getItem(
                    TARGET_KEY
                ),
                {}
            ) || {};


        /*
         * 전투 시작.
         * 첫 번째 적을 대상창으로 연결.
         */
        if (
            patch.active

            &&

            Array.isArray(
                patch.enemies
            )

            &&

            patch.enemies.length
        ) {

            const e =
                patch.enemies[0];


            const converted = {

                active:
                    true,

                mode:
                    'enemy',

                name:
                    e.name,

                faction:
                    e.faction,

                realm:
                    e.realm,

                hp:
                    e.hp,

                maxHp:
                    e.maxHp,

                qi:
                    e.qi,

                maxQi:
                    e.maxQi,

                status:
                    e.status,

                weapon:
                    typeof e.weapon ===
                        'string'
                        ? {
                            name:
                                e.weapon
                        }
                        : e.weapon,

                equipment:
                    e.equipment ||
                    [],

                martialArts:
                    e.martialArts ||
                    [],

                inventory:
                    e.inventory ||
                    [],

                insightChance:
                    e.insightChance,

                nextRealm:
                    e.nextRealm,

                danger:
                    e.danger,

                note:
                    e.note
            };


            saveJSON(
                TARGET_KEY,
                deepMerge(
                    currentTarget,
                    converted
                )
            );


            return {
                targetChanged:
                    true
            };
        }


        /*
         * 전투 종료.
         * 적 대상창만 닫음.
         */
        if (
            patch.active ===
                false

            &&

            currentTarget.mode ===
                'enemy'
        ) {

            saveJSON(
                TARGET_KEY,
                {
                    ...currentTarget,

                    active:
                        false
                }
            );


            return {
                targetChanged:
                    true
            };
        }


        return {
            targetChanged:
                false
        };
    }


    // =========================================================
    // SESSION
    // =========================================================

    function applySessionPatch(
        patch
    ) {

        if (
            !patch ||
            typeof patch.active !==
                'boolean'
        ) {

            return false;
        }


        const current =
            parse(
                localStorage.getItem(
                    SESSION_KEY
                ),
                {}
            ) || {};


        const merged = {
            ...current,
            ...patch,

            changedAt:
                new Date()
                    .toISOString()
        };


        return saveJSON(
            SESSION_KEY,
            merged
        );
    }


    // =========================================================
    // LOCAL NPCS
    // =========================================================

    function applyLocalNPCPatch(
        patch
    ) {

        if (
            !patch ||
            typeof patch !==
                'object'
        ) {

            return false;
        }


        const current =
            parse(
                localStorage.getItem(
                    LOCAL_NPCS_KEY
                ),
                {
                    active:
                        false,

                    location:
                        '',

                    playerPlace:
                        '',

                    date:
                        '',

                    npcs:
                        []
                }
            ) || {};


        const merged =
            deepMerge(
                current,
                patch
            );


        /*
         * 지역 비활성화 =
         * 이전 NPC 완전 제거.
         */
        if (
            merged.active ===
                false
        ) {

            merged.npcs =
                [];
        }


        if (
            !Array.isArray(
                merged.npcs
            )
        ) {

            merged.npcs =
                [];
        }


        return saveJSON(
            LOCAL_NPCS_KEY,
            merged
        );
    }


    // =========================================================
    // MEMORY
    // =========================================================

    function applyMemoryPatch(
        patch
    ) {

        if (
            !patch ||
            typeof patch !==
                'object'
        ) {

            return false;
        }


        const current =
            parse(
                localStorage.getItem(
                    MEMORY_KEY
                ),
                {}
            ) || {};


        const incomingRev =
            Number(
                patch?.meta?.revision
            );


        const currentRev =
            Number(
                current?.meta?.revision
            );


        if (
            Number.isFinite(
                incomingRev
            )

            &&

            Number.isFinite(
                currentRev
            )

            &&

            incomingRev <
                currentRev
        ) {

            return false;
        }


        const merged =
            deepMerge(
                current,
                patch
            );


        merged.meta = {
            ...(
                merged.meta ||
                {}
            ),

            updatedAt:
                new Date()
                    .toISOString()
        };


        return saveJSON(
            MEMORY_KEY,
            merged
        );
    }


    // =========================================================
    // 태그 화면에서 숨기기
    // =========================================================

    function hideTagNodes(
        message
    ) {

        const nodes =
            message.querySelectorAll(
                'p, pre'
            );


        for (
            const node
            of nodes
        ) {

            const text =
                node.textContent ||
                '';


            if (
                text.includes(
                    '[RPGSTATE]'
                )

                ||

                text.includes(
                    '[RPGTARGET]'
                )

                ||

                text.includes(
                    '[RPGENEMY]'
                )

                ||

                text.includes(
                    '[RPGSESSION]'
                )

                ||

                text.includes(
                    '[RPGLOCALNPCS]'
                )

                ||

                text.includes(
                    '[RPGMEMORY]'
                )
            ) {

                node.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
            }
        }
    }


    // =========================================================
    // 실제 메시지 스캔
    // =========================================================

    function scanLatestMessages() {

        /*
         * 백그라운드 탭이면
         * DOM 읽지 않음.
         */
        if (
            document.hidden
        ) {

            return;
        }


        const all =
            document.querySelectorAll(
                '[data-message-author-role="assistant"]'
            );


        if (
            !all.length
        ) {

            return;
        }


        const start =
            Math.max(
                0,
                all.length -
                RECENT_MESSAGE_COUNT
            );


        let playerChanged =
            false;

        let targetChanged =
            false;

        let enemyChanged =
            false;

        let sessionChanged =
            false;

        let localChanged =
            false;

        let memoryChanged =
            false;


        for (
            let i = start;
            i < all.length;
            i++
        ) {

            const message =
                all[i];


            const text =
                message.textContent ||
                '';


            /*
             * 대부분의 일반 답변은
             * 여기서 즉시 끝남.
             */
            if (
                !text.includes(
                    '[RPG'
                )
            ) {

                continue;
            }


            const signature =
                hashText(
                    text
                );


            if (
                processedHashes.has(
                    signature
                )
            ) {

                /*
                 * 이미 처리했어도
                 * 태그가 화면에 다시 보이면 숨김.
                 */
                hideTagNodes(
                    message
                );

                continue;
            }


            const playerPatch =
                parseBlock(
                    text,
                    'RPGSTATE'
                );


            const targetPatch =
                parseBlock(
                    text,
                    'RPGTARGET'
                );


            const enemyPatch =
                parseBlock(
                    text,
                    'RPGENEMY'
                );


            const sessionPatch =
                parseBlock(
                    text,
                    'RPGSESSION'
                );


            const localPatch =
                parseBlock(
                    text,
                    'RPGLOCALNPCS'
                );


            const memoryPatch =
                parseBlock(
                    text,
                    'RPGMEMORY'
                );


            /*
             * 스트리밍 중이라
             * 아직 닫는 태그가 없다면
             * 완료 처리하지 않음.
             */
            const hasAnyComplete =
                !!playerPatch

                ||

                !!targetPatch

                ||

                !!enemyPatch

                ||

                !!sessionPatch

                ||

                !!localPatch

                ||

                !!memoryPatch;


            if (
                !hasAnyComplete
            ) {

                continue;
            }


            rememberHash(
                signature
            );


            hideTagNodes(
                message
            );


            if (
                playerPatch

                &&

                applyPlayerPatch(
                    playerPatch
                )
            ) {

                playerChanged =
                    true;
            }


            if (
                targetPatch
            ) {

                const result =
                    applyTargetPatch(
                        targetPatch
                    );


                if (
                    result.targetChanged
                ) {

                    targetChanged =
                        true;
                }


                if (
                    result.playerChanged
                ) {

                    playerChanged =
                        true;
                }
            }


            if (
                enemyPatch
            ) {

                const result =
                    applyEnemyPatch(
                        enemyPatch,
                        !!targetPatch
                    );


                enemyChanged =
                    true;


                if (
                    result.targetChanged
                ) {

                    targetChanged =
                        true;
                }
            }


            if (
                sessionPatch

                &&

                applySessionPatch(
                    sessionPatch
                )
            ) {

                sessionChanged =
                    true;
            }


            if (
                localPatch

                &&

                applyLocalNPCPatch(
                    localPatch
                )
            ) {

                localChanged =
                    true;
            }


            if (
                memoryPatch

                &&

                applyMemoryPatch(
                    memoryPatch
                )
            ) {

                memoryChanged =
                    true;
            }
        }


        const anyChanged =
            playerChanged

            ||

            targetChanged

            ||

            enemyChanged

            ||

            sessionChanged

            ||

            localChanged

            ||

            memoryChanged;


        if (
            !anyChanged
        ) {

            return;
        }


        dispatchUpdate({

            player:
                playerChanged,

            target:
                targetChanged,

            enemy:
                enemyChanged,

            session:
                sessionChanged,

            local:
                localChanged,

            memory:
                memoryChanged
        });


        backupIfChanged(
            'sync'
        );
    }


    // =========================================================
    // 브라우저가 한가할 때만 스캔
    // =========================================================

    function scheduleScan() {

        if (
            scanScheduled

            ||

            document.hidden
        ) {

            return;
        }


        scanScheduled =
            true;


        const run =
            () => {

                scanScheduled =
                    false;


                scanLatestMessages();
            };


        if (
            typeof window.requestIdleCallback ===
                'function'
        ) {

            window.requestIdleCallback(
                run,
                {
                    timeout:
                        1000
                }
            );

        }

        else {

            setTimeout(
                run,
                80
            );
        }
    }


    // =========================================================
    // 백업
    // =========================================================

    function snapshot(
        reason
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
                        active:
                            false
                    }
                ),


            enemy:
                parse(
                    localStorage.getItem(
                        ENEMY_KEY
                    ),
                    {
                        active:
                            false,

                        enemies:
                            []
                    }
                ),


            session:
                parse(
                    localStorage.getItem(
                        SESSION_KEY
                    ),
                    {
                        active:
                            false
                    }
                ),


            localNPCs:
                parse(
                    localStorage.getItem(
                        LOCAL_NPCS_KEY
                    ),
                    {
                        active:
                            false,

                        npcs:
                            []
                    }
                ),


            memory:
                parse(
                    localStorage.getItem(
                        MEMORY_KEY
                    ),
                    {}
                )
        };
    }


    function backupFingerprint() {

        return [

            localStorage.getItem(
                PLAYER_KEY
            ) || '',

            localStorage.getItem(
                TARGET_KEY
            ) || '',

            localStorage.getItem(
                ENEMY_KEY
            ) || '',

            localStorage.getItem(
                SESSION_KEY
            ) || '',

            localStorage.getItem(
                LOCAL_NPCS_KEY
            ) || '',

            localStorage.getItem(
                MEMORY_KEY
            ) || ''

        ]
        .join(
            '|'
        );
    }


    function backupIfChanged(
        reason = 'auto'
    ) {

        const fp =
            backupFingerprint();


        if (
            !fp

            ||

            fp ===
                lastBackupFingerprint
        ) {

            return false;
        }


        const snap =
            snapshot(
                reason
            );


        if (
            !snap.player

            ||

            !Object.keys(
                snap.player
            )
            .length
        ) {

            lastBackupFingerprint =
                fp;


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
            snap
        );


        backups =
            backups.slice(
                -MAX_BACKUPS
            );


        const success =
            saveJSON(
                BACKUP_KEY,
                backups
            );


        if (
            success
        ) {

            lastBackupFingerprint =
                fp;
        }


        return success;
    }


    // =========================================================
    // 수동 재동기화 이벤트
    //
    // 다른 스크립트/콘솔에서
    // window.dispatchEvent(
    //   new CustomEvent('wuxia:core-rescan')
    // );
    //
    // 로 즉시 스캔 가능.
    // =========================================================

    window.addEventListener(
        'wuxia:core-rescan',
        scheduleScan
    );


    // =========================================================
    // 탭이 다시 활성화되면 한 번 확인
    // =========================================================

    document.addEventListener(
        'visibilitychange',
        () => {

            if (
                !document.hidden
            ) {

                scheduleScan();
            }
        }
    );


    // =========================================================
    // 시작
    // =========================================================

    function init() {

        /*
         * 현재 상태는 이미 저장돼 있으므로
         * 시작 직후 불필요한 백업 생성 안 함.
         */
        lastBackupFingerprint =
            backupFingerprint();


        /*
         * 현재 대화 마지막 응답에
         * 아직 처리 안 된 태그가 있을 수 있으므로
         * 시작 시 딱 한 번 확인.
         */
        scheduleScan();


        /*
         * DOM 감시 없음.
         *
         * 단일 저빈도 타이머만 사용.
         */
        setInterval(
            scheduleScan,
            SCAN_INTERVAL
        );


        /*
         * 외부 UI에 의한 상태 변경 백업.
         * DOM 읽기 없음.
         */
        setInterval(
            () => {

                if (
                    document.hidden
                ) {

                    return;
                }


                backupIfChanged(
                    'auto'
                );

            },
            BACKUP_INTERVAL
        );


        console.log(
            '[무협 RPG] Core Lite v2.2 · Ultra Low Load'
        );
    }


    init();

})();
/* ===== end wuxia-rpg-core.user.js ===== */

/* ===== wuxia-rpg-session.user.js ===== */
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


    const NEW_GAME_BOOTSTRAP_PROMPT =
        'GitHub의 gangho-journey 저장소에서 BOOTSTRAP.md를 읽고 FAST PLAY 방식으로 《강호기행》을 로드해. 핵심 파일만 즉시 읽고 나머지는 실제로 필요할 때만 지연 로드해. 로드가 끝나면 게임을 임의로 진행하지 말고 "인계 완료"만 말해. 이후 일반 플레이에서는 GitHub 재조회를 최소화하고 REPO_SYNC_POLICY.md의 체크포인트 규칙으로 저장해. 인계 완료 후 !새 게임 시작으로 canon/rules는 유지하고 save만 새 캠페인으로 초기화해.';


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
        'wuxia-session-launcher-v16';

    const STYLE_ID =
        'wuxia-session-style-v16';


    let fsDbPromise =
        null;


    let lastSessionSignature =
        '';


    let vaultOpen =
        false;


    let newGameOpen =
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


        const composerFilled =
            setComposerText(
                NEW_GAME_BOOTSTRAP_PROMPT
            );


        if (composerFilled) {

            newGameOpen =
                false;


            await updateLauncher();

            showMessage(
                '새 게임 프롬프트를 입력창에 넣었어. 내용을 확인한 뒤 직접 전송해 줘.'
            );

        }

        else {

            const copied =
                await copyBootstrapPrompt();

            showMessage(
                copied
                    ? '입력창을 찾지 못해 프롬프트를 복사했어. 입력창에 붙여넣고 직접 전송해 줘.'
                    : '입력창을 찾지 못했어. 아래 프롬프트를 복사해 직접 붙여넣어 줘.'
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
                'textarea#prompt-textarea, textarea[data-testid="prompt-textarea"]'
            );


        if (
            textarea
        ) {

            textarea.focus();


            const valueSetter =
                Object.getOwnPropertyDescriptor(
                    HTMLTextAreaElement.prototype,
                    'value'
                )?.set;


            if (valueSetter) {

                valueSetter.call(
                    textarea,
                    text
                );

            }

            else {

                textarea.value =
                    text;
            }


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
                '#prompt-textarea[contenteditable="true"], div.ProseMirror[contenteditable="true"]'
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


    async function copyBootstrapPrompt() {

        try {

            if (
                navigator.clipboard?.writeText
            ) {

                await navigator.clipboard.writeText(
                    NEW_GAME_BOOTSTRAP_PROMPT
                );


                return true;
            }

        }

        catch (_) {

            // 아래의 선택 복사 방식으로 재시도한다.
        }


        const helper =
            document.createElement(
                'textarea'
            );


        helper.value =
            NEW_GAME_BOOTSTRAP_PROMPT;


        helper.setAttribute(
            'readonly',
            ''
        );


        helper.style.position =
            'fixed';


        helper.style.opacity =
            '0';


        document.body.appendChild(
            helper
        );


        helper.select();


        let copied =
            false;


        try {

            copied =
                document.execCommand(
                    'copy'
                );

        }

        catch (_) {

            copied =
                false;
        }


        helper.remove();


        return copied;
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


/* 새 게임 확인 */

.wxs-new-game {

    display:
        none !important;


    margin-top:
        9px !important;


    padding:
        10px !important;


    border:
        1px solid
        rgba(
            190,
            145,
            255,
            .20
        )
        !important;


    border-radius:
        9px !important;


    background:
        rgba(
            125,
            70,
            180,
            .07
        )
        !important;
}


.wxs-new-game.visible {

    display:
        block !important;
}


.wxs-new-game-title {

    color:
        #e0c5ff !important;


    font-size:
        11px !important;


    font-weight:
        950 !important;
}


.wxs-new-game-help {

    margin:
        5px 0 8px !important;


    color:
        #aaaeb9 !important;


    font-size:
        10px !important;


    line-height:
        1.45 !important;
}


.wxs-new-game-prompt {

    width:
        100% !important;


    min-height:
        118px !important;


    padding:
        8px !important;


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
        7px !important;


    background:
        rgba(
            0,
            0,
            0,
            .18
        )
        !important;


    color:
        #dddfe6 !important;


    font-family:
        inherit !important;


    font-size:
        10px !important;


    line-height:
        1.45 !important;


    resize:
        vertical !important;
}


.wxs-new-game-actions {

    display:
        grid !important;


    grid-template-columns:
        1fr 1fr !important;


    gap:
        7px !important;


    margin-top:
        7px !important;
}


.wxs-new-start {

    grid-column:
        1 / -1 !important;


    color:
        #8ce7ab !important;
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
            'wuxia-session-launcher-v12',
            'wuxia-session-launcher-v13',
            'wuxia-session-launcher-v15'
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


<div class="wxs-new-game">

    <div class="wxs-new-game-title">
        새 캠페인 시작
    </div>


    <div class="wxs-new-game-help">
        최신 canon/rules는 유지하고 현재 활성 save만 새 캠페인으로 바꿉니다. 기존 캐릭터는 보관함과 자동백업에 먼저 저장됩니다. 프롬프트는 자동 전송되지 않습니다.
    </div>


    <textarea
        class="wxs-new-game-prompt"
        aria-label="새 게임 부트스트랩 프롬프트"
        readonly
    ></textarea>


    <div class="wxs-new-game-actions">

        <button
            class="wxs-button wxs-new-start"
            data-action="new-start"
        >
            새게임 시작하기
        </button>


        <button
            class="wxs-button"
            data-action="new-copy"
        >
            프롬프트 복사
        </button>


        <button
            class="wxs-button"
            data-action="new-cancel"
        >
            취소
        </button>

    </div>

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

                            newGameOpen =
                                false;


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

                            newGameOpen =
                                !newGameOpen;


                            await updateLauncher();


                            break;


                        case 'new-start':

                            await startNewGame();


                            break;


                        case 'new-copy':

                            showMessage(
                                await copyBootstrapPrompt()
                                    ? '새 게임 프롬프트를 복사했어.'
                                    : '자동 복사에 실패했어. 위 프롬프트를 직접 선택해 복사해 줘.'
                            );


                            break;


                        case 'new-cancel':

                            newGameOpen =
                                false;


                            await updateLauncher();

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


        const newGameBox =
            root.querySelector(
                '.wxs-new-game'
            );


        newGameBox.classList.toggle(
            'visible',
            newGameOpen
        );


        newGameBox.querySelector(
            '.wxs-new-game-prompt'
        ).value =
            NEW_GAME_BOOTSTRAP_PROMPT;


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
            '[무협 RPG] 세션 컨트롤러 v1.6 · 드래그 + 확인형 새 게임 부트스트랩'
        );
    }


    init();

})();
/* ===== end wuxia-rpg-session.user.js ===== */

/* ===== wuxia-rpg-ui.user.js ===== */
(function () {
    'use strict';

    /*
     * 기존 세션 컨트롤러 / 초상화 UI 호환 때문에
     * ROOT ID는 v20을 그대로 사용한다.
     */
    const ROOT_ID = 'wuxia-player-ui-v20';
    const STYLE_ID = 'wuxia-player-style-v214';

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

            const trainingStatTexts = (() => {
                if (Array.isArray(m.displayStatBonuses) && m.displayStatBonuses.length) {
                    return m.displayStatBonuses.map(String);
                }

                if (m.allocationRule?.display) {
                    return [String(m.allocationRule.display)];
                }

                const map = m.statBonuses || {};
                return CORE_STAT_KEYS
                    .map(key => {
                        const value = Number(map[key] || 0);
                        if (!Number.isFinite(value) || value === 0) return null;
                        return `${STAT_LABELS[key]} ${value > 0 ? '+' : ''}${value}`;
                    })
                    .filter(Boolean);
            })();

            const trainingUniqueEffect =
                typeof m.uniqueEffect === 'string'
                    ? m.uniqueEffect
                    : m.uniqueEffect?.event || '';

            html += `
<div class="card">

    <div class="row">

        <b class="${gradeClass(m.grade)}">
            (${esc(m.grade || '?')})
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

    ${
        trainingStatTexts.length
            ? `
<div style="margin-top:7px">
    <div class="muted" style="margin-bottom:4px">상승 스탯</div>
    ${trainingStatTexts.map(text => `
<span class="chip chip-purple">
    ${esc(text)}
</span>
`).join('')}
</div>
`
            : ''
    }

    ${
        Number(m.trainingPointCost ?? m.cost ?? 0) > 0 || Number(m.baseHours || 0) > 0
            ? `
<div class="muted" style="margin-top:6px">
    ${Number(m.trainingPointCost ?? m.cost ?? 0) > 0 ? `수련점 ${esc(m.trainingPointCost ?? m.cost)}` : ''}
    ${Number(m.trainingPointCost ?? m.cost ?? 0) > 0 && Number(m.baseHours || 0) > 0 ? ' · ' : ''}
    ${Number(m.baseHours || 0) > 0 ? `${esc(m.baseHours)}시간` : ''}
</div>
`
            : ''
    }

    ${
        m.description
            ? `
<div class="muted" style="margin-top:6px;line-height:1.55">
    ${esc(m.description)}
</div>
`
            : ''
    }

    ${
        trainingUniqueEffect
            ? `
<div style="margin-top:6px">
    <span class="chip chip-gold">
        특수: ${esc(trainingUniqueEffect)}
    </span>
</div>
`
            : ''
    }

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
            ● RPG UI 연결됨 · v2.14
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
            '[무협 RPG] 통합 UI Lite v2.14 · 이벤트 모드'
        );
    }


    init();

})();
/* ===== end wuxia-rpg-ui.user.js ===== */

/* ===== wuxia-rpg-target.user.js ===== */
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

    let combatPanelClosed =
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
z-index:5!important;
width:28px!important;
height:28px!important;
padding:0!important;
display:grid!important;
place-items:center!important;
border:1px solid rgba(255,255,255,.14)!important;
border-radius:8px!important;
background:rgba(80,18,28,.92)!important;
color:#fff!important;
font-size:20px!important;
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

                    combatPanelClosed =
                        false;

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
            enemyId:
                enemy.enemyId ||
                enemy.instanceId ||
                enemy.id ||
                null,
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


    function activeCombatEnemies() {
        if (
            enemyState?.active !==
                true

            ||

            !Array.isArray(
                enemyState.enemies
            )
        ) {
            return [];
        }

        return enemyState.enemies
            .filter(
                enemy => {
                    if (
                        !enemy ||
                        enemy.active ===
                            false
                    ) {
                        return false;
                    }

                    const status =
                        String(
                            enemy.status ||
                            ''
                        );

                    if (
                        [
                            '사망',
                            '전투불능',
                            '도주',
                            '이탈'
                        ]
                        .includes(
                            status
                        )
                    ) {
                        return false;
                    }

                    const hp =
                        Number(
                            enemy.hp
                        );

                    const hpKnown =
                        enemy.hp !== null &&
                        enemy.hp !== undefined &&
                        enemy.hp !== '';

                    return !(
                        hpKnown

                        &&

                        Number.isFinite(
                            hp
                        )

                        &&

                        hp <= 0
                    );
                }
            );
    }


    function enemyMatchesTarget(enemy) {
        const enemyId =
            enemy.enemyId ||
            enemy.instanceId ||
            enemy.id ||
            null;

        if (
            enemyId &&
            target.enemyId
        ) {
            return String(enemyId) ===
                String(target.enemyId);
        }

        return (
            target.mode === 'enemy' &&
            enemy.name === target.name
        );
    }


    function ensureCombatPrimaryTarget() {
        const enemies =
            activeCombatEnemies();

        if (
            !enemies.length ||
            combatPanelClosed
        ) {
            return enemies;
        }

        const primary =
            enemies.find(
                enemyMatchesTarget
            ) ||
            enemies[0];

        target = {
            ...target,
            ...enemyToTarget(
                primary
            )
        };

        if (
            uiMode ===
                'collapsed'
        ) {
            uiMode =
                'mini';

            localStorage.setItem(
                MODE_KEY,
                uiMode
            );
        }

        return enemies;
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
            activeCombatEnemies();

        if (
            combatPanelClosed ||
            all.length <= 1
        ) {
            host.hidden = true;
            host.innerHTML = '';
            host._enemyList = [];
            return;
        }

        let primaryIndex =
            all.findIndex(
                enemyMatchesTarget
            );

        if (primaryIndex < 0) {
            primaryIndex = 0;
        }

        const extras =
            all.filter(
                (_, index) =>
                    index !==
                    primaryIndex
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

        ensureCombatPrimaryTarget();

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
                    if (
                        target.mode ===
                            'enemy'

                        &&

                        activeCombatEnemies()
                            .length
                    ) {
                        combatPanelClosed =
                            true;
                    }

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

            combatPanelClosed =
                false;

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
            '[무협 RPG] 대상 정보창 Lite v3.0 · 전투 인원수 자동 표시'
        );
    }


    init();

})();
/* ===== end wuxia-rpg-target.user.js ===== */

/* ===== wuxia-rpg-portrait.user.js ===== */
(function () {
    'use strict';

    const ROOT_ID =
        'wuxia-portrait-ui-v20';

    const STYLE_ID =
        'wuxia-portrait-style-v23';

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

.p-target-close{
position:absolute!important;
top:7px!important;
right:7px!important;
z-index:5!important;
width:28px!important;
height:28px!important;
padding:0!important;
display:grid!important;
place-items:center!important;
border:1px solid rgba(255,155,165,.58)!important;
border-radius:8px!important;
background:rgba(80,18,28,.92)!important;
color:#fff!important;
font-size:20px!important;
font-weight:900!important;
line-height:1!important;
cursor:pointer!important
}

.p-target-close:hover{
background:rgba(160,35,52,.96)!important;
border-color:rgba(255,185,193,.85)!important
}

.p-target-close:focus-visible{
outline:2px solid rgba(120,185,255,.82)!important;
outline-offset:2px!important
}

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
                const closeTarget =
                    event.target.closest(
                        '[data-close-portrait-target]'
                    );

                if (closeTarget) {
                    const currentTarget =
                        parse(
                            localStorage.getItem(
                                TARGET_KEY
                            ),
                            {}
                        ) || {};

                    currentTarget.active =
                        false;

                    delete currentTarget.uiCommand;

                    localStorage.setItem(
                        TARGET_KEY,
                        JSON.stringify(
                            currentTarget
                        )
                    );

                    await refreshState();

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

                    return;
                }

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
${
    isPlayer
        ? ''
        : `
<button
    class="p-target-close"
    data-close-portrait-target="1"
    type="button"
    title="상대창 닫기"
    aria-label="상대창 닫기"
>×</button>
`
}
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
            '[무협 RPG] 초상화 UI Lite v2.3 · 이벤트 모드'
        );
    }


    init();

})();
/* ===== end wuxia-rpg-portrait.user.js ===== */

/* ===== wuxia-rpg-handoff.user.js ===== */
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
/* ===== end wuxia-rpg-handoff.user.js ===== */
