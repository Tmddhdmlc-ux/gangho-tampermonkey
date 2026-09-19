// ==UserScript==
// @name         강호기행 GitHub Loader
// @namespace    gangho-github-loader
// @version      1.1
// @description  GitHub의 최신 강호기행 스크립트 6개를 매 새로고침마다 직접 불러와 실행
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
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

                onerror(error) {
                    reject(
                        new Error(
                            filename +
                            ' 네트워크 오류: ' +
                            String(
                                error?.error ||
                                error?.statusText ||
                                ''
                            )
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

    function executeInPage(
        code,
        filename
    ) {
        const script =
            GM_addElement(
                'script',
                {
                    type:
                        'text/javascript',

                    textContent:
                        stripMeta(code) +
                        '\n//# sourceURL=' +
                        BASE +
                        filename
                }
            );

        if (!script) {
            throw new Error(
                filename +
                ' script 주입 실패'
            );
        }

        /*
         * 삽입 시 즉시 실행되므로
         * DOM에는 남겨둘 필요 없음.
         */
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
        console.log(
            '[강호기행 Loader v1.1] GitHub 최신 스크립트 로딩 시작'
        );

        for (
            const filename
            of SCRIPTS
        ) {
            try {
                const raw =
                    await fetchText(
                        filename
                    );

                executeInPage(
                    raw,
                    filename
                );

                console.log(
                    '[강호기행 Loader v1.1] 실행 완료:',
                    filename
                );
            } catch (error) {
                console.error(
                    '[강호기행 Loader v1.1] 실행 실패:',
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
            '[강호기행 Loader v1.1] 전체 로딩 완료'
        );
    }

    run();
})();