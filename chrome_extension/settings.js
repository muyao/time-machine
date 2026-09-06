window.addEventListener("message", (event) => {
	if (event.source !== window || event.data?.source !== "TIME_MACHINE_DILATE") return;

	if (event.data.type === "GET_SETTINGS") {
		chrome.storage.sync.get({
			dilationFactor: 0.5
		}, (allSettings) => {
			window.postMessage({
				source: "TIME_MACHINE_SETTINGS",
				type: "SETTINGS_RESPONSE",
				payload: allSettings
			}, "*");
		});
	}
});