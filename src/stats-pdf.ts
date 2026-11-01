import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { download } from "./api";
import type { HourStats, Stats } from "./types";

import {
  planners,
  validateSize,
  type PaperSize,
  type PlannerId,
} from "./planner-sizes";

export interface StatsPrintInput {
  stats: Stats & { visitor_total?: number };
  hours: HourStats | null;
  pageTitle?: string;
  planner: PlannerId;
  size: PaperSize;
  a4: boolean;
}
const mm = 72 / 25.4;
// Existing palette only (see styles.css).
const ink = rgb(0x26 / 255, 0x26 / 255, 0x26 / 255),
  muted = rgb(0x73 / 255, 0x73 / 255, 0x73 / 255),
  line = rgb(0xeb / 255, 0xeb / 255, 0xeb / 255),
  barClap = rgb(0xad / 255, 0xad / 255, 0xad / 255),
  barMessage = rgb(0x4a / 255, 0x4a / 255, 0x4a / 255);

const slash = (d: string) => d.replaceAll("-", "/");
function days(stats: Stats) {
  const out: { day: string; claps: number; messages: number }[] = [];
  const end = new Date(stats.to + "T00:00:00Z");
  for (
    let d = new Date(stats.from + "T00:00:00Z");
    d <= end && out.length < 400;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const day = d.toISOString().slice(0, 10);
    out.push({
      day,
      claps: stats.claps.find((x) => x.day === day)?.count || 0,
      messages: stats.messages.find((x) => x.day === day)?.count || 0,
    });
  }
  return out;
}

// A drawing surface measured in mm from the top-left of one planner page.
interface Surface {
  text(s: string, x: number, y: number, size: number, color?: typeof ink): void;
  rect(x: number, y: number, w: number, h: number, color: typeof ink): void;
  hline(x: number, y: number, w: number, color?: typeof ink): void;
  width(s: string, size: number): number;
}

export function plannerSlots(w: number, h: number) {
  const margin = 8;
  const cols = Math.max(1, Math.floor((210 - margin * 2) / w)),
    rows = Math.max(1, Math.floor((297 - margin * 2) / h));
  const x0 = (210 - cols * w) / 2,
    y0 = (297 - rows * h) / 2;
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) slots.push({ x: x0 + c * w, y: y0 + r * h });
  return slots;
}

