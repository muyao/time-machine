(() => {

    let currentDilationFactor = 1;

    function getWorkerPatchCode(factor, baseUrl) {
        return `\
            (function (d, base) {
                if (self.__timeWorkerApplied) return;
                self.__timeWorkerApplied = true;

                const m = self;

                // Fix relative URLs for importScripts, fetch, and XMLHttpRequest inside Blob Workers
                const origImportScripts = m.importScripts ? m.importScripts.bind(m) : null;
                if (origImportScripts) {
                    m.importScripts = function (...urls) {
                        const resolved = urls.map(u => {
                            try { return new URL(u, base).href; } catch (e) { return u; }
                        });
                        return origImportScripts(...resolved);
                    };
                }

                if (m.fetch) {
                    const origFetch = m.fetch.bind(m);
                    m.fetch = function (input, init) {
                        if (typeof input === "string") {
                            try { input = new URL(input, base).href; } catch (e) {}
                        } else if (input instanceof Request) {
                            try {
                                const url = new URL(input.url, base).href;
                                input = new Request(url, input);
                            } catch (e) {}
                        }
                        return origFetch(input, init);
                    };
                }

                if (m.XMLHttpRequest) {
                    const origOpen = m.XMLHttpRequest.prototype.open;
                    m.XMLHttpRequest.prototype.open = function (method, url, ...args) {
                        try {
                            url = new URL(url, base).href;
                        } catch (e) {}
                        return origOpen.call(this, method, url, ...args);
                    };
                }

                const origDate = m.Date;
                const origPerf = m.performance;
                const origNow = origPerf && origPerf.now ? origPerf.now.bind(origPerf) : null;
                const origDateNow = origDate.now.bind(origDate);

                const perfStart = origNow ? origNow() : 0;
                const dateStart = origDateNow();

                const patchedDateNow = function () {
                    return Math.floor(dateStart + ((origDateNow() - dateStart) * d));
                };

                const patchedPerfNow = origNow ? function () {
                    return perfStart + ((origNow() - perfStart) * d);
                } : null;

                // Target both performance instance and Performance.prototype
                if (patchedPerfNow) {
                    const targets = [m.performance];
                    if (m.Performance && m.Performance.prototype) {
                        targets.push(m.Performance.prototype);
                    }

                    targets.forEach(target => {
                        if (!target) return;
                        try { target.now = patchedPerfNow; } catch (e) {}
                        try {
                            Object.defineProperty(target, 'now', {
                                value: patchedPerfNow,
                                writable: true,
                                configurable: true,
                                enumerable: true
                            });
                        } catch (e) {}
                    });
                }

                // Custom Date constructor
                function CustomDate(...args) {
                    if (!(this instanceof CustomDate)) {
                        return (new origDate(patchedDateNow())).toString();
                    }
                    if (args.length === 0) {
                        return new origDate(patchedDateNow());
                    }
                    return new origDate(...args);
                }

                CustomDate.prototype = origDate.prototype;
                CustomDate.now = patchedDateNow;
                CustomDate.UTC = origDate.UTC;
                CustomDate.parse = origDate.parse;

                // Forcefully patch self.Date
                try { m.Date = CustomDate; } catch (e) {}
                try {
                    Object.defineProperty(m, 'Date', {
                        value: CustomDate,
                        writable: true,
                        configurable: true,
                        enumerable: true
                    });
                } catch (e) {}

                // Patch timers
                const h = m.setTimeout.bind(m);
                const i = m.setInterval.bind(m);
                m.setTimeout = (l, p, ...q) => h(l, typeof p === "number" ? p / d : p, ...q);
                m.setInterval = (l, p, ...q) => i(l, typeof p === "number" ? p / d : p, ...q);
            })(${factor}, ${JSON.stringify(baseUrl)});
        `;
    }

    function makeBootstrapURL(originalURL, isModule, factor) {
        const target = typeof originalURL === "string" ? originalURL : originalURL.href;

        // Compute base URL for relative script resolution
        let baseUrl;
        if (target && !target.startsWith("blob:")) {
            baseUrl = new URL(target, document.baseURI).href;
        } else {
            const scriptTag = Array.from(document.querySelectorAll('script[src]'))
                .find(s => s.src.includes('bundle.js') || s.src.includes('main'));
            baseUrl = scriptTag ? scriptTag.src : document.baseURI;
        }

        const workerPatchCode = getWorkerPatchCode(factor, baseUrl);

        if (target.startsWith("blob:")) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", target, false);
                xhr.overrideMimeType("text/plain");
                xhr.send();

                if (xhr.status === 200 || xhr.status === 0) {
                    const source = `\
${workerPatchCode}
${xhr.responseText}
`;
                    return URL.createObjectURL(
                        new Blob([source], { type: "text/javascript" })
                    );
                }
            } catch (err) {
                console.warn("[Time Machine] Could not fetch Blob URL synchronously, falling back.", err);
            }
        }

        const resolvedTarget = new URL(originalURL, document.baseURI).href;
        const source = isModule
            ? `\
${workerPatchCode}
await import(${JSON.stringify(resolvedTarget)});
` : `\
${workerPatchCode}
importScripts(${JSON.stringify(resolvedTarget)});
`;

        return URL.createObjectURL(
            new Blob([source], { type: "text/javascript" })
        );
    }

    function patchWorkerConstructor(ctx) {
        if (!ctx || typeof ctx.Worker === "undefined" || ctx.__workerPatched) return;
        ctx.__workerPatched = true;

        const NativeWorker = ctx.Worker;

        ctx.Worker = new Proxy(NativeWorker, {
            construct(Target, args) {
                const [url, options = {}] = args;
                if (!(typeof url === "string" || url instanceof URL)) {
                    return Reflect.construct(Target, args, Target);
                }

                const isModule = options?.type === "module";
                const bootstrapURL = makeBootstrapURL(url, isModule, currentDilationFactor);

                try {
                    return Reflect.construct(
                        Target,
                        [bootstrapURL, options],
                        Target
                    );
                } catch (err) {
                    URL.revokeObjectURL(bootstrapURL);
                    throw err;
                }
            }
        });

        ctx.Worker.prototype = NativeWorker.prototype;
    }

    // Proxy Worker constructor immediately before page scripts can execute
    patchWorkerConstructor(window);

    function dilateTime(dilationFactor, targHsts) {
        currentDilationFactor = dilationFactor;

        if (!targHsts.some(e => window.location.hostname.includes(e))) return;

        console.log(`[Time Machine (${window.location.origin})] Hostname ${window.location.hostname}`);

        const patchContext = (ctx) => {
            try {
                if (!ctx || ctx.__timeDilationApplied) return;
                ctx.__timeDilationApplied = true;

                patchWorkerConstructor(ctx);

                const m = ctx, t = "bind", n = "number", o = ctx.performance, r = "prototype", s = "requestAnimationFrame";
                const a = o.now(), b = ctx.Date.now(), c = o.now[t](o), e = ctx.Date.now, f = m.Date;
                const g = m[s] ? m[s][t](m) : null, h = m.setTimeout[t](m), i = m.setInterval[t](m);

                o.now = () => a + ((c() - a) * dilationFactor);
                ctx.Date.now = () => b + ((e() - b) * dilationFactor);

                function k(...q) { if (q.length === 0) return new f(ctx.Date.now()); return new f(...q); }
                k[r] = f[r]; k.now = ctx.Date.now; k.UTC = f.UTC; k.parse = f.parse; m.Date = k;

                if (g) m[s] = (l) => g(() => l(o.now()));
                m.setTimeout = (l, p, ...q) => h(l, typeof p === n ? p / dilationFactor : p, ...q);
                m.setInterval = (l, p, ...q) => i(l, typeof p === n ? p / dilationFactor : p, ...q);
            } catch (err) {
                // Ignore cross-origin frame access errors
            }
        };

        patchContext(window);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.tagName === "IFRAME" && node.contentWindow) {
                        patchContext(node.contentWindow);
                    }
                }
            }
        });

        observer.observe(document.documentElement || document, {
            childList: true,
            subtree: true
        });

        console.log(`[Time Machine (${window.location.origin})] Time dilation ${dilationFactor}x speed`);
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window || event.data?.source !== "TIME_MACHINE_SETTINGS") return;

        if (event.data.type === "SETTINGS_RESPONSE") {
            const dilationFactor = event.data.payload.dilationFactor;
            const targHsts = event.data.payload.targHsts;
            dilateTime(dilationFactor, targHsts);
        }
    });

    window.postMessage({
        source: "TIME_MACHINE_DILATE",
        type: "GET_SETTINGS"
    }, "*");
})();