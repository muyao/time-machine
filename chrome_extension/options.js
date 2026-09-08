const settingsForm = document.querySelector("#settings-form");
const dilInput = document.querySelector("#dil-input");
const hstInput = document.querySelector("#hsts-input");

// Load current settings when the options page opens
chrome.storage.sync.get({ dilationFactor: "", targHsts: [] }, (items) => {
	dilInput.value = items.dilationFactor;
	hstInput.value = items.targHsts.join(", ");
});

// Save settings when clicking the save button
settingsForm.addEventListener("submit", () => {
	const dilVal = parseFloat(dilInput.value);
	if (!dilVal) return;
	if (isNaN(dilVal)) return;
	if (dilVal < 0) return;
	if (dilVal > 1000) return;
	chrome.storage.sync.set({ dilationFactor: dilVal }, () => { });
});
settingsForm.addEventListener("submit", () => {
	const hstVal = hstInput.value;
	if (!hstVal) return;
	chrome.storage.sync.set({
		targHsts: hstVal
			.split(",")
			.map(str => str.trim())
			.map(str => /^https?:\/\//i.test(str) ? str : `https://${str}`)
			.filter(str => URL.canParse(str))
			.map(str => new URL(str).hostname)
			.map(str => str.replace(/^www\./, ""))
			.filter(str => str.includes(".") && !str.startsWith(".") && !str.endsWith("."))
	}, () => { });
});