import {
  browserOptOut,
  CONSENT_KEY,
  CONSENT_MS,
  configForOrigin,
  readConsent,
} from "./analytics-policy.js";
import {
  captureGoogleEvent,
  startGoogleAnalytics,
  stopGoogleAnalytics,
} from "./google-analytics.js";

const config = configForOrigin("barrels", location.origin);
const settings = document.getElementById("analytics-settings");
const description = document.getElementById("analytics-description");
const choices = document.getElementById("analytics-choices");
const accept = document.getElementById("analytics-accept");
let active = false;

function sync() {
  if (!config?.ga4) return;
  choices.hidden = false;
  accept.disabled = browserOptOut();
  const consent = readConsent();
  description.textContent = browserOptOut()
    ? "Your browser’s opt-out signal keeps optional analytics disabled."
    : "Optional Google Analytics helps us understand visits. It loads only if you accept. You can change your choice here.";
  if (consent === null) settings.open = true;
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
  settings.open = false;
}
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
