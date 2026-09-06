const dilInput = document.querySelector("#dilInput");
const dilForm = document.querySelector("#dilForm")

// Load current settings when the options page opens
chrome.storage.sync.get({ dilationFactor: "" }, (items) => {
	dilInput.value = items.dilationFactor;
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