// Privacy-clean analytics: beacons aggregate, PII-free interaction events to
// everyblock's own Convex /track endpoint. Cookieless. The server derives a
// daily-rotating visitor hash and stores no IP or user agent. Fires only the
// named events wired through track(); no automatic page-level tracking beyond
// a single pageview. No-ops if the endpoint is unset (before the Convex
// deploy) or sendBeacon is unavailable, and never throws into the app.

// everyblock-analytics Convex prod deployment.
const ENDPOINT = "https://compassionate-dodo-444.convex.site/track";

let referrer = "";
try {
  referrer = document.referrer ? new URL(document.referrer).hostname : "";
} catch {
  /* opaque or malformed referrer */
}

export function track(name: string, data?: Record<string, string | number>) {
  if (!ENDPOINT) return;
  try {
    const body = JSON.stringify({ name, path: location.pathname, referrer, ...data });
    // text/plain keeps sendBeacon a "simple" request, so no CORS preflight.
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
  } catch {
    /* analytics must never throw into the app */
  }
}

// One pageview per load.
track("pageview");