export async function makeStatsPdf(input: StatsPrintInput) {
  const size = input.size;
  validateSize(size);
  const res = await fetch("/fonts/NotoSansJP-Regular.ttf");
  if (!res.ok) throw new Error("日本語フォントを読み込めませんでした。");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await res.arrayBuffer(), { subset: false });
  doc.setTitle("Hakushu 統計");
  doc.setCreator("Hakushu");
  const charset = new Set(font.getCharacterSet());
  const printable = (s: string) =>
    Array.from(s, (c) => (charset.has(c.codePointAt(0)!) ? c : "□")).join("");

  const slots = input.a4 ? plannerSlots(size.w, size.h) : [{ x: 0, y: 0 }];
  let sheet: PDFPage | undefined,
    slot = slots.length;
  const surfaces: Surface[] = [];
  function newSurface(): Surface {
    if (slot >= slots.length) {
      sheet = doc.addPage(
        input.a4 ? [210 * mm, 297 * mm] : [size.w * mm, size.h * mm],
      );
      slot = 0;
    }
    const page = sheet!,
      pageH = input.a4 ? 297 : size.h,
      { x: ox, y: oy } = slots[slot++];
    if (input.a4) drawMarks(page, ox, pageH - oy - size.h, size.w, size.h);
    const X = (x: number) => (ox + x) * mm,
      Y = (y: number) => (pageH - oy - y) * mm;
    const s: Surface = {
      text: (t, x, y, sz, color = ink) =>
        page.drawText(printable(t), {
          x: X(x),
          y: Y(y),
          size: sz,
          font,
          color,
        }),
      rect: (x, y, w, h, color) =>
        h > 0 &&
        page.drawRectangle({
          x: X(x),
          y: Y(y + h),
          width: w * mm,
          height: h * mm,
          color,
        }),
      hline: (x, y, w, color = line) =>
        page.drawLine({
          start: { x: X(x), y: Y(y) },
          end: { x: X(x + w), y: Y(y) },
          thickness: 0.4,
          color,
        }),
      width: (t, sz) => font.widthOfTextAtSize(printable(t), sz) / mm,
    };
    surfaces.push(s);
    return s;
  }

  const small = size.w < 110,
    tiny = size.w < 40 || size.h < 40;
  const base = tiny ? 5.5 : small ? 6.5 : 7.5, // pt
    lh = (base * 1.6) / mm, // line height in mm
    padX = size.w < 40 ? 2.5 : 6,
    padY = size.h < 40 ? 2.5 : 7,
    top = padY,
    bottom = size.h - padY,
    room = bottom - top;
  let left = padX + size.bind,
    innerW = size.w - left - padX;
  let s = newSurface(),
    y = top;
  const need = (h: number) => {
    if (y + h > bottom && y > top) {
      s = newSurface();
      y = top;
    }
  };
  const chartH = (preferred: number) =>
    short
      ? Math.max(4, room - lh * 1.2 - 1)
      : Math.max(4, Math.min(preferred, room - lh * 2.4));
  function fit(t: string, w: number, sz: number) {
    const chars = Array.from(t);
    while (chars.length > 1 && s.width(chars.join("") + "…", sz) > w)
      chars.pop();
    return chars.join("") + (chars.length < Array.from(t).length ? "…" : "");
  }
  // Short pages (a weekly row) give each section its own page with the
  // section name in a left column.
  const short = size.h < 50,
    baseLeft = left,
    baseW = innerW,
    capW = short ? Math.min(28, baseW * 0.25) : 0;
  const heading = (t: string, sub = "", withLegend = false, follow = 18) => {
    if (short) {
      if (y > top) s = newSurface();
      y = top;
      left = baseLeft;
      s.text(fit(t, capW - 2, base), left, y + base / mm, base);
      if (sub)
        s.text(
          fit(sub, capW - 2, base - 1),
          left,
          y + lh + base / mm,
          base - 1,
          muted,
        );
      if (withLegend) {
        y += lh * (sub ? 2 : 1) + 0.6;
        legend();
        y = top;
      }
      left = baseLeft + capW;
      innerW = baseW - capW;
      return;
    }
    const both = sub ? `${t} ${sub}` : t,
      split = sub && s.width(both, base + 1) > innerW,
      head = lh * (split ? 2.6 : 1.8) + (withLegend ? lh : 0);
    need(Math.min(head + follow, room));
    y += lh * 0.6;
    s.text(
      fit(split ? t : both, innerW, base + 1),
      left,
      y + base / mm,
      base + 1,
    );
    if (split) {
      y += lh;
      s.text(fit(sub, innerW, base), left, y + base / mm, base, muted);
    }
    y += lh * 1.2;
    s.hline(left, y, innerW);
    y += lh * 0.5;
    if (withLegend) legend();
  };

  // Title and period
  const st = input.stats;
  const titleSize = innerW < 40 || short ? base + 1 : base + 3,
    period = `${slash(st.from)}–${slash(st.to)}`;
  s.text("Hakushu 統計", left, y + titleSize / mm, titleSize);
  if (short) {
    const tw = s.width("Hakushu 統計", titleSize) + 3;
    s.text(
      fit(
        [period, input.pageTitle].filter(Boolean).join("  "),
        innerW - tw,
        base - 0.5,
      ),
      left + tw,
      y + titleSize / mm,
      base - 0.5,
      muted,
    );
    y += lh * 1.4;
  } else {
    y += (titleSize * 1.6) / mm;
    const lines =
      s.width(period, base) <= innerW
        ? [period]
        : [`${slash(st.from)}–`, slash(st.to)];
    for (const t of lines) {
      need(lh);
      s.text(t, left, y + base / mm, base, muted);
      y += lh;
    }
    if (input.pageTitle) {
      s.text(
        fit(input.pageTitle, innerW, base),
        left,
        y + base / mm,
        base,
        muted,
      );
      y += lh;
    }
    y += lh * 0.5;
  }

  // Totals
  const list = days(st),
    claps = list.reduce((a, d) => a + d.claps, 0),
    messages = list.reduce((a, d) => a + d.messages, 0);
  const totals: [string, number][] = [
    ["拍手", claps],
    ["感想", messages],
  ];
  if (typeof st.visitor_total === "number")
    totals.push(["人数", st.visitor_total]);
  const cell = innerW / totals.length,
    big = short ? base + 3 : base + 5;
  if (cell < 22)
    // Narrow columns list the totals one per line.
    for (const [label, value] of totals) {
      need(lh * 1.4);
      s.text(label, left, y + base / mm, base - 0.5, muted);
      const v = value.toLocaleString(),
        vw = s.width(v, base + 2);
      s.text(v, left + innerW - vw, y + base / mm, base + 2);
      y += lh * 1.4;
    }
  else {
    need(lh + big / mm);
    totals.forEach(([label, value], i) => {
      s.text(label, left + i * cell, y + base / mm, base - 0.5, muted);
      s.text(value.toLocaleString(), left + i * cell, y + lh + big / mm, big);
    });
    y += lh + (big * 1.6) / mm;
  }

  const legend = () => {
    let x = left;
    for (const [label, color] of [
      ["拍手", barClap],
      ["感想", barMessage],
    ] as const) {
      s.rect(x, y + 0.3, 1.8, 1.8, color);
      s.text(label, x + 2.6, y + base / mm, base - 1, muted);
      x += 2.6 + s.width(label, base - 1) + 4;
    }
    y += lh;
  };
  const bars = (
    data: { label: string; claps: number; messages: number }[],
    height: number,
    ticks: number[],
  ) => {
    need(height + lh * 1.2);
    const axisW = s.width("0000", base - 1.5) + 1,
      x0 = left + axisW,
      w = innerW - axisW,
      max = Math.max(1, ...data.map((d) => d.claps + d.messages)),
      step = w / Math.max(1, data.length),
      gap = Math.min(0.6, step * 0.2);
    s.text(String(max), left, y + (base - 1.5) / mm, base - 1.5, muted);
    s.hline(x0, y, w);
    s.hline(x0, y + height, w, muted);
    data.forEach((d, i) => {
      const hc = (d.claps / max) * height,
        hm = (d.messages / max) * height,
        bx = x0 + i * step + gap / 2,
        bw = Math.max(0.2, step - gap);
      s.rect(bx, y + height - hc, bw, hc, barClap);
      s.rect(bx, y + height - hc - hm, bw, hm, barMessage);
    });
    y += height;
    for (const i of ticks) {
      const label = data[i]?.label;
      if (!label) continue;
      const lw = s.width(label, base - 1.5);
      const cx = Math.min(
        Math.max(x0 + i * step + step / 2 - lw / 2, x0),
        x0 + w - lw,
      );
      s.text(label, cx, y + 0.8 + (base - 1.5) / mm, base - 1.5, muted);
    }
    y += lh * 1.2;
  };

  // Daily chart
  const dailyH = chartH(small ? 22 : 30),
    hourH = chartH(small ? 18 : 24);
  heading("日別の拍手", "", true, dailyH + lh * 1.2);
  bars(
    list.map((d) => ({
      label: Number(d.day.slice(5, 7)) + "/" + Number(d.day.slice(8)),
      ...d,
    })),
    dailyH,
    [0, Math.floor((list.length - 1) / 2), list.length - 1],
  );

  // Hourly chart
  if (input.hours) {
    heading("時間別", slash(input.hours.day), false, hourH + lh * 1.2);
    if (short) y = top;
    bars(
      input.hours.hours.map((h) => ({
        label: String(h.hour),
        claps: h.claps,
        messages: h.messages,
      })),
      hourH,
      [0, 6, 12, 18, 23],
    );
  }

  // Pages
  const pages = st.pages || [];
  if (pages.length && !input.pageTitle) {
    heading("ページ別の拍手", "", false, lh * 1.3);
    for (const p of pages) {
      need(lh * 1.3);
      const count = p.count.toLocaleString(),
        cw = s.width(count, base);
      s.text(
        fit(
          p.page_title || p.page_url || "プレビュー・直接表示",
          innerW - cw - 3,
          base,
        ),
        left,
        y + base / mm,
        base,
      );
      s.text(count, left + innerW - cw, y + base / mm, base);
      y += lh * 1.3;
      s.hline(left, y - lh * 0.25, innerW);
    }
  }

  // Page numbers when the stats span more than one planner page.
  if (surfaces.length > 1 && !short && size.w >= 40)
    surfaces.forEach((sf, i) => {
      const t = `${i + 1}/${surfaces.length}`;
      sf.text(
        t,
        size.w - padX - sf.width(t, base - 1.5),
        size.h - 4,
        base - 1.5,
        muted,
      );
    });
  return doc.save();
}

function drawMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  for (const xx of [x, x + w])
    for (const yy of [y, y + h]) {
      page.drawLine({
        start: { x: (xx - 3) * mm, y: yy * mm },
        end: { x: (xx + 3) * mm, y: yy * mm },
        thickness: 0.3,
        color: muted,
      });
      page.drawLine({
        start: { x: xx * mm, y: (yy - 3) * mm },
        end: { x: xx * mm, y: (yy + 3) * mm },
        thickness: 0.3,
        color: muted,
      });
    }
}

export async function saveStatsPdf(input: StatsPrintInput) {
  const bytes = await makeStatsPdf(input);
  const size = planners.find((p) => p.id === input.planner)!;
  download(
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
    `hakushu_stats_${size.id}${input.a4 ? "_A4" : ""}_${input.stats.from}_${input.stats.to}.pdf`,
  );
}
