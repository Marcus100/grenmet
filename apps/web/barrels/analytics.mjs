import {
  browserOptOut,
  CONSENT_KEY,
  CONSENT_MS,
  configForOrigin,
  readConsent,
  readSavedConsent,
} from "./analytics-policy.js";
import {
  captureGoogleEvent,
  startGoogleAnalytics,
  stopGoogleAnalytics,
} from "./google-analytics.js";

const config = configForOrigin("barrels", location.origin);
const settings = document.getElementById("analytics-settings");
const open = document.getElementById("analytics-open");
const description = document.getElementById("analytics-description");
const accept = document.getElementById("analytics-accept");
let active = false;

function show(card) {
  settings.hidden = !card;
  open.hidden = card;
}

function sync() {
  // Nothing optional runs here, so there is nothing to ask about.
  if (!config?.ga4) return;
  accept.disabled = browserOptOut();
  const consent = readConsent();
  description.hidden = !browserOptOut();
  description.textContent = "Your browser has turned optional analytics off.";
  if (readSavedConsent() === null) show(true);
  else if (settings.hidden) show(false);
  if (consent === "accepted" && !active) {
    startGoogleAnalytics(config);
    captureGoogleEvent(config, "page_viewed", { section: "home" });
    active = true;
  } else if (consent !== "accepted") {
    stopGoogleAnalytics(config.ga4);
    active = false;
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.trim().split("=")[0];
      if (name.startsWith("_ga")) {
        // biome-ignore lint/suspicious/noDocumentCookie: remove this site's analytics cookies on withdrawal.
        document.cookie = `${name}=; Max-Age=0; Path=/`;
      }
    }
  }
}
function choose(value) {
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value, expires: Date.now() + CONSENT_MS })
    );
  } catch {
    /* Without persistent consent collection remains disabled. */
  }
  sync();
  show(false);
}
open.addEventListener("click", () => show(true));
accept.addEventListener("click", () =>
  choose(browserOptOut() ? "declined" : "accepted")
);
document
  .getElementById("analytics-decline")
  .addEventListener("click", () => choose("declined"));
document
  .querySelector('a[href="https://eugine.me/"]')
  .addEventListener("click", () => {
    if (config && readConsent() === "accepted")
      captureGoogleEvent(config, "personal_site_clicked", {});
  });
window.addEventListener("storage", sync);
window.addEventListener("focus", sync);
window.setInterval(sync, 60_000);
sync();
