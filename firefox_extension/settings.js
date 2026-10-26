const extAPI = typeof browser !== "undefined" ? browser : chrome;

window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "TIME_MACHINE_DILATE") return;

    if (event.data.type === "GET_SETTINGS") {
        extAPI.storage.sync.get({
            dilationFactor: 1.0,
            targHsts: []
        }, (allSettings) => {
            window.postMessage({
                source: "TIME_MACHINE_SETTINGS",
                type: "SETTINGS_RESPONSE",
                payload: allSettings
            }, "*");
        });
    }
});