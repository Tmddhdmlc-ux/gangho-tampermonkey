// ==UserScript==
// @name         강호기행 GitHub Loader
// @namespace    gangho-github-loader
// @version      1.3
// @description  GitHub 최신 강호기행 스크립트 6개를 F5마다 불러오며 실패 시 재시도/캐시 복구
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BASE =
        'https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/';

    const SCRIPTS = [
        'wuxia-rpg-core.user.js',
        'wuxia-rpg-session.user.js',
        'wuxia-rpg-ui.user.js',
        'wuxia-rpg-target.user.js',
        'wuxia-rpg-portrait.user.js',
        'wuxia-rpg-handoff.user.js'
    ];

    const MAX_RETRIES =
        3;

    const RETRY_DELAY =
        650;

    function sleep(ms) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }

    function cacheKey(filename) {
        return (
            'gangho-cache:' +
            filename
        );
    }

    function fetchOnce(filename) {
        return new Promise(
            (resolve, reject) => {

                const url =
                    BASE +
                    filename;

                GM_xmlhttpRequest({
                    method:
                        'GET',

                    url,

                    headers: {
                        'Cache-Control':
                            'no-cache'
                    },

                    timeout:
                        12000,

                    onload(response) {
                        if (
                            response.status >= 200 &&
                            response.status < 300 &&
                            response.responseText
                        ) {
                            resolve(
                                response.responseText
                            );
                        } else {
                            reject(
                                new Error(
                                    filename +
                                    ' HTTP ' +
                                    response.status
                                )
                            );
                        }
                    },

                    ontimeout() {
                        reject(
                            new Error(
                                filename +
                                ' 요청 시간 초과'
                            )
                        );
                    },

                    onerror(error) {
                        reject(
                            new Error(
                                filename +
                                ' 네트워크 오류' +
                                (
                                    error?.statusText
                                        ? ': ' +
                                          error.statusText
                                        : ''
                                )
                            )
                        );
                    }
                });
            }
        );
    }

    async function fetchLatest(filename) {
        let lastError =
            null;

        for (
            let attempt = 1;
            attempt <= MAX_RETRIES;
            attempt++
        ) {
            try {
                const raw =
                    await fetchOnce(
                        filename
                    );

                await GM_setValue(
                    cacheKey(
                        filename
                    ),
                    raw
                );

                return {
                    raw,
                    source:
                        'github'
                };

            } catch (error) {
                lastError =
                    error;

                console.warn(
                    '[강호기행 Loader v1.3] 재시도',
                    filename,
                    attempt,
                    '/',
                    MAX_RETRIES,
                    error
                );

                if (
                    attempt <
                    MAX_RETRIES
                ) {
                    await sleep(
                        RETRY_DELAY *
                        attempt
                    );
                }
            }
        }

        const cached =
            await GM_getValue(
                cacheKey(
                    filename
                ),
                ''
            );

        if (cached) {
            console.warn(
                '[강호기행 Loader v1.3] GitHub 실패 → 캐시 사용:',
                filename
            );

            return {
                raw:
                    cached,

                source:
                    'cache'
            };
        }

        throw (
            lastError ||
            new Error(
                filename +
                ' 로드 실패'
            )
        );
    }

    function stripMeta(code) {
        return String(
            code ||
            ''
        ).replace(
            /^\s*\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/m,
            ''
        );
    }

    function executeCode(
        raw,
        filename
    ) {
        const code =
            stripMeta(
                raw
            );

        const script =
            GM_addElement(
                'script',
                {
                    type:
                        'text/javascript',

                    textContent:
                        code +
                        '\n//# sourceURL=' +
                        BASE +
                        filename
                }
            );

        if (!script) {
            throw new Error(
                filename +
                ' 코드 주입 실패'
            );
        }

        script.remove();
    }

    function showFailure(
        filename,
        error
    ) {
        const id =
            'gangho-loader-error';

        let box =
            document.getElementById(
                id
            );

        if (!box) {
            box =
                document.createElement(
                    'div'
                );

            box.id =
                id;

            Object.assign(
                box.style,
                {
                    position:
                        'fixed',

                    right:
                        '14px',

                    bottom:
                        '14px',

                    zIndex:
                        '2147483647',

                    padding:
                        '10px 12px',

                    border:
                        '1px solid rgba(255,80,100,.55)',

                    borderRadius:
                        '9px',

                    background:
                        'rgba(50,15,20,.96)',

                    color:
                        '#ffd7dd',

                    font:
                        '12px/1.45 system-ui,sans-serif',

                    whiteSpace:
                        'pre-wrap',

                    maxWidth:
                        '420px'
                }
            );

            document.body
                ?.appendChild(
                    box
                );
        }

        box.textContent =
            '강호기행 Loader 오류\n' +
            filename +
            '\n' +
            String(
                error?.message ||
                error
            );
    }

    async function run() {
        document
            .getElementById(
                'gangho-loader-error'
            )
            ?.remove();

        console.log(
            '[강호기행 Loader v1.3] 로딩 시작'
        );

        for (
            const filename
            of SCRIPTS
        ) {
            try {
                const result =
                    await fetchLatest(
                        filename
                    );

                executeCode(
                    result.raw,
                    filename
                );

                console.log(
                    '[강호기행 Loader v1.3] 실행 완료:',
                    filename,
                    '(' +
                    result.source +
                    ')'
                );

            } catch (error) {
                console.error(
                    '[강호기행 Loader v1.3] 실행 실패:',
                    filename,
                    error
                );

                showFailure(
                    filename,
                    error
                );
            }
        }

        console.log(
            '[강호기행 Loader v1.3] 전체 로딩 완료'
        );
    }

    run();
})();