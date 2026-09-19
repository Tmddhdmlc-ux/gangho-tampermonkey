// ==UserScript==
// @name         강호기행 GitHub Loader v2
// @namespace    gangho-github-loader-v2
// @version      2.0
// @description  F5마다 GitHub 최신 강호기행 통합 번들을 1회 받아 Tampermonkey 샌드박스에서 실행
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '2.0';

    const RAW_URL =
        'https://raw.githubusercontent.com/Tmddhdmlc-ux/gangho-tampermonkey/main/gangho-bundle.js';

    const API_URL =
        'https://api.github.com/repos/Tmddhdmlc-ux/gangho-tampermonkey/contents/gangho-bundle.js?ref=main';

    const CACHE_KEY =
        'gangho-loader-v2-bundle-cache';

    const MAX_RETRIES = 3;

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function requestText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 15000,

                onload(response) {
                    if (
                        response.status >= 200 &&
                        response.status < 300 &&
                        response.responseText
                    ) {
                        resolve(response.responseText);
                    } else {
                        reject(
                            new Error(
                                'HTTP ' + response.status
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
                                    ? ': ' + error.statusText
                                    : ''
                            )
                        )
                    );
                }
            });
        });
    }

    function decodeGitHubApi(jsonText) {
        const data = JSON.parse(jsonText);

        if (
            !data?.content ||
            data.encoding !== 'base64'
        ) {
            throw new Error(
                'GitHub API 응답 형식 오류'
            );
        }

        const binary = atob(
            String(data.content)
                .replace(/\s+/g, '')
        );

        const bytes =
            new Uint8Array(binary.length);

        for (
            let i = 0;
            i < binary.length;
            i++
        ) {
            bytes[i] =
                binary.charCodeAt(i);
        }

        return new TextDecoder('utf-8')
            .decode(bytes);
    }

    async function getLatestBundle() {
        let lastError = null;

        for (
            let attempt = 1;
            attempt <= MAX_RETRIES;
            attempt++
        ) {
            try {
                const code =
                    await requestText(
                        RAW_URL +
                        '?_=' +
                        Date.now() +
                        '-' +
                        attempt
                    );

                await GM_setValue(
                    CACHE_KEY,
                    code
                );

                return {
                    code,
                    source: 'GitHub Raw'
                };
            } catch (error) {
                lastError = error;

                console.warn(
                    '[강호기행 Loader v2] Raw 실패',
                    attempt,
                    error
                );

                if (
                    attempt <
                    MAX_RETRIES
                ) {
                    await sleep(
                        600 * attempt
                    );
                }
            }
        }

        try {
            const apiText =
                await requestText(
                    API_URL +
                    '&_=' +
                    Date.now()
                );

            const code =
                decodeGitHubApi(
                    apiText
                );

            await GM_setValue(
                CACHE_KEY,
                code
            );

            return {
                code,
                source: 'GitHub API'
            };
        } catch (error) {
            lastError = error;

            console.warn(
                '[강호기행 Loader v2] API fallback 실패',
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
                code: cached,
                source: '로컬 캐시'
            };
        }

        throw (
            lastError ||
            new Error(
                '통합 번들을 가져오지 못함'
            )
        );
    }

    function executeBundle(code) {
        /*
         * 페이지 <script>로 주입하지 않는다.
         * Tampermonkey 샌드박스 안에서 직접 실행해
         * ChatGPT CSP의 외부 script 제한을 피한다.
         */
        (0, eval)(
            String(code) +
            '\n//# sourceURL=gangho-bundle.js'
        );
    }

    function clearOldErrorBoxes() {
        document
            .querySelectorAll(
                '#gangho-loader-error'
            )
            .forEach(
                node => node.remove()
            );
    }

    function showError(error) {
        clearOldErrorBoxes();

        const box =
            document.createElement('div');

        box.id =
            'gangho-loader-error';

        Object.assign(
            box.style,
            {
                position: 'fixed',
                right: '14px',
                bottom: '14px',
                zIndex: '2147483647',
                padding: '10px 12px',
                border: '1px solid rgba(255,80,100,.55)',
                borderRadius: '9px',
                background: 'rgba(50,15,20,.96)',
                color: '#ffd7dd',
                font: '12px/1.45 system-ui,sans-serif',
                whiteSpace: 'pre-wrap',
                maxWidth: '420px'
            }
        );

        box.textContent =
            '강호기행 Loader v' +
            VERSION +
            ' 오류\n' +
            String(
                error?.message ||
                error
            );

        document.body
            ?.appendChild(box);
    }

    async function run() {
        clearOldErrorBoxes();

        try {
            const result =
                await getLatestBundle();

            executeBundle(
                result.code
            );

            console.log(
                '[강호기행 Loader v2.0] 실행 완료:',
                result.source
            );
        } catch (error) {
            console.error(
                '[강호기행 Loader v2.0] 실행 실패',
                error
            );

            showError(error);
        }
    }

    run();
})();