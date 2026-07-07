import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

// Insert path, called only by the /track HTTP action after it has computed
// the cookieless visitor hash.
export const record = internalMutation({
  args: {
    name: v.string(),
    day: v.string(),
    ts: v.number(),
    visitor: v.string(),
    referrer: v.optional(v.string()),
    town: v.optional(v.string()),
    year: v.optional(v.number()),
    path: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("events", a);
  },
});

// --- dashboard queries (run from the Convex dashboard function runner) ---

// Visits and unique visitors per day over the last N days.
export const trafficByDay = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days = 30 }) => {
    const rows = await ctx.db.query("events").withIndex("by_name_day").collect();
    const byDay = new Map<string, { views: number; visitors: Set<string> }>();
    for (const r of rows) {
      if (r.name !== "pageview") continue;
      let d = byDay.get(r.day);
      if (!d) byDay.set(r.day, (d = { views: 0, visitors: new Set() }));
      d.views++;
      d.visitors.add(r.visitor);
    }
    return [...byDay.entries()]
      .map(([day, d]) => ({ day, views: d.views, visitors: d.visitors.size }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-days);
  },
});

// Total count of each event name (the roadmap signal).
export const eventCounts = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("events").collect();
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  },
});

// Top referrers (how people arrived), direct excluded.
export const topReferrers = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("events").withIndex("by_name_day").collect();
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.name !== "pageview" || !r.referrer) continue;
      counts.set(r.referrer, (counts.get(r.referrer) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  },
});

// Which towns people search / open (product-demand signal).
export const topTowns = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("events").collect();
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.town) continue;
      counts.set(r.town, (counts.get(r.town) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([town, count]) => ({ town, count }))
      .sort((a, b) => b.count - a.count);
  },
});
