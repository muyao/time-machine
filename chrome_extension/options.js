const dilInput = document.querySelector("#dilInput");
const dilForm = document.querySelector("#dilForm");

const hstInput = document.querySelector("#hstInput");
const hstForm = document.querySelector("#hstForm");

// Load current settings when the options page opens
chrome.storage.sync.get({ dilationFactor: "", targHsts: [] }, (items) => {
	dilInput.value = items.dilationFactor;
	hstInput.value = items.targHsts.join(", ");
});

// Save settings when clicking the save button
dilForm.addEventListener("submit", () => {
	const dilVal = parseFloat(dilInput.value);
	if (!dilVal) return;
	if (isNaN(dilVal)) return;
	if (dilVal < 0) return;
	if (dilVal > 1000) return;
	chrome.storage.sync.set({ dilationFactor: dilVal }, () => { });
});
hstForm.addEventListener("submit", () => {//TODO
	const hstVal = hstInput.value;
	if (!hstVal) return;
	chrome.storage.sync.set({ targHsts: hstVal.replaceAll(" ", "").split(",") }, () => { });
});