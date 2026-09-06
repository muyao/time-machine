(() => {

	function dilateTime(dilationFactor) {
		// Code string executed inside worker scopes
		const workerPatchCode = `
			(function (d) {
				if (self.__timeWorkerApplied) return;
				self.__timeWorkerApplied = true;

				const m = self, t = "bind", n = "number", o = performance, r = "prototype";
				const a = o.now(), b = Date.now(), c = o.now[t](o), e = Date.now, f = m.Date;
				const h = m.setTimeout[t](m), i = m.setInterval[t](m);

				o.now = function () { return a + ((c() - a) * d); };
				Date.now = function () { return b + ((e() - b) * d); };

				function k(...q) { if (q.length === 0) return new f(Date.now()); return new f(...q); }
				k[r] = f[r]; k.now = Date.now; k.UTC = f.UTC; k.parse = f.parse; m.Date = k;

				m.setTimeout = function (l, p, ...q) { return h(l, typeof p === n ? p / d : p, ...q); };
				m.setInterval = function (l, p, ...q) { return i(l, typeof p === n ? p / d : p, ...q); };
			})(${dilationFactor});
		`;

		// Monkey-patch standard Web Worker constructor
		if (typeof window.Worker !== "undefined") {
			const NativeWorker = window.Worker;

			window.Worker = function (scriptURL, options) {
				let absoluteURL;
				try {
					absoluteURL = new URL(scriptURL, window.location.href).href;
				} catch (e) {
					absoluteURL = scriptURL;
				}

				const workerBaseDir = absoluteURL.substring(0, absoluteURL.lastIndexOf("/") + 1);

				// Overwrite importScripts, fetch, and XMLHttpRequest inside worker to resolve relative paths
				const blobCode = `
					(function () {
						const baseDir = "${workerBaseDir}";

						// Fix importScripts
						const nativeImportScripts = self.importScripts;
						self.importScripts = function (...urls) {
							const resolved = urls.map(url => new URL(url, baseDir).href);
							return nativeImportScripts.apply(self, resolved);
						};

						// Fix fetch (used by WASM streaming compilation)
						const nativeFetch = self.fetch;
						if (nativeFetch) {
							self.fetch = function (input, init) {
								if (typeof input === "string") {
									input = new URL(input, baseDir).href;
								} else if (input instanceof Request) {
									input = new Request(new URL(input.url, baseDir).href, input);
								}
								return nativeFetch.call(self, input, init);
							};
						}

						// Fix XMLHttpRequest (used by WASM fallback loader)
						const NativeXHR = self.XMLHttpRequest;
						if (NativeXHR) {
							self.XMLHttpRequest = function () {
								const xhr = new NativeXHR();
								const nativeOpen = xhr.open;
								xhr.open = function (method, url, ...args) {
									const resolvedURL = new URL(url, baseDir).href;
									return nativeOpen.call(this, method, resolvedURL, ...args);
								};
								return xhr;
							};
						}
					})();

					${workerPatchCode}
					importScripts("${absoluteURL}");
				`;

				const blob = new Blob([blobCode], { type: "application/javascript" });
				const blobURL = URL.createObjectURL(blob);

				return new NativeWorker(blobURL, options);
			};

			window.Worker.prototype = NativeWorker.prototype;
		}

		// Apply time dilation to main page window & same-origin frames
		const patchContext = (ctx) => {
			debugger;
			try {
				if (!ctx || ctx.__timeDilationApplied) return;
				ctx.__timeDilationApplied = true;

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

		console.log(`Time dilation ${dilationFactor}x speed`);
	}

	window.addEventListener("message", (event) => {
		// Only accept messages from the current window and matching our source identifier
		if (event.source !== window || event.data?.source !== "TIME_MACHINE_SETTINGS") return;

		if (event.data.type === "SETTINGS_RESPONSE") {
			dilationFactor = event.data.payload.dilationFactor;

			dilateTime(dilationFactor);
		}
	});

	window.postMessage({
		source: "TIME_MACHINE_DILATE",
		type: "GET_SETTINGS"
	}, "*");
})();