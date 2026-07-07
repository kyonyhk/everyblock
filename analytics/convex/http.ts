import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Only these event names are accepted; anything else is dropped so a stray
// or malicious beacon can't pollute the table.
const ALLOWED = new Set([
  "pageview", "play", "search-block", "click-block", "search-town",
  "search-year", "ask-answer", "ask-filter", "era", "share",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const clamp = (s: unknown, n: number) =>
  typeof s === "string" ? s.slice(0, n) : undefined;

// Singapore day string (UTC+8) for grouping.
function sgtDay(ts: number): string {
  return new Date(ts + 8 * 3600_000).toISOString().slice(0, 10);
}

// Cookieless visitor id: SHA-256 of a rotating daily salt + day + client IP +
// user agent. Rotating the salt daily means the hash cannot be linked across
// days, and the raw IP/UA are never stored. Same approach Plausible uses.
async function visitorHash(day: string, ip: string, ua: string): Promise<string> {
  const salt = process.env.ANALYTICS_SALT ?? "unsalted-dev";
  const data = new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const http = httpRouter();

http.route({
  path: "/track",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

http.route({
  path: "/track",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      // Body is sent as text/plain (via sendBeacon) to avoid a CORS preflight.
      const body = JSON.parse(await request.text());
      const name = clamp(body.name, 40);
      if (!name || !ALLOWED.has(name)) return new Response(null, { status: 204, headers: CORS });

      const ts = Date.now();
      const day = sgtDay(ts);
      const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "0";
      const ua = request.headers.get("user-agent") ?? "";

      await ctx.runMutation(internal.events.record, {
        name,
        day,
        ts,
        visitor: await visitorHash(day, ip, ua),
        referrer: clamp(body.referrer, 120),
        town: clamp(body.town, 40),
        year: typeof body.year === "number" ? body.year : undefined,
        path: clamp(body.path, 120),
      });
    } catch {
      // Never surface analytics failures to the client.
    }
    return new Response(null, { status: 204, headers: CORS });
  }),
});

export default http;
