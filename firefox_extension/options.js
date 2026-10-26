const extAPI = typeof browser !== "undefined" ? browser : chrome;

const settingsForm = document.querySelector("#settings-form");
const dilInput = document.querySelector("#dil-input");
const hstInput = document.querySelector("#hsts-input");
const submitStatus = document.querySelector("#submit-status");

function isValidURL(str) {
    if (typeof URL.canParse === "function") {
        return URL.canParse(str);
    }
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

// Load current settings when the options page opens
extAPI.storage.sync.get({ dilationFactor: "", targHsts: [] }, (items) => {
    dilInput.value = items.dilationFactor;
    hstInput.value = items.targHsts.join(", ");
});

function syncDil() {
    const dilVal = parseFloat(dilInput.value);
    if (!dilVal || isNaN(dilVal) || dilVal < 0) return;
    extAPI.storage.sync.set({ dilationFactor: dilVal });
}

function syncHsts() {
    const hstVal = hstInput.value;
    extAPI.storage.sync.set({
        targHsts: hstVal
            .split(",")
            .map(str => str.trim())
            .map(str => /^https?:\/\//i.test(str) ? str : `https://${str}`)
            .filter(str => isValidURL(str))
            .map(str => new URL(str).hostname)
            .map(str => str.replace(/^www\./, ""))
            .filter(str => str.includes(".") && !str.startsWith(".") && !str.endsWith("."))
    });
}

// Save settings when clicking the save button
settingsForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    syncDil();
    syncHsts();
    submitStatus.style.opacity = "1.0";
    setTimeout(() => {
        submitStatus.style.opacity = "0.0";
    }, 2500);
});