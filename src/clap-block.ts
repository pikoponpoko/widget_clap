// One block of the activity chart stands for one clap (or a few, on busy
// columns). Blocks stack oldest first: day by day, and within a day the
// counts brought in from another service come before the recorded claps.
import type { ClapAttrs } from "./attributes";

export type BlockDay = { day: string; imported: number; claps: number };
export type BlockPart =
  | { day: string; imported: true; count: number }
  | { day: string; imported: false; offset: number; count: number };
export type BlockClap = {
  id: string;
  created_at: string;
  page_url: string;
  page_title: string;
  attrs: ClapAttrs | null;
};
export type BlockResult = {
  count: number;
  imported: { day: string; count: number }[];
  items: BlockClap[];
};
// Rows listed in one popup; the rest are only counted.
export const BLOCK_ROWS = 20;

// The parts of the days that fall on positions start..end-1.
export function blockParts(days: BlockDay[], start: number, end: number) {
  const parts: BlockPart[] = [];
  let pos = 0;
  for (const d of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    for (const imported of [true, false]) {
      const n = imported ? d.imported : d.claps;
      const from = Math.max(start, pos),
        to = Math.min(end, pos + n);
      if (to > from)
        parts.push(
          imported
            ? { day: d.day, imported, count: to - from }
            : { day: d.day, imported, offset: from - pos, count: to - from },
        );
      pos += n;
    }
  }
  return parts;
}

const addDays = (day: string, n: number) =>
  new Date(Date.parse(day + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
// The days a chart column covers. Keys: hours "H" (on `day`), days
// "YYYY-MM-DD", week "YYYY-MM-DD" (its Monday), month "YYYY-MM", year "YYYY".
export function columnRange(
  mode: "hours" | "days" | "week" | "month" | "year",
  key: string,
  day: string,
): { from: string; to: string; hour?: number } {
  if (mode === "hours") return { from: day, to: day, hour: Number(key) };
  if (mode === "days") return { from: key, to: key };
  if (mode === "week") return { from: key, to: addDays(key, 6) };
  if (mode === "month") {
    const [y, m] = key.split("-").map(Number);
    return {
      from: key + "-01",
      to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    };
  }
  return { from: key + "-01-01", to: key + "-12-31" };
}
