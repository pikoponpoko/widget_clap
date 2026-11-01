import { describe, expect, it } from "vitest";
import { periodKey, periodKeys, periodStart } from "../src/periods";

describe("periods", () => {
  it("starts weeks on Monday", () => {
    expect(periodKey("week", "2026-11-01")).toBe("2026-10-26"); // Sunday
    expect(periodKey("week", "2026-11-02")).toBe("2026-11-02"); // Monday
    expect(periodKey("week", "2026-11-07")).toBe("2026-11-02");
  });
  it("lists the latest 12 weeks and months ending now", () => {
    const weeks = periodKeys("week", "2026-11-01");
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1)).toBe("2026-10-26");
    expect(weeks[0]).toBe("2026-08-10");
    const months = periodKeys("month", "2026-11-01");
    expect(months[0]).toBe("2025-12");
    expect(months.at(-1)).toBe("2026-11");
    expect(periodStart("month", "2026-11-01")).toBe("2025-12-01");
  });
  it("lists years from the first data, or just this year", () => {
    expect(periodKeys("year", "2026-11-01", "2019")).toEqual([
      "2019",
      "2020",
      "2021",
      "2022",
      "2023",
      "2024",
      "2025",
      "2026",
    ]);
    expect(periodKeys("year", "2026-11-01")).toEqual(["2026"]);
    expect(periodStart("year", "2026-11-01")).toBeNull();
  });
});
