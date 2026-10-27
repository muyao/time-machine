(() => {
    let currentDilationFactor = 1;

    // Helper: Safely override object properties with fallback descriptor definitions
    function safeDefine(target, prop, value) {
        if (!target) return;
        try { target[prop] = value; } catch (e) { }
        try {
            Object.defineProperty(target, prop, {
                value,
                writable: true,
                configurable: true,
                enumerable: true
            });
        } catch (e) { }
    }

    // Code string injected into Web Worker contexts
    function getWorkerPatchCode(factor, baseUrl) {
        return `\
(function (factor, base) {
    if (self.__timeWorkerApplied) return;
    self.__timeWorkerApplied = true;

    const scope = self;

    function safeDefine(target, prop, value) {
        if (!target) return;
        try { target[prop] = value; } catch (e) {}
        try {
            Object.defineProperty(target, prop, {
                value,
                writable: true,
                configurable: true,
                enumerable: true
            });
        } catch (e) {}
    }

    // --- 1. Path Resolution Overrides (importScripts, fetch, XHR) ---
    if (scope.importScripts) {
        const origImportScripts = scope.importScripts.bind(scope);
        scope.importScripts = function (...urls) {
            const resolved = urls.map(url => {
                try { return new URL(url, base).href; } catch (e) { return url; }
            });
            return origImportScripts(...resolved);
        };
    }

    if (scope.fetch) {
        const origFetch = scope.fetch.bind(scope);
        scope.fetch = function (input, init) {
            if (typeof input === "string") {
                try { input = new URL(input, base).href; } catch (e) {}
            } else if (input instanceof Request) {
                try {
                    input = new Request(new URL(input.url, base).href, input);
                } catch (e) {}
            }
            return origFetch(input, init);
        };
    }

    if (scope.XMLHttpRequest) {
        const origOpen = scope.XMLHttpRequest.prototype.open;
        scope.XMLHttpRequest.prototype.open = function (method, url, ...args) {
            try { url = new URL(url, base).href; } catch (e) {}
            return origOpen.call(this, method, url, ...args);
        };
    }

    // --- 2. Performance & Date Overrides ---
    const OrigDate = scope.Date;
    const origPerf = scope.performance;
    const origPerfNow = origPerf && origPerf.now ? origPerf.now.bind(origPerf) : null;
    const origDateNow = OrigDate.now.bind(OrigDate);

    const perfStart = origPerfNow ? origPerfNow() : 0;
    const dateStart = origDateNow();

    const patchedDateNow = () => Math.floor(dateStart + ((origDateNow() - dateStart) * factor));
    const patchedPerfNow = origPerfNow ? () => perfStart + ((origPerfNow() - perfStart) * factor) : null;

    if (patchedPerfNow) {
        safeDefine(scope.performance, 'now', patchedPerfNow);
        if (scope.Performance && scope.Performance.prototype) {
            safeDefine(scope.Performance.prototype, 'now', patchedPerfNow);
        }
    }

    function CustomDate(...args) {
        if (!(this instanceof CustomDate)) {
            return (new OrigDate(patchedDateNow())).toString();
        }
        return args.length === 0 ? new OrigDate(patchedDateNow()) : new OrigDate(...args);
    }

    CustomDate.prototype = OrigDate.prototype;
    CustomDate.now = patchedDateNow;
    CustomDate.UTC = OrigDate.UTC;
    CustomDate.parse = OrigDate.parse;

    safeDefine(scope, 'Date', CustomDate);

    // --- 3. Timer Overrides ---
    const origSetTimeout = scope.setTimeout.bind(scope);
    const origSetInterval = scope.setInterval.bind(scope);

    scope.setTimeout = (fn, delay, ...args) =>
        origSetTimeout(fn, typeof delay === "number" ? delay / factor : delay, ...args);

    scope.setInterval = (fn, delay, ...args) =>
        origSetInterval(fn, typeof delay === "number" ? delay / factor : delay, ...args);

})(${factor}, ${JSON.stringify(baseUrl)});
`;
    }

    // Determines base URL for relative asset resolution inside workers
    function resolveBaseUrl(targetUrl) {
        if (targetUrl && !targetUrl.startsWith("blob:")) {
            return new URL(targetUrl, document.baseURI).href;
        }
        const scriptTag = Array.from(document.querySelectorAll('script[src]'))
            .find(s => s.src.includes('bundle.js') || s.src.includes('main'));
        return scriptTag ? scriptTag.src : document.baseURI;
    }

    // Constructs wrapper Blob URL injected with worker patch code
    function createBootstrapUrl(originalUrl, isModule, factor) {
        const target = typeof originalUrl === "string" ? originalUrl : originalUrl.href;
        const baseUrl = resolveBaseUrl(target);
        const patchCode = getWorkerPatchCode(factor, baseUrl);

        if (target.startsWith("blob:")) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", target, false);
                xhr.overrideMimeType("text/plain");
                xhr.send();

                if (xhr.status === 200 || xhr.status === 0) {
                    const source = `${patchCode}\n${xhr.responseText}`;
                    return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
                }
            } catch (err) {
                console.warn("[Time Machine] Blob URL sync fetch failed, falling back.", err);
            }
        }

        const resolvedTarget = new URL(originalUrl, document.baseURI).href;
        const source = isModule
            ? `${patchCode}\nawait import(${JSON.stringify(resolvedTarget)});`
            : `${patchCode}\nimportScripts(${JSON.stringify(resolvedTarget)});`;

        return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    }

    // Proxies window.Worker constructor to inject patches into spawned workers
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
                const bootstrapUrl = createBootstrapUrl(url, isModule, currentDilationFactor);

                try {
                    return Reflect.construct(Target, [bootstrapUrl, options], Target);
                } catch (err) {
                    URL.revokeObjectURL(bootstrapUrl);
                    throw err;
                }
            }
        });

        ctx.Worker.prototype = NativeWorker.prototype;
    }

    // Proxy main window Worker constructor immediately
    patchWorkerConstructor(window);

    // Applies time dilation to a target window / iframe context
    function patchContext(ctx, factor) {
        try {
            if (!ctx || ctx.__timeDilationApplied) return;
            ctx.__timeDilationApplied = true;

            patchWorkerConstructor(ctx);

            const origPerf = ctx.performance;
            const origDate = ctx.Date;
            const origPerfNow = origPerf.now.bind(origPerf);
            const origDateNow = origDate.now.bind(origDate);

            const perfStart = origPerfNow();
            const dateStart = origDateNow();

            const patchedPerfNow = () => perfStart + ((origPerfNow() - perfStart) * factor);
            const patchedDateNow = () => dateStart + ((origDateNow() - dateStart) * factor);

            safeDefine(origPerf, 'now', patchedPerfNow);

            function CustomDate(...args) {
                if (!(this instanceof CustomDate)) {
                    return (new origDate(patchedDateNow())).toString();
                }
                return args.length === 0 ? new origDate(patchedDateNow()) : new origDate(...args);
            }

            CustomDate.prototype = origDate.prototype;
            CustomDate.now = patchedDateNow;
            CustomDate.UTC = origDate.UTC;
            CustomDate.parse = origDate.parse;

            safeDefine(ctx, 'Date', CustomDate);

            const origSetTimeout = ctx.setTimeout.bind(ctx);
            const origSetInterval = ctx.setInterval.bind(ctx);
            const origRaf = ctx.requestAnimationFrame ? ctx.requestAnimationFrame.bind(ctx) : null;

            ctx.setTimeout = (fn, delay, ...args) =>
                origSetTimeout(fn, typeof delay === "number" ? delay / factor : delay, ...args);

            ctx.setInterval = (fn, delay, ...args) =>
                origSetInterval(fn, typeof delay === "number" ? delay / factor : delay, ...args);

            if (origRaf) {
                ctx.requestAnimationFrame = (callback) => origRaf(() => callback(origPerf.now()));
            }
        } catch (err) {
            // Ignore cross-origin frame access errors
        }
    }

    function dilateTime(factor, targetHosts) {
        currentDilationFactor = factor;

        if (!targetHosts.some(host => window.location.hostname.includes(host))) return;

        console.log(`[Time Machine (${window.location.origin})] Hostname matched: ${window.location.hostname}`);

        patchContext(window, factor);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.tagName === "IFRAME" && node.contentWindow) {
                        patchContext(node.contentWindow, factor);
                    }
                }
            }
        });

        observer.observe(document.documentElement || document, {
            childList: true,
            subtree: true
        });

        console.log(`[Time Machine (${window.location.origin})] Applied ${factor}x speed dilation`);
    }

    // Settings Messaging Bridge
    window.addEventListener("message", (event) => {
        if (event.source !== window || event.data?.source !== "TIME_MACHINE_SETTINGS") return;

        if (event.data.type === "SETTINGS_RESPONSE") {
            const { dilationFactor, targHsts } = event.data.payload;
            dilateTime(dilationFactor, targHsts);
        }
    });

    window.postMessage({
        source: "TIME_MACHINE_DILATE",
        type: "GET_SETTINGS"
    }, "*");
})();