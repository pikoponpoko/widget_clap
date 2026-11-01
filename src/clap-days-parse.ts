// Reads the daily clap counts saved by the web拍手 script from the
// "過去ログ" (past log) box of each analysis page. Works on the HTML text
// alone so it runs in tests without a DOM.
export interface ClapDay {
  day: string; // YYYY-MM-DD (Japan date)
  claps: number;
  visitors: number;
}

export const clapDaysMarker = 'data-hakushu="webclap-claps"';

const entities: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
};
function textOf(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(lt|gt|amp|nbsp|quot|#39);/g, (e) => entities[e])
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, " ");
}
const pad = (n: number) => String(n).padStart(2, "0");
function valid(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Full date written in a link, e.g. ?date=20261031 or ?y=2026&m=10&d=31. */
function dateInHref(href: string) {
  const q = href.replace(/&amp;/g, "&");
  let m = q.match(
    /(?:^|\D)((?:19|20)\d{2})[-/]?(0[1-9]|1[0-2])[-/]?(0[1-9]|[12]\d|3[01])(?:\D|$)/,
  );
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  const get = (k: string) =>
    q.match(new RegExp(`[?&](?:${k})=(\\d{1,4})(?:&|$)`))?.[1];
  const y = get("y|year"),
    mo = get("m|month|mon"),
    d = get("d|day");
  if (y && mo && d && y.length === 4) return { y: +y, m: +mo, d: +d };
  return null;
}

function readSection(html: string, today: string): ClapDay[] {
  const text = textOf(html);
  const start = text.indexOf("過去ログ");
  if (start < 0) return [];
  let region = text.slice(start + 4);
  // The paging links ("<< 2026年11月上旬") follow the day columns.
  const end = region.search(/<<|>>|\d{4}\s*年|最新/);
  if (end >= 0) region = region.slice(0, end);
  const tokens = [...region.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})|\d+/g)].map(
    (t) =>
      t[1] ? { date: [+t[1], +t[2]] as [number, number] } : { n: Number(t[0]) },
  );
  const dates = tokens.filter((t) => t.date).map((t) => t.date!);
  if (!dates.length) return [];
  // Either every count comes before the date row (table rows), or each day
  // keeps its counts next to its date (one cell per day).
  const pairs: number[][] = [];
  const firstDate = tokens.findIndex((t) => t.date);
  const leading = tokens.slice(0, firstDate).map((t) => t.n!);
  if (!tokens.slice(firstDate).some((t) => !t.date)) {
    const per = Math.max(1, Math.floor(leading.length / dates.length));
    for (let i = 0; i < dates.length; i++)
      pairs.push(leading.slice(i * per, i * per + per));
  } else {
    const groups: number[][] = [leading];
    for (const t of tokens.slice(firstDate)) {
      if (t.date) groups.push([]);
      else groups[groups.length - 1].push(t.n!);
    }
    const before = groups[0].length > 0;
    for (let i = 0; i < dates.length; i++)
      pairs.push(before ? groups[i] : groups[i + 1]);
  }
  // Years: from the 解析 links when they carry one, else from the paging labels.
  const hrefs = [
    ...html.matchAll(
      /<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ];
  const linked = hrefs
    .filter((a) => /解析/.test(textOf(a[2])))
    .map((a) => dateInHref(a[1]));
  const label = (re: RegExp) => {
    for (const a of hrefs) {
      const m = textOf(a[2]).replace(/\s/g, "").match(re);
      if (m) return { y: +m[1], m: +m[2] };
    }
    return null;
  };
  const newer = label(/^<<(\d{4})年(\d{1,2})月/),
    older = label(/^(\d{4})年(\d{1,2})月[上中下]旬>>$/);
  const years: number[] = [];
  if (newer || !older) {
    const ref = newer || { y: +today.slice(0, 4), m: +today.slice(5, 7) };
    let y = dates[0][0] <= ref.m ? ref.y : ref.y - 1;
    dates.forEach(([m], i) => {
      if (i && m > dates[i - 1][0]) y--;
      years.push(y);
    });
  } else {
    const last = dates.length - 1;
    let y = dates[last][0] >= older.m ? older.y : older.y + 1;
    for (let i = last; i >= 0; i--) {
      if (i < last && dates[i][0] < dates[i + 1][0]) y++;
      years[i] = y;
    }
  }
  const out: ClapDay[] = [];
  dates.forEach(([m, d], i) => {
    const link = linked.length === dates.length ? linked[i] : null;
    const y = link && link.m === m && link.d === d ? link.y : years[i];
    const [claps = 0, visitors = 0] = pairs[i] || [];
    if (!valid(y, m, d) || claps > 1e6 || visitors > 1e6) return;
    out.push({ day: `${y}-${pad(m)}-${pad(d)}`, claps, visitors });
  });
  return out;
}

/** One row per day, newest first. A day seen on two pages is read once. */
export function parseClapDays(html: string): ClapDay[] {
  const today =
    html.match(/data-today="(\d{4}-\d{2}-\d{2})"/)?.[1] ||
    new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const sections = html.includes("<section")
    ? html.split(/<section\b/i).slice(1)
    : [html];
  const days = new Map<string, ClapDay>();
  for (const s of sections)
    for (const d of readSection(s, today))
      if (!days.has(d.day)) days.set(d.day, d);
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}
