import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { makeStatsPdf } from "../src/stats-pdf";
import { planners, validateSize } from "../src/planner-sizes";
import type { HourStats, Stats } from "../src/types";
afterEach(() => vi.unstubAllGlobals());
const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 3 + i)).toISOString().slice(0, 10);
  return d;
});
const stats: Stats & { visitor_total?: number } = {
  claps: days.map((day, i) => ({ day, count: (i * 7) % 23 })),
  messages: days.map((day, i) => ({ day, count: i % 4 })),
  totals: { total: 40, unread: 2, unreplied: 1 },
  pages: Array.from({ length: 12 }, (_, i) => ({
    page_url: `https://example.com/p/${i}`,
    page_title: `サンプルツール ${i + 1}`,
    count: 100 - i * 7,
  })),
  from: days[0],
  to: days[29],
  visitor_total: 81,
};
const hours: HourStats = {
  day: days[29],
  hours: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    claps: (hour * 5) % 9,
    visitors: 1,
    messages: hour % 3 ? 0 : 1,
  })),
};
describe("stats print for planners", () => {
  it.each(planners.map((p) => [p.id, p] as const))(
    "%s fits every page to the chosen size",
    async (id, p) => {
      const font = await readFile("public/fonts/NotoSansJP-Regular.ttf");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(font)),
      );
      for (const a4 of [false, true]) {
        const bytes = await makeStatsPdf({
          stats,
          hours,
          planner: id,
          size: { w: p.w, h: p.h, bind: p.bind },
          a4,
        });
        if (process.env.STATS_PDF_OUT)
          await writeFile(
            `${process.env.STATS_PDF_OUT}/${id}${a4 ? "_a4" : ""}.pdf`,
            bytes,
          );
        const pdf = await PDFDocument.load(bytes);
        const { width, height } = pdf.getPage(0).getSize();
        const mm = 72 / 25.4;
        expect(width / mm).toBeCloseTo(a4 ? 210 : p.w, 1);
        expect(height / mm).toBeCloseTo(a4 ? 297 : p.h, 1);
      }
    },
  );
  it("rejects sizes that do not fit on A4", () => {
    expect(() => validateSize({ w: 10, h: 100, bind: 0 })).toThrow();
    expect(() => validateSize({ w: 200, h: 100, bind: 0 })).toThrow();
    expect(() => validateSize({ w: NaN, h: 100, bind: 0 })).toThrow();
  });
});
