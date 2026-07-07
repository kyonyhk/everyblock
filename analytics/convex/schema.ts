import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// One row per interaction. Deliberately holds nothing identifying: `visitor`
// is a daily-rotating salted hash (below), so it counts uniques within a day
// but cannot be linked across days or back to a person. No cookies, no IP or
// user-agent stored, PDPA-clean by construction.
export default defineSchema({
  events: defineTable({
    name: v.string(),                 // "pageview" | "play" | "search-block" | ...
    day: v.string(),                  // "YYYY-MM-DD" (SGT) for cheap grouping
    ts: v.number(),                   // ms epoch
    visitor: v.string(),              // daily salted hash, not PII
    referrer: v.optional(v.string()), // referring hostname only, "" for direct
    town: v.optional(v.string()),     // aggregate event label
    year: v.optional(v.number()),
    path: v.optional(v.string()),
  })
    .index("by_day", ["day"])
    .index("by_name_day", ["name", "day"]),
});
