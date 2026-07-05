((dilation_factor) => {
	const realStartPerformance = performance.now();
	const realStartDate = Date.now();

	const originalPerformanceNow = performance.now.bind(performance);
	const originalDateNow = Date.now;
	const OriginalDate = self.Date;
	const originalRAF = self.requestAnimationFrame.bind(self);
	const originalSetTimeout = self.setTimeout.bind(self);
	const originalSetInterval = self.setInterval.bind(self);

	performance.now = function () {
		const realElapsed = originalPerformanceNow() - realStartPerformance;
		return realStartPerformance + (realElapsed * dilation_factor);
	};

	Date.now = function () {
		const realElapsed = originalDateNow() - realStartDate;
		return realStartDate + (realElapsed * dilation_factor);
	};

	function DilatedDate(...args) {
		if (args.length === 0) {
			return new OriginalDate(Date.now());
		}
		return new OriginalDate(...args);
	}

	DilatedDate.prototype = OriginalDate.prototype;
	DilatedDate.now = Date.now;
	DilatedDate.UTC = OriginalDate.UTC;
	DilatedDate.parse = OriginalDate.parse;
	self.Date = DilatedDate;

	self.requestAnimationFrame = function (callback) {
		return originalRAF((realTimestamp) => {
			callback(performance.now());
		});
	};

	self.setTimeout = function (callback, delay, ...args) {
		const dilatedDelay = typeof delay === "number" ? delay / dilation_factor : delay;
		return originalSetTimeout(callback, dilatedDelay, ...args);
	};

	self.setInterval = function (callback, delay, ...args) {
		const dilatedDelay = typeof delay === "number" ? delay / dilation_factor : delay;
		return originalSetInterval(callback, dilatedDelay, ...args);
	};

	return dilation_factor;
})(0.2);