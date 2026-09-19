// ==UserScript==
// @name         강호기행 GitHub Loader
// @namespace    gangho-github-loader
// @version      1.4
// @description  F5마다 GitHub 최신 통합 번들 1개를 받아 강호기행 스크립트 전체 실행
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const RAW_URL =
        'https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/gangho-bundle.js';

    const API_URL =
        'https://api.github.com/repos/Tmddhdmlc-ux/gangho-tampermonkey/contents/gangho-bundle.js?ref=main';

    const CACHE_KEY =
        'gangho-bundle-cache-v1';

    const MAX_RETRIES =
        3;

    function sleep(ms) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }

    function requestText(url) {
        return new Promise(
            (resolve, reject) => {

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
                                    'HTTP ' +
                                    response.status
                                )
                            );
                        }
                    },

                    ontimeout() {
                        reject(
                            new Error(
                                '요청 시간 초과'
                            )
                        );
                    },

                    onerror(error) {
                        reject(
                            new Error(
                                '네트워크 오류' +
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

    function decodeApiContent(jsonText) {
        const data =
            JSON.parse(
                jsonText
            );

        if (
            !data?.content ||
            data.encoding !==
                'base64'
        ) {
            throw new Error(
                'GitHub API 응답 형식 오류'
            );
        }

        const clean =
            String(
                data.content
            )
            .replace(
                /\s+/g,
                ''
            );

        const binary =
            atob(
                clean
            );

        const bytes =
            new Uint8Array(
                binary.length
            );

        for (
            let i = 0;
            i < binary.length;
            i++
        ) {
            bytes[i] =
                binary.charCodeAt(
                    i
                );
        }

        return new TextDecoder(
            'utf-8'
        )
        .decode(
            bytes
        );
    }

    async function fetchBundle() {
        let lastError =
            null;

        for (
            let attempt = 1;
            attempt <= MAX_RETRIES;
            attempt++
        ) {
            try {
                const raw =
                    await requestText(
                        RAW_URL +
                        '?_gangho=' +
                        Date.now()
                    );

                await GM_setValue(
                    CACHE_KEY,
                    raw
                );

                return {
                    code:
                        raw,

                    source:
                        'raw'
                };

            } catch (error) {
                lastError =
                    error;

                console.warn(
                    '[강호기행 Loader v1.4] Raw 재시도',
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
                        500 *
                        attempt
                    );
                }
            }
        }

        try {
            const apiText =
                await requestText(
                    API_URL +
                    '&_gangho=' +
                    Date.now()
                );

            const code =
                decodeApiContent(
                    apiText
                );

            await GM_setValue(
                CACHE_KEY,
                code
            );

            return {
                code,
                source:
                    'api'
            };

        } catch (error) {
            lastError =
                error;

            console.warn(
                '[강호기행 Loader v1.4] API fallback 실패',
                error
            );
        }

        const cached =
            await GM_getValue(
                CACHE_KEY,
                ''
            );

        if (cached) {
            return {
                code:
                    cached,

                source:
                    'cache'
            };
        }

        throw (
            lastError ||
            new Error(
                'bundle 로드 실패'
            )
        );
    }

    function executeBundle(code) {
        const script =
            GM_addElement(
                'script',
                {
                    type:
                        'text/javascript',

                    textContent:
                        String(
                            code ||
                            ''
                        ) +
                        '\n//# sourceURL=' +
                        RAW_URL
                }
            );

        if (!script) {
            throw new Error(
                'bundle 코드 주입 실패'
            );
        }

        script.remove();
    }

    function showFailure(error) {
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

        try {
            const result =
                await fetchBundle();

            executeBundle(
                result.code
            );

            console.log(
                '[강호기행 Loader v1.4] 실행 완료:',
                result.source
            );

        } catch (error) {
            console.error(
                '[강호기행 Loader v1.4] 실행 실패',
                error
            );

            showFailure(
                error
            );
        }
    }

    run();
})();