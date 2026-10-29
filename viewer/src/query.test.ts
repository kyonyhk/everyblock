import { describe, expect, test } from "bun:test";
import { parseQuery, queryMonthRange } from "./query";

const towns = ["PUNGGOL", "JURONG EAST", "JURONG WEST"];
const types = ["1 ROOM", "2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE", "MULTI-GENERATION"];
const parse = (q: string) => parseQuery(q, towns, types, 2026);

describe("budget questions", () => {
  test.each([
    ["under 1.2m", 1200000],
    ["under 1,200,000", 1200000],
    ["under S$1,200,000?", 1200000],
    ["below $1.2 million.", 1200000],
    ["up to 1.2 mil", 1200000],
    ["within 600k", 600000],
    ["under 600", 600000],
    ["under 650.5k!", 650500],
  ])("%s", (q, amount) => expect(parse(q).priceMax).toBe(amount));

  test.each(["above 1.2m", "over 1,200,000", "at least S$1200000", "from 1.2 million"])("%s", (q) => {
    expect(parse(q).priceMin).toBe(1200000);
  });

  test("combines both bounds, flat type, town, and year", () => {
    expect(parse("4-room in Punggol above 600k and under 1.2m in 2020")).toEqual({
      superlative: null, flatType: 3, towns: [0], year: 2020,
      priceMin: 600000, priceMax: 1200000,
    });
  });

  test("price digits are not interpreted as a year", () => {
    expect(parse("under 1990k in 2020").year).toBe(2020);
    expect(parse("under 1,200,000").year).toBeNull();
    expect(parse("from 2020").priceMin).toBeNull();
  });

  test("keeps record questions and partial town matches working", () => {
    expect(parse("highest price in jurong in 2026")).toMatchObject({
      superlative: "max", towns: [1, 2], year: 2026,
    });
    expect(parse("cheapest 4 room in Punggol")).toMatchObject({ superlative: "min", flatType: 3 });
  });
});

describe("query date scope", () => {
  test("a requested year overrides the current timeline date", () => {
    expect(queryMonthRange(parse("under 1.2m in 2020"), 441, 441)).toEqual([360, 371]);
    expect(queryMonthRange(parse("under 1.2m in 2020"), 100, 441)).toEqual([360, 371]);
  });
  test("the latest year ends at the published cutoff", () => {
    expect(queryMonthRange(parse("under 1.2m in 2026"), 100, 441)).toEqual([432, 441]);
  });
  test("undated budgets retain the trailing year; records retain all-time scope", () => {
    expect(queryMonthRange(parse("under 600k"), 441, 441)).toEqual([430, 441]);
    expect(queryMonthRange(parse("under 600k"), 3, 441)).toEqual([0, 3]);
    expect(queryMonthRange(parse("highest price"), 441, 441, 442)).toEqual([0, 441]);
  });
});
