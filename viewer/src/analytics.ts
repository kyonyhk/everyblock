// Privacy-clean analytics: beacons aggregate, PII-free interaction events to
// everyblock's own Convex /track endpoint. Cookieless. The server derives a
// daily-rotating visitor hash and stores no IP or user agent. Fires only the
// named events wired through track(); no automatic page-level tracking beyond
// a single pageview. No-ops if the endpoint is unset (forks and local dev
// collect nothing) or sendBeacon is unavailable, and never throws into the app.

// Set VITE_ANALYTICS_ENDPOINT at build time (e.g. in Vercel project env vars)
// to the deployment's Convex /track URL. Unset means analytics is off.
const ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT ?? "";

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
