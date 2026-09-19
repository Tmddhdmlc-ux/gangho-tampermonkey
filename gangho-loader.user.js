// ==UserScript==
// @name         강호기행 GitHub Loader
// @namespace    gangho-github-loader
// @version      1.0
// @description  GitHub의 최신 강호기행 Tampermonkey 스크립트 6개를 매 새로고침마다 직접 불러와 실행
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
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

    function fetchText(filename) {
        return new Promise((resolve, reject) => {
            const url =
                BASE +
                filename +
                '?_gangho=' +
                Date.now();

            GM_xmlhttpRequest({
                method: 'GET',
                url,

                onload(response) {
                    if (
                        response.status >= 200 &&
                        response.status < 300
                    ) {
                        resolve(response.responseText);
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

                onerror() {
                    reject(
                        new Error(
                            filename +
                            ' 네트워크 오류'
                        )
                    );
                }
            });
        });
    }

    function stripMeta(code) {
        return String(code || '')
            .replace(
                /^\s*\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/m,
                ''
            );
    }

    async function run() {
        console.log(
            '[강호기행 Loader] GitHub 최신 스크립트 로딩 시작'
        );

        for (const filename of SCRIPTS) {
            try {
                const raw =
                    await fetchText(filename);

                const code =
                    stripMeta(raw);

                const execute =
                    new Function(
                        code +
                        '\n//# sourceURL=' +
                        BASE +
                        filename
                    );

                execute();

                console.log(
                    '[강호기행 Loader] 실행 완료:',
                    filename
                );
            } catch (error) {
                console.error(
                    '[강호기행 Loader] 실행 실패:',
                    filename,
                    error
                );
            }
        }

        console.log(
            '[강호기행 Loader] 전체 로딩 완료'
        );
    }

    run();
})();