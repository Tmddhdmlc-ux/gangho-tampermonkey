// ==UserScript==
// @name         무협 RPG Core Lite v2.6
// @namespace    wuxia-rpg-core
// @version      2.6
// @description  초저부하 RPG 태그 통합 동기화 + 관계기록 + 자동세이브
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-core.user.js
// @downloadURL  https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/wuxia-rpg-core.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

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


    function parseBlocks(
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
                'gi'
            );

        const blocks = [];
        let match;

        while (
            (
                match =
                    regex.exec(
                        text
                    )
            ) !== null
        ) {
            const value =
                parse(
                    match[1].trim(),
                    null
                );

            if (
                value &&
                typeof value ===
                    'object'
            ) {
                blocks.push(
                    value
                );
            }
        }

        return blocks;
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

    function inferCompletedCombatEnemies(
        playerPatch
    ) {
        const scene =
            playerPatch?.currentScene;

        const defeatedCount =
            Number(
                scene?.freeActionIntent
                    ?.defeatedCount
            );

        if (
            scene?.freeActionIntent
                ?.result !==
                'completed'

            ||

            !Number.isInteger(
                defeatedCount
            )

            ||

            defeatedCount <= 0

            ||

            !Array.isArray(
                scene.localNpcs
            )
        ) {
            return null;
        }

        const defeatedStatus =
            /기절|제압|결박|전투불능|사망|도주|쓰러/;

        const candidates =
            scene.localNpcs.filter(
                npc =>
                    npc &&
                    defeatedStatus.test(
                        String(
                            npc.status ||
                            npc.state ||
                            ''
                        )
                    ) &&
                    npc.hp != null &&
                    npc.maxHp != null
            );

        /*
         * 장면의 제압 인원수와 상태가 일치할 때만 복구한다.
         * 민간인이나 이전 장면 NPC를 적으로 오인하지 않기 위한
         * 보수적인 폴백이다.
         */
        if (
            candidates.length !==
                defeatedCount
        ) {
            return null;
        }

        return {
            active: false,
            showLastTurn: true,
            inferredFrom:
                'RPGSTATE.currentScene.localNpcs',
            enemies:
                candidates.map(
                    npc => ({
                        enemyId:
                            npc.characterId ||
                            npc.id ||
                            null,
                        name:
                            npc.name ||
                            '적',
                        faction:
                            npc.faction ||
                            '불명',
                        realm:
                            npc.realm ||
                            '불명',
                        hp:
                            npc.hp,
                        maxHp:
                            npc.maxHp,
                        qi:
                            npc.qi ??
                            null,
                        maxQi:
                            npc.maxQi ??
                            null,
                        status:
                            npc.status ||
                            npc.state ||
                            '전투 종료',
                        participatedThisTurn:
                            true
                    })
                )
        };
    }

    function applyEnemyPatch(
        patch,
        hasTargetPatch,
        playerPatch
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


        if (
            patch.active ===
                false

            &&

            Array.isArray(
                patch.enemies
            )

            &&

            patch.enemies.length ===
                0
        ) {
            const inferred =
                inferCompletedCombatEnemies(
                    playerPatch
                );

            if (inferred) {
                patch = inferred;
            }
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
         * 전투 시작/종료 결과.
         * 한 턴에 참여한 첫 번째 적을 대상창으로 연결하고,
         * 종료 결과도 닫지 않은 채 확인할 수 있게 유지.
         */
        if (
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

                enemyId:
                    e.enemyId ||
                    e.instanceId ||
                    e.id ||
                    null,

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

                participatedThisTurn:
                    e.participatedThisTurn ===
                    true,

                damageTakenThisTurn:
                    e.damageTakenThisTurn ??
                    null,

                damageDealtThisTurn:
                    e.damageDealtThisTurn ??
                    null,

                combatEnded:
                    patch.active ===
                    false,

                combatSnapshot:
                    patch.active ===
                    false,

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
         * 적 목록이 없는 명시적 전투 종료만 대상창을 닫음.
         */
        if (
            patch.active ===
                false

            &&

            !(
                Array.isArray(
                    patch.enemies
                )

                &&

                patch.enemies.length
            )

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


            const enemyPatches =
                parseBlocks(
                    text,
                    'RPGENEMY'
                );

            const enemyPatch =
                enemyPatches.length
                    ? enemyPatches[
                        enemyPatches.length - 1
                    ]
                    : null;


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
                enemyPatches.length
            ) {

                for (
                    const patch
                    of enemyPatches
                ) {
                    const result =
                        applyEnemyPatch(
                            patch,
                            !!targetPatch,
                            playerPatch
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
            '[무협 RPG] Core Lite v2.5 · 빈 전투 결과 자동 복구'
        );
    }


    init();

})();
