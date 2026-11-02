// Who clapped, recorded with each clap from 2026-11 on. Shared by the Worker and the browser preview.
export interface ClapAttrs {
  country: string;
  region: string;
  // Left empty when it only repeats the region.
  city: string;
  lang: string;
  device: "phone" | "tablet" | "pc" | "";
  os: string;
  browser: string;
  // Host of the page the visitor came from, "self" for the same site, "" when unknown.
  referrer: string;
  screen: string;
  repeat: boolean;
}
export const ATTR_KEYS = [
  "region",
  "lang",
  "device",
  "os",
  "browser",
  "referrer",
  "screen",
  "repeat",
] as const;
export type AttrKey = (typeof ATTR_KEYS)[number];
export interface AttrStats {
  total: number;
  lists: Record<AttrKey, { v: string; n: number }[]>;
}
const clip = (s: unknown, n: number) =>
  String(s ?? "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .trim()
    .slice(0, n);
export function parseAgent(ua: string) {
  const s = ua || "";
  const os = /Windows/.test(s)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(s)
      ? "iOS"
      : /Android/.test(s)
        ? "Android"
        : /CrOS/.test(s)
          ? "ChromeOS"
          : /Mac OS X|Macintosh/.test(s)
            ? "macOS"
            : /Linux/.test(s)
              ? "Linux"
              : "";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : "";
  const device: ClapAttrs["device"] = /iPad|Tablet/.test(s)
    ? "tablet"
    : /Android/.test(s) && !/Mobile/.test(s)
      ? "tablet"
      : /Mobi|iPhone|iPod|Android/.test(s)
        ? "phone"
        : s
          ? "pc"
          : "";
  return { os, browser, device };
}
// "ja-JP" → "ja". Only the language, not the country part.
export function cleanLang(s: unknown) {
  const m = String(s ?? "").match(/^\s*([A-Za-z]{2,3})(?:[-_]|\s*[,;]|\s*$)/);
  return m ? m[1].toLowerCase() : "";
}
export function cleanScreen(s: unknown) {
  const m = String(s ?? "").match(/^(\d{2,5})x(\d{2,5})$/);
  return m ? `${+m[1]}x${+m[2]}` : "";
}
export function cleanReferrer(s: unknown, pageUrl: string) {
  const host = String(s ?? "")
    .toLowerCase()
    .trim();
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || !host.includes(".")) return "";
  let page = "";
  try {
    page = new URL(pageUrl).hostname;
  } catch {}
  const bare = (h: string) => h.replace(/^www\./, "");
  return page && bare(page) === bare(host) ? "self" : host;
}
// Cloudflare gives Japanese prefectures as ISO 3166-2 numbers ("13" is Tokyo).
const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];
const sameName = (a: unknown, b: unknown) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
export function buildAttrs(input: {
  country?: unknown;
  region?: unknown;
  regionCode?: unknown;
  city?: unknown;
  lang?: unknown;
  acceptLanguage?: string | null;
  userAgent?: string | null;
  referrer?: unknown;
  screen?: unknown;
  pageUrl: string;
  repeat: boolean;
}): ClapAttrs {
  return {
    country: /^[A-Z]{2}$/.test(String(input.country || ""))
      ? String(input.country)
      : "",
    region:
      (input.country === "JP" && PREFECTURES[Number(input.regionCode) - 1]) ||
      clip(input.region, 60),
    city: sameName(input.city, input.region) ? "" : clip(input.city, 60),
    lang: cleanLang(input.lang) || cleanLang(input.acceptLanguage),
    ...parseAgent(String(input.userAgent || "").slice(0, 500)),
    referrer: cleanReferrer(input.referrer, input.pageUrl),
    screen: cleanScreen(input.screen),
    repeat: input.repeat,
  };
}
export function readAttrs(raw: unknown): ClapAttrs | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const a = JSON.parse(raw);
    return a && typeof a === "object" ? (a as ClapAttrs) : null;
  } catch {
    return null;
  }
}
export function tallyAttrs(rows: (ClapAttrs | null)[]): AttrStats {
  const lists = Object.fromEntries(
    ATTR_KEYS.map((k) => [k, new Map<string, number>()]),
  ) as Record<AttrKey, Map<string, number>>;
  let total = 0;
  for (const a of rows) {
    if (!a) continue;
    total++;
    const values: Record<AttrKey, string> = {
      // The country is kept so "Tokyo" in two countries stays apart.
      region: [a.country || "", a.region || "", a.city || ""].join("|"),
      lang: a.lang || "",
      device: a.device || "",
      os: a.os || "",
      browser: a.browser || "",
      referrer: a.referrer || "",
      screen: a.screen || "",
      repeat: a.repeat ? "repeat" : "first",
    };
    for (const k of ATTR_KEYS)
      lists[k].set(values[k], (lists[k].get(values[k]) || 0) + 1);
  }
  return {
    total,
    lists: Object.fromEntries(
      ATTR_KEYS.map((k) => [
        k,
        [...lists[k]]
          .map(([v, n]) => ({ v, n }))
          .sort((a, b) => b.n - a.n || a.v.localeCompare(b.v))
          .slice(0, 50),
      ]),
    ) as AttrStats["lists"],
  };
}
// What the clapping browser can tell about itself; the referrer comes from the host page via embed.js.
export function browserAttrs(referrer: string) {
  return {
    lang: (typeof navigator !== "undefined" && navigator.language) || "",
    screen:
      typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "",
    ref: referrer,
  };
}
