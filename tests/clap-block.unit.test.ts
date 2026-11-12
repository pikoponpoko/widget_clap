import { describe, expect, it } from "vitest";
import { blockParts, columnRange } from "../src/clap-block";

describe("blockParts", () => {
  const days = [
    { day: "2026-11-02", imported: 0, claps: 3 },
    { day: "2026-11-01", imported: 2, claps: 1 },
  ];
  it("stacks days oldest first, imported counts before recorded claps", () => {
    expect(blockParts(days, 0, 1)).toEqual([
      { day: "2026-11-01", imported: true, count: 1 },
    ]);
    expect(blockParts(days, 2, 3)).toEqual([
      { day: "2026-11-01", imported: false, offset: 0, count: 1 },
    ]);
    expect(blockParts(days, 4, 5)).toEqual([
      { day: "2026-11-02", imported: false, offset: 1, count: 1 },
    ]);
  });
  it("spans days for blocks that stand for several claps", () => {
    expect(blockParts(days, 1, 5)).toEqual([
      { day: "2026-11-01", imported: true, count: 1 },
      { day: "2026-11-01", imported: false, offset: 0, count: 1 },
      { day: "2026-11-02", imported: false, offset: 0, count: 2 },
    ]);
    expect(blockParts(days, 6, 8)).toEqual([]);
  });
});

describe("columnRange", () => {
  it("covers the days of each chart column", () => {
    expect(columnRange("hours", "9", "2026-11-12")).toEqual({
      from: "2026-11-12",
      to: "2026-11-12",
      hour: 9,
    });
    expect(columnRange("week", "2026-11-09", "")).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
    expect(columnRange("month", "2026-02", "")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(columnRange("year", "2025", "")).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });
});
