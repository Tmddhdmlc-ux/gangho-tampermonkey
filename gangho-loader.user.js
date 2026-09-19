// ==UserScript==
// @name         강호기행 GitHub Loader
// @namespace    gangho-github-loader
// @version      1.2
// @description  GitHub의 최신 강호기행 스크립트 6개를 매 새로고침마다 직접 불러와 실행
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
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

    const LOAD_TIMEOUT =
        12000;

    function loadScript(
        filename
    ) {
        return new Promise(
            (resolve, reject) => {

                const url =
                    BASE +
                    filename +
                    '?_gangho=' +
                    Date.now();

                let settled =
                    false;

                let timer =
                    null;

                let script =
                    null;

                function finish(
                    error = null
                ) {
                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    clearTimeout(
                        timer
                    );

                    script
                        ?.remove();

                    if (error) {
                        reject(
                            error
                        );
                    } else {
                        resolve();
                    }
                }

                try {
                    script =
                        GM_addElement(
                            'script',
                            {
                                src:
                                    url,

                                type:
                                    'text/javascript',

                                async:
                                    false
                            }
                        );

                    script.addEventListener(
                        'load',
                        () =>
                            finish(),
                        {
                            once:
                                true
                        }
                    );

                    script.addEventListener(
                        'error',
                        () =>
                            finish(
                                new Error(
                                    filename +
                                    ' 로드 실패'
                                )
                            ),
                        {
                            once:
                                true
                        }
                    );

                    timer =
                        setTimeout(
                            () =>
                                finish(
                                    new Error(
                                        filename +
                                        ' 로드 시간 초과'
                                    )
                                ),
                            LOAD_TIMEOUT
                        );

                } catch (error) {
                    finish(
                        error
                    );
                }
            }
        );
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
            '[강호기행 Loader v1.2] GitHub 최신 스크립트 로딩 시작'
        );

        for (
            const filename
            of SCRIPTS
        ) {
            try {
                await loadScript(
                    filename
                );

                console.log(
                    '[강호기행 Loader v1.2] 실행 완료:',
                    filename
                );
            } catch (error) {
                console.error(
                    '[강호기행 Loader v1.2] 실행 실패:',
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
            '[강호기행 Loader v1.2] 전체 로딩 완료'
        );
    }

    run();
})();