import { embedCode } from "./embed-code";
import { DEFAULT_REACTIONS, MAX_REACTIONS, REACTIONS } from "./reactions";
import { cleanTipLabel, defaultTipLabel } from "./page-context";
import { previewMode } from "./mode";
import { assetUrl, densityOf } from "./asset-url";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  FolderHeart,
  Heart,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Printer,
  RefreshCw,
  Reply,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  api,
  clearCache,
  date,
  dateTime,
  downloadEndpoint,
  send,
  useApi,
} from "./api";
import { defaultPrint, type PrintOptions } from "./print-options";
import { collectImages } from "./image-files";
import { planners, type PaperSize, type PlannerId } from "./planner-sizes";
import type { Asset, HourStats, Message, Project, Stats } from "./types";
import { ATTR_KEYS, type AttrKey } from "./attributes";
import type { PeriodBucket, PeriodStats, PeriodUnit } from "./periods";
import { webclapScript } from "./webclap-script";
import { parseImport, parseImportHtml, type ImportRow } from "./import-parse";
import { clapDaysMarker, parseClapDays, type ClapDay } from "./clap-days-parse";
const shiftDay = (d: string, n: number) =>
  new Date(Date.parse(d + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
const jstToday = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);
type Section = "overview" | "inbox" | "projects" | "print" | "data";
const titles: Record<Section, string> = {
  overview: "ダッシュボード",
  inbox: "届いた感想",
  projects: "ウィジェット",
  print: "感想を印刷",
  data: "データ管理",
};
const navs: [Section, typeof Inbox, string][] = [
  ["overview", LayoutDashboard, "ダッシュボード"],
  ["inbox", Inbox, "届いた感想"],
  ["projects", FolderHeart, "ウィジェット"],
  ["print", Printer, "感想を印刷"],
];
function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p className="error" role="alert">
      {children}
    </p>
  ) : null;
}
function Empty({
  title,
  children,
  icon: Icon = Mail,
}: {
  title: string;
  children?: ReactNode;
  icon?: typeof Mail;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={30} strokeWidth={1.2} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className={"modal " + (wide ? "wide" : "")}
      ref={ref}
      onCancel={onClose}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="閉じる">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
async function copy(value: string) {
  await navigator.clipboard.writeText(value);
}
function StatCard({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: number | string;
  icon: typeof Heart;
  note?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {label}
        <Icon size={17} />
      </div>
      <div className="stat-value">
        {typeof value === "number" ? value.toLocaleString() : value}
        <small>件</small>
      </div>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
function pagePath(url: string) {
  try {
    const u = new URL(url);
    return decodeURI(u.pathname + u.search);
  } catch {
    return url;
  }
}
// Same hand as the clap button image (public/clap-button.svg), drawn like the lucide icons.
function ClapIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="10.5 1 33 33"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 29-5-8c-2-3 0-5 2-2l3 4-1-12c0-3 3-3 3 0l1 9 1-12c0-3 3-2 3 0l-1 12 3-9c1-3 4-2 3 1l-3 10 3-5c2-3 4-1 3 1l-5 11c-2 5-8 5-10 0Z" />
      <path d="m15 10-2-3m25 4 3-3M32 5l1-3" />
    </svg>
  );
}
// The title opens the page; the clap button narrows the dashboard to it (press again for all pages).
function PageStats({
  stats,
  selected,
  onSelect,
}: {
  stats: Stats | null;
  selected: string;
  onSelect: (page: string) => void;
}) {
  if (!stats) return null;
  const pages = stats.pages || [];
  // Pages that share a title (or have none) also show their path so each row is identifiable.
  const titleCount = new Map<string, number>();
  for (const p of pages)
    titleCount.set(p.page_title, (titleCount.get(p.page_title) || 0) + 1);
  if (!pages.length)
    return <Empty title="拍手はまだありません" icon={ThumbsUp} />;
  return (
    <ol className="page-stats">
      {pages.map((p) => (
        <li
          key={p.page_url}
          className={selected && p.page_url === selected ? "active" : ""}
        >
          {p.page_url ? (
            <>
              <a
                className="page-link"
                href={p.page_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="page-title">
                  {p.page_title || pagePath(p.page_url)}
                </span>
                {p.page_title && (titleCount.get(p.page_title) || 0) > 1 && (
                  <span className="page-path">{pagePath(p.page_url)}</span>
                )}
                <ExternalLink size={13} />
              </a>
              <button
                type="button"
                className="icon-button page-filter"
                aria-pressed={p.page_url === selected}
                aria-label={
                  (p.page_title || pagePath(p.page_url)) + "で絞り込む"
                }
                title="絞り込む"
                onClick={() =>
                  onSelect(p.page_url === selected ? "" : p.page_url)
                }
              >
                <ClapIcon size={18} />
              </button>
            </>
          ) : (
            <span className="muted">プレビュー・直接表示</span>
          )}
          <b>{p.count.toLocaleString()}</b>
        </li>
      ))}
    </ol>
  );
}
// Who clapped: place, language, device, referrer, screen and first time or not.
const ATTR_TITLES: Record<AttrKey, string> = {
  region: "地域",
  lang: "言語",
  device: "端末",
  os: "OS",
  browser: "ブラウザ",
  referrer: "参照元",
  screen: "画面サイズ",
  repeat: "初回・リピート",
};
function displayName(type: "region" | "language", code: string) {
  try {
    return new Intl.DisplayNames(["ja"], { type }).of(code) || code;
  } catch {
    return code;
  }
}
function referrerName(host: string) {
  if (host === "self") return "サイト内";
  const h = host.replace(/^(www|m|l|lm)\./, "");
  if (/^google\./.test(h)) return "Google検索";
  if (/(^|\.)yahoo\./.test(h)) return "Yahoo!検索";
  if (/^bing\.com$/.test(h)) return "Bing";
  if (/^duckduckgo\.com$/.test(h)) return "DuckDuckGo";
  if (/^(t\.co|x\.com|twitter\.com)$/.test(h)) return "X";
  if (/^(facebook\.com|fb\.me)$/.test(h)) return "Facebook";
  if (/^instagram\.com$/.test(h)) return "Instagram";
  if (/^(bsky\.app)$/.test(h)) return "Bluesky";
  return h;
}
// Unknown values are left out of the lists.
function attrKnown(k: AttrKey, v: string) {
  if (k === "region") return v.replace(/\|/g, "") !== "";
  return !!v;
}
function attrLabel(k: AttrKey, v: string) {
  if (k === "region") {
    const [country, region, city] = v.split("|");
    const nation =
      country && country !== "JP" ? displayName("region", country) : "";
    return [nation, region, city].filter(Boolean).join(" ");
  }
  if (k === "referrer") return referrerName(v);
  if (k === "lang") return displayName("language", v);
  if (k === "device")
    return v === "phone" ? "スマホ" : v === "tablet" ? "タブレット" : "PC";
  if (k === "screen") return v.replace("x", "×");
  if (k === "repeat") return v === "repeat" ? "リピート" : "初回";
  return v;
}
function AttrList({
  k,
  rows,
  total,
}: {
  k: AttrKey;
  rows: { v: string; n: number }[];
  total: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <div className="attr-block">
      <h3>{ATTR_TITLES[k]}</h3>
      <ol>
        {shown.map((r) => (
          <li key={r.v}>
            <span className="attr-name">
              {k === "referrer" && r.v !== "self" ? (
                <span title={r.v}>{attrLabel(k, r.v)}</span>
              ) : (
                attrLabel(k, r.v)
              )}
            </span>
            <b>{r.n.toLocaleString()}</b>
            <i style={{ width: (r.n / total) * 100 + "%" }} />
          </li>
        ))}
      </ol>
      {rows.length > 5 && (
        <button
          type="button"
          className="text-button attr-more"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? "閉じる" : `ほか ${rows.length - 5} 件`}
        </button>
      )}
    </div>
  );
}
function AttrStats({ stats }: { stats: Stats }) {
  const a = stats.attributes;
  if (!a?.total)
    return <p className="reaction-empty muted">記録はまだありません</p>;
  return (
    <div className="attr-grid">
      {ATTR_KEYS.map((k) => {
        const rows = (a.lists[k] || []).filter((r) => attrKnown(k, r.v));
        return rows.length ? (
          <AttrList key={k} k={k} rows={rows} total={a.total} />
        ) : null;
      })}
    </div>
  );
}
// Claps per page, who clapped and reactions share one card, switched by the heading tabs.
function PageAttrPanel({
  stats,
  selected,
  onSelect,
}: {
  stats: Stats | null;
  selected: string;
  onSelect: (page: string) => void;
}) {
  const [tab, setTab] = useState<"pages" | "people" | "reactions">("pages"),
    [mode, setMode] = useState<ReactionMode>("days");
  if (!stats) return null;
  return (
    <section className="panel activity-panel">
      <div className="panel-heading activity-heading">
        <div className="heading-tabs" role="tablist">
          {(
            [
              ["pages", "ページ別の拍手"],
              ["people", "拍手した人"],
              ["reactions", "リアクション"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "reactions" && (
          <div className="mode-switch" role="tablist">
            {(
              [
                ["days", "日別"],
                ["pages", "ページ別"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "active" : ""}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {tab === "pages" ? (
        <PageStats stats={stats} selected={selected} onSelect={onSelect} />
      ) : tab === "people" ? (
        <AttrStats stats={stats} />
      ) : (
        <ReactionStats
          stats={stats}
          mode={mode}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
// Reactions pressed on the thank-you screen, per day or per page.
type ReactionMode = "days" | "pages";
function ReactionStats({
  stats,
  mode,
  selected,
  onSelect,
}: {
  stats: Stats;
  mode: ReactionMode;
  selected: string;
  onSelect: (page: string) => void;
}) {
  const days = stats.reaction_days || [],
    pages = stats.reaction_pages || [];
  const source = mode === "days" ? days : pages;
  const kinds = REACTIONS.filter((r) => source.some((x) => x.kind === r.key));
  const total = (k: string) =>
    source.filter((x) => x.kind === k).reduce((a, x) => a + x.count, 0);
  type Row = {
    key: string;
    label: string;
    url?: string;
    counts: Map<string, number>;
  };
  const rows = new Map<string, Row>();
  for (const x of source) {
    const key = "day" in x ? x.day : x.page_url;
    const row = rows.get(key) || {
      key,
      label:
        "day" in x
          ? x.day.replaceAll("-", "/")
          : x.page_title || pagePath(x.page_url),
      url: "day" in x ? undefined : x.page_url,
      counts: new Map(),
    };
    row.counts.set(x.kind, (row.counts.get(x.kind) || 0) + x.count);
    rows.set(key, row);
  }
  const sum = (r: Row) => [...r.counts.values()].reduce((a, n) => a + n, 0);
  const list = [...rows.values()].sort((a, b) =>
    mode === "days" ? b.key.localeCompare(a.key) : sum(b) - sum(a),
  );
  return (
    <>
      {!list.length ? (
        <p className="reaction-empty muted">リアクションはまだありません</p>
      ) : (
        <ol className="page-stats reaction-stats">
          <li className="reaction-total">
            <span>合計</span>
            <span className="reaction-counts">
              {kinds.map((r) => (
                <span key={r.key} title={r.label}>
                  {r.emoji}
                  <b>{total(r.key).toLocaleString()}</b>
                </span>
              ))}
            </span>
          </li>
          {list.map((row) => (
            <li
              key={row.key}
              className={selected && row.url === selected ? "active" : ""}
            >
              {row.url ? (
                <button
                  type="button"
                  className="page-filter"
                  aria-pressed={row.url === selected}
                  onClick={() => onSelect(row.url === selected ? "" : row.url!)}
                >
                  {row.label}
                </button>
              ) : row.url === "" ? (
                <span className="muted">プレビュー・直接表示</span>
              ) : (
                <span>{row.label}</span>
              )}
              <span className="reaction-counts">
                {kinds.map((r) => (
                  <span key={r.key} title={r.label}>
                    {r.emoji}
                    <b>{(row.counts.get(r.key) || 0).toLocaleString()}</b>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
// Year/month/day hour:minute in Japan time, e.g. 2026/11/01 16:07.
const clapTime = (iso: string) => {
  const t = new Date(Date.parse(iso) + 9 * 3600000).toISOString();
  return `${t.slice(0, 10).replaceAll("-", "/")} ${t.slice(11, 16)}`;
};
function ClapTimes({
  hours,
  hour,
}: {
  hours: HourStats | null;
  hour: string | null;
}) {
  const list = (hours?.claps || []).filter(
    (c) =>
      hour === null || Number(clapTime(c.at).slice(11, 13)) === Number(hour),
  );
  if (!list.length) return null;
  return (
    <ol className="clap-times" aria-label="拍手の時刻">
      {list.map((c, i) => (
        <li key={c.at + i}>
          <time dateTime={c.at}>{clapTime(c.at)}</time>
          {c.page_url ? (
            <a
              className="page-link"
              href={c.page_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="page-title">
                {c.page_title || pagePath(c.page_url)}
              </span>
              <ExternalLink size={13} />
            </a>
          ) : (
            <span className="page-title">{c.page_title}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
type Column = {
  key: string;
  label: string;
  tick: string;
  claps: number;
  messages: number;
  visitors: number;
  imported?: number;
};
const modes = [
  ["hours", "時間別"],
  ["days", "日別"],
  ["week", "週別"],
  ["month", "月別"],
  ["year", "年別"],
] as const;
type Mode = (typeof modes)[number][0];
function periodColumn(unit: PeriodUnit, b: PeriodBucket): Column {
  const [y, m, d] = b.key.split("-");
  const label =
    unit === "year"
      ? `${y}年`
      : unit === "month"
        ? `${y}年${Number(m)}月`
        : `${y}/${m}/${d}〜`;
  const tick =
    unit === "year"
      ? y
      : unit === "month"
        ? `${Number(m)}月`
        : `${Number(m)}/${Number(d)}`;
  return { ...b, label, tick };
}
function Activity({
  stats,
  hours,
  day,
  onDay,
  onRange,
  query,
}: {
  stats: Stats | null;
  hours: HourStats | null;
  day: string;
  onDay: (day: string) => void;
  onRange: (n: number) => void;
  query: string;
}) {
  const [mode, setMode] = useState<Mode>("hours");
  const [unit, setUnit] = useState<PeriodUnit>("week");
  const [pick, setPick] = useState<string | null>(null);
  const periods = useApi<PeriodStats>(
    `/owner/stats/periods?unit=${unit}&${query}`,
    null,
    true,
    true,
  );
  const isPeriod = mode !== "hours" && mode !== "days";
  const shift = (n: number) => {
    const d = new Date(day + "T00:00:00Z");
    onDay(new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10));
    setPick(null);
  };
  let columns: Column[] | null = null;
  if (mode === "days" && stats) {
    columns = [];
    let cur = new Date(stats.from + "T00:00:00Z");
    const end = new Date(stats.to + "T00:00:00Z");
    while (cur <= end && columns.length < 366) {
      const key = cur.toISOString().slice(0, 10);
      columns.push({
        key,
        label: key.replaceAll("-", "/"),
        tick: "",
        claps: stats.claps.find((x) => x.day === key)?.count || 0,
        messages: stats.messages.find((x) => x.day === key)?.count || 0,
        visitors: stats.visitors?.find((x) => x.day === key)?.count || 0,
        imported: stats.imported?.find((x) => x.day === key)?.claps || 0,
      });
      cur = new Date(cur.getTime() + 86400000);
    }
    if (columns.length) {
      columns[0].tick = stats.from.slice(5).replace("-", "/");
      columns[columns.length - 1].tick = stats.to.slice(5).replace("-", "/");
    }
  }
  if (mode === "hours" && hours)
    columns = hours.hours.map((h) => ({
      key: String(h.hour),
      label: `${h.hour}時`,
      tick: String(h.hour),
      ...h,
    }));
  if (isPeriod && periods.data?.unit === mode)
    columns = periods.data.buckets.map((b) => periodColumn(mode, b));
  const picked = mode !== "days" ? columns?.find((c) => c.key === pick) : null;
  const sum = (k: "claps" | "visitors" | "messages") =>
    picked ? picked[k] : (columns || []).reduce((a, c) => a + c[k], 0);
  // Summing columns counts a returning visitor twice, so prefer the
  // distinct count from the server.
  const visitors = picked
    ? picked.visitors
    : ((mode === "days"
        ? stats?.visitor_total
        : mode === "hours"
          ? hours?.visitors
          : periods.data?.visitors) ?? sum("visitors"));
  // Each clap (and each comment) is one block stacked on the column. When a
  // busy column would make blocks thinner than 4px, one block stands for
  // several, so the tallest column still fits the 88px chart.
  const blocks = (n: number, unit: number) => Math.ceil(n / unit);
  let per = 1;
  const tallest = (u: number) =>
    Math.max(
      1,
      ...(columns || []).map((c) => blocks(c.claps, u) + blocks(c.messages, u)),
    );
  while (tallest(per) * 4 > 88) per++;
  const blockPx = Math.min(12, Math.floor(88 / tallest(per)));
  // Claps change color from the 5th, 10th and 20th one up, so busy times stand out.
  const stop = (n: number) => (Math.ceil(n / per) - 1) * blockPx;
  const tiers = `linear-gradient(to top, var(--clap-1) 0 ${stop(5)}px, var(--clap-2) ${stop(5)}px ${stop(10)}px, var(--clap-3) ${stop(10)}px ${stop(20)}px, var(--clap-4) ${stop(20)}px)`;
  return (
    <section className="panel activity-panel">
      <div className="panel-heading activity-heading">
        <div className="mode-switch" role="tablist">
          {modes.map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "active" : ""}
              onClick={() => {
                setMode(m);
                if (m !== "hours" && m !== "days") setUnit(m);
                setPick(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "hours" && (
          <div className="day-step">
            <button
              type="button"
              className="icon-button"
              aria-label="前の日"
              onClick={() => shift(-1)}
            >
              <ChevronLeft size={14} />
            </button>
            <input
              type="date"
              className="hour-date"
              aria-label="時間別の日付"
              value={day}
              onChange={(e) => {
                if (!e.target.value) return;
                onDay(e.target.value);
                setPick(null);
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="次の日"
              onClick={() => shift(1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        {mode === "days" && (
          <div className="day-step">
            <button
              type="button"
              className="icon-button"
              aria-label="前の30日"
              onClick={() => onRange(-1)}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="次の30日"
              disabled={!stats || stats.to >= jstToday()}
              onClick={() => onRange(1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      {!columns ? (
        <div className="chart-loading">集計を読み込んでいます…</div>
      ) : (
        <>
          <div
            className="activity-bars"
            style={
              {
                "--block": `${blockPx}px`,
                "--tiers": tiers,
              } as React.CSSProperties
            }
          >
            {columns.map((c) => {
              const active = c.key === (mode === "days" ? day : pick);
              return (
                <button
                  type="button"
                  key={c.key}
                  className={"chart-column " + (active ? "active" : "")}
                  title={
                    `${c.label} 人数 ${c.visitors}・拍手 ${c.claps}・感想 ${c.messages}` +
                    (c.imported ? `（取り込み 拍手 ${c.imported}）` : "")
                  }
                  aria-label={`${c.label} 拍手 ${c.claps} 件`}
                  onClick={() => {
                    if (mode === "days") {
                      onDay(c.key);
                      setMode("hours");
                    } else setPick(active ? null : c.key);
                  }}
                >
                  <span className="chart-stack">
                    <span
                      className="bar-message"
                      style={{
                        height: `${blocks(c.messages, per) * blockPx}px`,
                      }}
                    />
                    <span
                      className="bar-clap"
                      style={{
                        height: `${blocks(c.claps, per) * blockPx}px`,
                      }}
                    />
                  </span>
                  <span
                    className={
                      "chart-tick " + (mode !== "days" ? "centered" : "")
                    }
                  >
                    {c.tick}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="hour-total">
            <span className="chart-legend">
              <span>
                <i className="legend-clap">
                  <b />
                  <b />
                  <b />
                  <b />
                </i>
                拍手
              </span>
              <span>
                <i className="legend-message" />
                感想
              </span>
            </span>
            {picked && (
              <button
                type="button"
                className="hour-picked"
                onClick={() => setPick(null)}
              >
                {picked.label} ×
              </button>
            )}
            <span>
              人数 <b>{visitors}</b>
            </span>
            <span>
              拍手 <b>{sum("claps")}</b>
            </span>
            <span>
              感想 <b>{sum("messages")}</b>
            </span>
          </div>
          {mode === "hours" && <ClapTimes hours={hours} hour={pick} />}
        </>
      )}
    </section>
  );
}
export default function App() {
  const session = useApi<{
    role: string;
    local: boolean;
  }>("/owner/session", null, false, true);
  const [section, setSection] = useState<Section>(() =>
    ["overview", "inbox", "projects", "print", "data"].includes(
      location.hash.slice(1),
    )
      ? (location.hash.slice(1) as Section)
      : "overview",
  );
  // The day chart and the page lists cover 30 days ending on `to`.
  const [to, setTo] = useState(jstToday()),
    from = shiftDay(to, -29),
    [day, setDay] = useState(jstToday()),
    [pageUrl, setPageUrl] = useState("");
  const [project, setProject] = useState(""),
    [toast, setToast] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [version, setVersion] = useState(0);
  const projects = useApi<Project[]>(
      "/owner/projects?v=" + version,
      null,
      false,
      true,
    ),
    stats = useApi<Stats>(
      "/owner/stats?" +
        new URLSearchParams({
          ...(pageUrl ? { page: pageUrl } : {}),
          v: String(version),
          from,
          to,
        }),
      null,
      true,
      true,
    ),
    hours = useApi<HourStats>(
      "/owner/stats/hours?" +
        new URLSearchParams({
          ...(pageUrl ? { page: pageUrl } : {}),
          v: String(version),
          day,
        }),
      null,
      true,
      true,
    ),
    // The top card counts today's claps on every page, whatever the chart shows.
    // When the chart already shows that, its numbers are used instead of a second request.
    todayShown = !pageUrl && day === jstToday(),
    todayOnly = useApi<HourStats>(
      todayShown
        ? ""
        : "/owner/stats/hours?" +
            new URLSearchParams({ v: String(version), day: jstToday() }),
      null,
      true,
      !todayShown,
    ),
    today = todayShown ? hours : todayOnly;
  const [statsPrint, setStatsPrint] = useState(false);
  const [selected, setSelected] = useState<Message | null>(null),
    [edit, setEdit] = useState<Project | "new" | null>(null);
  const list = projects.data || [];
  // One site is the usual case, so its widget page opens directly.
  const widgetTarget = edit || (list.length === 1 ? list[0] : null);
  function navigate(next: Section) {
    setSection(next);
    setEdit(null);
    location.hash = next;
    setMobileNav(false);
  }
  function refresh() {
    setVersion((v) => v + 1);
  }
  useEffect(() => {
    if (!mobileNav) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileNav]);
  function notify(s: string) {
    setToast(s);
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  // An installed app stays open in the background, so coming back to it
  // loads the latest numbers, or the new version when one has been deployed.
  useEffect(() => {
    // The numbers start loading right away; the version check runs alongside.
    // Switching back and forth within a minute reuses the numbers already shown,
    // since each reload reads the whole history from D1.
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 60000) return;
      last = Date.now();
      refresh();
      hasNewVersion().then((next) => next && location.reload());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  useEffect(() => {
    const handler = () => {
      const s = location.hash.slice(1) as Section;
      if (s in titles) setSection(s);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (session.error) clearCache();
  }, [session.error]);
  const todayClaps = today.data?.hours.reduce((a, h) => a + h.claps, 0) ?? 0,
    total = stats.data?.totals;
  if (!session.data && session.loading)
    return (
      <div className="auth-page">
        <p>読み込み中…</p>
      </div>
    );
  if (session.error)
    return (
      <div className="auth-page">
        <LockKeyhole size={32} />
        <h1>Owner専用</h1>
        <p>{session.error}</p>
        <button className="btn primary" onClick={() => location.reload()}>
          ログイン状態を確認する
        </button>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileNav ? "is-open" : "")}>
        <a className="brand" href="/admin">
          <span>Hakushu</span>
        </a>
        <nav>
          {navs.map(([key, Icon, label]) => (
            <button
              key={key}
              className={section === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <Icon size={18} strokeWidth={1.6} />
              {label}
              {key === "inbox" && !!total?.unread && (
                <span className="nav-count">{total.unread}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={section === "data" ? "active" : ""}
            onClick={() => navigate("data")}
          >
            <Database size={18} strokeWidth={1.6} />
            データ管理
          </button>
        </div>
      </aside>
      {mobileNav && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileNav(false)}
          aria-hidden="true"
        />
      )}
      <div className="main-area">
        <header className="topbar">
          <button
            className="mobile-toggle icon-button"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="メニュー"
          >
            <MoreHorizontal />
          </button>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <h1>{titles[section]}</h1>
            </div>
            {section === "projects" &&
            edit &&
            (list.length > 1 || edit === "new") ? (
              <button className="btn" onClick={() => setEdit(null)}>
                <ChevronLeft size={15} />
                サイト一覧
              </button>
            ) : section === "projects" && !widgetTarget ? (
              <button className="btn primary" onClick={() => setEdit("new")}>
                <Plus size={16} />
                サイトを追加
              </button>
            ) : section === "overview" ? (
              <div className="heading-actions">
                <button
                  className="icon-button"
                  onClick={refresh}
                  aria-label="集計を更新"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setStatsPrint(true)}
                  disabled={!stats.data}
                  aria-label="統計を印刷"
                >
                  <Printer size={15} />
                </button>
              </div>
            ) : null}
          </div>
          {(section === "inbox" || section === "print") && list.length > 1 && (
            <div className="scope-bar">
              <span className="scope-label">サイト</span>
              <div className="select-wrap">
                <select
                  aria-label="作品で絞り込む"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">すべてのサイト</option>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>
            </div>
          )}
          <ErrorText>{projects.error || stats.error}</ErrorText>
          {section === "overview" && (
            <>
              <div className="stat-grid">
                <StatCard
                  label="受け取った拍手"
                  value={todayClaps}
                  icon={ThumbsUp}
                  note="今日"
                />
                <StatCard
                  label="届いた感想"
                  value={total?.total || 0}
                  icon={MessageCircle}
                  note={`${total?.unread || 0} 件 未読`}
                />
                <StatCard
                  label="未返信"
                  value={total?.unreplied || 0}
                  icon={Reply}
                />
              </div>
              <div className="dashboard-single">
                <div className="dashboard-main">
                  <ErrorText>{hours.error}</ErrorText>
                  <Activity
                    stats={stats.data}
                    hours={hours.data}
                    day={day}
                    onDay={setDay}
                    onRange={(n) => {
                      const next = shiftDay(to, n * 30),
                        today = jstToday();
                      setTo(next > today ? today : next);
                    }}
                    query={new URLSearchParams({
                      ...(pageUrl ? { page: pageUrl } : {}),
                      v: String(version),
                    }).toString()}
                  />
                  <PageAttrPanel
                    stats={stats.data}
                    selected={pageUrl}
                    onSelect={setPageUrl}
                  />
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        新しく届いた感想
                        <span className="count-label">
                          {total?.unread || 0}
                        </span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => navigate("inbox")}
                      >
                        すべて見る <ArrowRight size={14} />
                      </button>
                    </div>
                    <InboxList
                      project=""
                      version={version}
                      compact
                      onSelect={setSelected}
                    />
                  </section>
                </div>
              </div>
            </>
          )}
          {section === "inbox" && (
            <section className="panel inbox-panel">
              <InboxList
                project={project}
                version={version}
                onSelect={setSelected}
                onChanged={(text) => {
                  notify(text);
                  refresh();
                }}
              />
            </section>
          )}
          {section === "projects" && widgetTarget && (
            <div className="dashboard-columns">
              <div className="dashboard-main">
                <ProjectModal
                  key={widgetTarget === "new" ? "new" : widgetTarget.id}
                  inline
                  project={widgetTarget}
                  onClose={() => {
                    if (widgetTarget === "new") setEdit(null);
                    refresh();
                  }}
                  notify={notify}
                />
              </div>
              {widgetTarget !== "new" && (
                <div className="dashboard-side">
                  <section className="panel widget-preview-panel">
                    <div className="panel-heading">
                      <h2>プレビュー</h2>
                    </div>
                    <iframe
                      key={version}
                      title="ウィジェットのプレビュー"
                      className="preview-frame"
                      src={"/widget/" + widgetTarget.slug}
                    />
                    <div className="preview-actions">
                      <a
                        href={"/widget/" + widgetTarget.slug}
                        className="text-button"
                        target="_blank"
                        rel="noreferrer"
                      >
                        別のタブで試す <ExternalLink size={13} />
                      </a>
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}
          {section === "projects" && !widgetTarget && (
            <div className="project-grid">
              {list.map((p) => (
                <article className="panel project-card" key={p.id}>
                  <div className="project-card-top">
                    <span className="status-dot">
                      {p.message_enabled || p.clap_enabled
                        ? "受付中"
                        : "受付休止"}
                    </span>
                  </div>
                  <h2>{p.title}</h2>
                  <div className="project-totals">
                    <span>
                      <ThumbsUp size={15} />
                      {p.claps}
                      <small>拍手</small>
                    </span>
                    <span>
                      <MessageCircle size={15} />
                      {p.messages}
                      <small>感想</small>
                    </span>
                  </div>
                  <div className="project-card-actions">
                    <button className="btn" onClick={() => setEdit(p)}>
                      <Settings2 size={14} />
                      設定・埋め込み
                    </button>
                    <a
                      href={"/widget/" + p.slug}
                      target="_blank"
                      rel="noreferrer"
                      className="icon-button"
                      aria-label={p.title + "をプレビュー"}
                    >
                      <ArrowUpRight size={20} />
                    </a>
                  </div>
                </article>
              ))}
              <button className="add-project" onClick={() => setEdit("new")}>
                <Plus size={24} />
                <span>サイトを追加</span>
              </button>
            </div>
          )}
          {section === "print" && (
            <PrintPanel project={project} notify={notify} />
          )}
          {section === "data" && (
            <DataPanel notify={notify} refresh={refresh} />
          )}
          {session.data?.local && (
            <footer className="page-footer">ローカル開発環境</footer>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {statsPrint && stats.data && (
        <StatsPrintModal
          stats={stats.data}
          hours={hours.data}
          pageTitle={
            pageUrl
              ? stats.data.pages?.find((p) => p.page_url === pageUrl)
                  ?.page_title || pagePath(pageUrl)
              : ""
          }
          notify={notify}
          onClose={() => setStatsPrint(false)}
        />
      )}
      {selected && (
        <MessageModal
          message={selected}
          onClose={() => {
            setSelected(null);
            refresh();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}
function InboxList({
  project,
  version,
  compact = false,
  onSelect,
  onChanged,
}: {
  project: string;
  version: number;
  compact?: boolean;
  onSelect: (m: Message) => void;
  onChanged?: (text: string) => void;
}) {
  const [status, setStatus] = useState("all"),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [month, setMonth] = useState(""),
    [checked, setChecked] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false),
    [bulkError, setBulkError] = useState("");
  useEffect(() => setPage(0), [project, status, month]);
  useEffect(
    () => setChecked(new Set()),
    [project, status, month, page, version],
  );
  const { data, error, loading } = useApi<{
    items: Message[];
    total: number;
    page: number;
    months?: { month: string; count: number }[];
  }>(
    "/owner/messages?" +
      new URLSearchParams({
        project,
        status,
        ...(month && !compact ? { month } : {}),
        page: String(page),
        v: String(version),
      }),
    null,
    false,
    compact,
  );
  const months = data?.months || [];
  const monthIndex = months.findIndex((x) => x.month === month);
  async function bulk(action: string, label: string) {
    if (
      action === "delete" &&
      !confirm(`${checked.size} 件の感想を削除します。元に戻せません。`)
    )
      return;
    setBusy(true);
    setBulkError("");
    try {
      await send("/owner/messages/bulk", { ids: [...checked], action });
      onChanged?.(`${checked.size} 件を${label}`);
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const items = (data?.items || []).filter(
    (m) =>
      !search ||
      m.body.includes(search) ||
      (m.sender_name || "").includes(search) ||
      (m.page_title || m.project_title).includes(search),
  );
  return (
    <>
      {!compact && (
        <>
          <div className="inbox-toolbar">
            <div className="inbox-tabs">
              {[
                ["all", "すべて"],
                ["unread", "未読"],
                ["unreplied", "未返信"],
                ["replied", "返信済み"],
                ["imported", "取り込み"],
                ["blocked", "非表示"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={status === key ? "active" : ""}
                  onClick={() => setStatus(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="month-bar">
              <button
                className="icon-button"
                disabled={!month || monthIndex >= months.length - 1}
                onClick={() => setMonth(months[monthIndex + 1].month)}
                aria-label="前の月"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="select-wrap">
                <select
                  aria-label="月で絞り込む"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                >
                  <option value="">すべての月</option>
                  {month && monthIndex < 0 && (
                    <option value={month}>{month.replace("-", "年")}月</option>
                  )}
                  {months.map((x) => (
                    <option key={x.month} value={x.month}>
                      {x.month.replace("-", "年")}月（{x.count}）
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>
              <button
                className="icon-button"
                disabled={!month || monthIndex <= 0}
                onClick={() => setMonth(months[monthIndex - 1].month)}
                aria-label="次の月"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <label className="search-input">
              <Search size={15} />
              <input
                placeholder="このページの感想を検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="感想を検索"
              />
            </label>
          </div>
        </>
      )}
      <ErrorText>{error || bulkError}</ErrorText>
      {!compact && !!items.length && (
        <div className="bulk-bar">
          <label className="check-label">
            <input
              type="checkbox"
              aria-label="表示中の感想をすべて選択"
              checked={items.every((m) => checked.has(m.id))}
              onChange={(e) =>
                setChecked(
                  new Set(e.target.checked ? items.map((m) => m.id) : []),
                )
              }
            />
            {checked.size ? `${checked.size} 件選択` : "すべて選択"}
          </label>
          {!!checked.size && (
            <div className="bulk-actions">
              {(status === "blocked"
                ? [
                    ["unblock", "再表示"],
                    ["delete", "削除"],
                  ]
                : [
                    ["read", "既読にする"],
                    ["unread", "未読にする"],
                    ["block", "非表示"],
                    ["delete", "削除"],
                  ]
              ).map(([action, label]) => (
                <button
                  key={action}
                  className={"btn " + (action === "delete" ? "danger" : "")}
                  disabled={busy}
                  onClick={() =>
                    bulk(
                      action,
                      label === "既読にする"
                        ? "既読にしました"
                        : label === "未読にする"
                          ? "未読にしました"
                          : label + "しました",
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {loading && !data ? (
        <p className="loading-text">読み込んでいます…</p>
      ) : items.length ? (
        <div className="message-list">
          {items.slice(0, compact ? 4 : 50).map((m) => (
            <div className="message-item" key={m.id}>
              {!compact && (
                <input
                  type="checkbox"
                  className="message-check"
                  aria-label="この感想を選択"
                  checked={checked.has(m.id)}
                  onChange={(e) => {
                    const next = new Set(checked);
                    if (e.target.checked) next.add(m.id);
                    else next.delete(m.id);
                    setChecked(next);
                  }}
                />
              )}
              <button
                className={"message-row " + (!m.read_at ? "unread" : "")}
                onClick={() => onSelect(m)}
              >
                <span className="letter-avatar">
                  <Mail size={18} strokeWidth={1.3} />
                </span>
                <div className="message-summary">
                  <div className="message-meta">
                    <span className="project-tag">
                      {m.page_title || m.project_title}
                    </span>
                    {!m.read_at && <span className="unread-dot" />}
                    {m.source === "import" && (
                      <span className="consent-badge">取り込み</span>
                    )}
                    {!!m.publication_consent && (
                      <span className="consent-badge">公開許可あり</span>
                    )}
                    {m.reply_wanted != null && (
                      <span className="consent-badge">
                        {m.reply_wanted ? "返事希望" : "返事不要"}
                      </span>
                    )}
                    <time>{dateTime(m.created_at)}</time>
                  </div>
                  {m.sender_name && (
                    <b className="sender-name">{m.sender_name}</b>
                  )}
                  <p>{m.body}</p>
                  {m.source !== "import" && (
                    <span className="reply-status">
                      {m.reply_body ? (
                        <>
                          <CheckCheck size={12} />
                          返信済み
                        </>
                      ) : (
                        "未返信"
                      )}
                    </span>
                  )}
                </div>
                <ChevronRight size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title={
            search
              ? "該当する感想がありません"
              : status === "all"
                ? "メッセージはまだありません"
                : "該当するメッセージはありません"
          }
        ></Empty>
      )}
      {!compact && !!data?.total && (
        <div className="pagination">
          <span>
            {data.total} 件中 {page * 50 + 1}–
            {Math.min((page + 1) * 50, data.total)} 件
          </span>
          <div>
            <button
              className="icon-button"
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
              aria-label="前のページ"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              disabled={(page + 1) * 50 >= data.total}
              onClick={() => setPage((p) => p + 1)}
              aria-label="次のページ"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function MessageModal({
  message: m,
  onClose,
  notify,
}: {
  message: Message;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [reply, setReply] = useState(m.reply_body || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [newUrl, setNewUrl] = useState(""),
    [active, setActive] = useState(!!m.reply_link_active);
  useEffect(() => {
    send("/owner/messages/" + m.id, { read: true }, "PATCH").catch((e) =>
      setError(e.message),
    );
  }, [m.id]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="届いた感想" onClose={onClose}>
      <div className="modal-body">
        <div className="message-detail-meta">
          {m.page_url ? (
            <a
              className="project-tag"
              href={m.page_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {m.page_title || m.page_url}
            </a>
          ) : (
            <span className="project-tag">{m.project_title}</span>
          )}
          <time>
            {date(m.created_at)} · {dateTime(m.created_at)}
          </time>
          {m.source === "import" && (
            <span className="consent-badge">取り込み</span>
          )}
          {m.reply_wanted != null && (
            <span className="consent-badge">
              {m.reply_wanted ? "返事希望" : "返事不要"}
            </span>
          )}
        </div>
        {m.sender_name && <b className="sender-name">{m.sender_name}</b>}
        <div className="message-full">{m.body}</div>
        <div className="consent-note">
          <ShieldCheck size={14} />
          {m.publication_consent
            ? "第三者公開への同意あり。公開時は個人情報を除去してください。"
            : "作者のみ閲覧・私的保存用。第三者公開への同意はありません。"}
        </div>
        <div className="detail-actions">
          <button
            className="text-button"
            onClick={() =>
              action(async () => {
                await copy(m.body);
                notify("感想をコピーしました");
              })
            }
          >
            <Copy size={14} />
            コピー
          </button>
          <button
            className="text-button"
            onClick={() =>
              action(async () => {
                await send(
                  "/owner/messages/" + m.id,
                  { blocked: !m.blocked },
                  "PATCH",
                );
                notify(
                  m.blocked ? "感想を再表示しました" : "感想を非表示にしました",
                );
                onClose();
              })
            }
          >
            {m.blocked ? "再表示する" : "非表示にする"}
          </button>
          <button
            className="text-button danger"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "この感想と返信を削除します。返信URLも無効になります。バックアップには最長12か月残る場合があります。",
                )
              )
                action(async () => {
                  await api("/owner/messages/" + m.id, { method: "DELETE" });
                  notify("感想を削除しました");
                  onClose();
                });
            }}
          >
            <Trash2 size={14} />
            削除
          </button>
        </div>
        {m.source !== "import" && (
          <>
            <div className="reply-editor">
              <h3>
                <Reply size={17} />
                作者からの返信
              </h3>
              <p className="muted small-text">
                返信確認URLを持つ相手だけが読むことができます。
              </p>
              <textarea
                aria-label="返信内容"
                rows={5}
                maxLength={4000}
                placeholder="返信内容"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <button
                className="btn primary"
                disabled={busy || !reply.trim() || !!m.blocked}
                onClick={() =>
                  action(async () => {
                    await send(
                      "/owner/messages/" + m.id + "/reply",
                      { body: reply },
                      "PUT",
                    );
                    notify("返信を保存しました");
                    onClose();
                  })
                }
              >
                <Reply size={15} />
                {busy ? "保存中…" : "返信を保存"}
              </button>
            </div>
            <details className="token-settings">
              <summary>返信確認URLの管理</summary>
              <p>
                現在のURL：{active ? "有効" : "無効"}
                。再発行すると古いURLは無効になります。新しいURLはこの画面で一度だけ表示します。送り主への自動通知はありません。
              </p>
              <div className="button-row">
                <button
                  className="btn"
                  disabled={busy || !active}
                  onClick={() =>
                    action(async () => {
                      await send("/owner/messages/" + m.id + "/reply-token", {
                        action: "revoke",
                      });
                      setActive(false);
                      setNewUrl("");
                      notify("返信確認URLを無効にしました");
                    })
                  }
                >
                  無効化
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("新しいURLを発行し、古いURLを無効にしますか？"))
                      action(async () => {
                        const r = await send<{ token: string }>(
                          "/owner/messages/" + m.id + "/reply-token",
                          { action: "rotate" },
                        );
                        setNewUrl(location.origin + "/reply#" + r.token);
                        setActive(true);
                      });
                  }}
                >
                  再発行
                </button>
              </div>
              {newUrl && (
                <input
                  aria-label="再発行された返信URL"
                  value={newUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              )}
            </details>
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
const blankProject = {
  title: "",
  slug: "",
  description: "",
  site_url: "",
  allowed_origins: [] as string[],
  clap_enabled: true,
  message_enabled: true,
  favorite_enabled: true,
  thanks_enabled: true,
  reply_enabled: true,
  thanks_order: "random" as "random" | "sequential" | "fixed",
  thanks_message: "",
  tip_url: "",
  ng_words: [] as string[],
  blocked_sites: [] as string[],
  reactions: [...DEFAULT_REACTIONS] as string[],
};
function presetOf(f: { clap_enabled: unknown; message_enabled: unknown }) {
  if (!f.clap_enabled) return "";
  return f.message_enabled ? "message" : "clap";
}
function ProjectModal({
  project,
  onClose,
  notify,
  inline = false,
}: {
  project: Project | "new";
  onClose: () => void;
  notify: (s: string) => void;
  inline?: boolean;
}) {
  const initial =
    project === "new"
      ? blankProject
      : {
          title: project.title,
          slug: project.slug,
          description: project.description,
          site_url: project.site_url,
          allowed_origins: project.allowed_origins,
          clap_enabled: !!project.clap_enabled,
          message_enabled: !!project.message_enabled,
          favorite_enabled: !!project.favorite_enabled,
          thanks_enabled:
            project.thanks_enabled !== false && project.thanks_enabled !== 0,
          reply_enabled:
            project.reply_enabled !== false && project.reply_enabled !== 0,
          thanks_order: project.thanks_order,
          thanks_message: project.thanks_message || "",
          tip_url: project.tip_url || "",
          ng_words: project.ng_words || [],
          blocked_sites: project.blocked_sites || [],
          reactions: project.reactions || [...DEFAULT_REACTIONS],
        };
  const [form, setForm] = useState(initial),
    [ngWords, setNgWords] = useState(initial.ng_words.join("\n")),
    [blockedSites, setBlockedSites] = useState(
      initial.blocked_sites.join("\n"),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("settings"),
    [embedTip, setEmbedTip] = useState(false),
    [embedTipLabel, setEmbedTipLabel] = useState(""),
    [dropKind, setDropKind] = useState(""),
    [dragId, setDragId] = useState(""),
    [order, setOrder] = useState<string[] | null>(null);
  const assets = useApi<Asset[]>(
    project === "new"
      ? "/owner/projects/new/assets"
      : "/owner/projects/" + project.id + "/assets",
  );
  const set = (key: keyof typeof form, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(
        project === "new" ? "/owner/projects" : "/owner/projects/" + project.id,
        {
          ...form,
          ng_words: [
            ...new Set(
              ngWords
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ],
          blocked_sites: [
            ...new Set(
              blockedSites
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ],
        },
        project === "new" ? "POST" : "PUT",
      );
      notify("作品の設定を保存しました");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    source: FileList | DataTransfer,
    kind: "button" | "thanks",
  ) {
    if (project === "new" || busy) return;
    setBusy(true);
    setError("");
    const failed: string[] = [];
    let added = 0;
    try {
      const files = await collectImages(source);
      if (!files.length)
        throw new Error("PNG/APNG・JPG・GIF・WebPの画像が見つかりません。");
      const previous =
        kind === "button"
          ? (assets.data ?? []).filter((a) => a.kind === "button")
          : [];
      // Only one button image is allowed, so the current one makes way first.
      for (const a of previous)
        await api("/owner/assets/" + a.id, { method: "DELETE" });
      for (const file of kind === "button" ? files.slice(0, 1) : files) {
        try {
          if (file.size > 2097152)
            throw new Error("画像は2MB以下にしてください。");
          const density = kind === "button" ? densityOf(file.name) : 1;
          const query =
            "?kind=" + kind + (density > 1 ? "&scale=" + density : "");
          await api("/owner/projects/" + project.id + "/assets" + query, {
            method: "POST",
            body: file,
            headers: { "Content-Type": "application/octet-stream" },
          });
          added++;
        } catch (e) {
          failed.push(file.name + ": " + (e as Error).message);
          if (/上限/.test((e as Error).message)) break;
        }
      }
      if (added) notify(added + "枚の画像を登録しました");
      if (failed.length) setError(failed.join("\n"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      assets.refresh();
      setBusy(false);
    }
  }
  const sortedAssets = (kind: "button" | "thanks") => {
    const list = (assets.data ?? []).filter((a) => a.kind === kind);
    return kind === "thanks" && order
      ? [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      : list;
  };
  async function saveOrder() {
    setDragId("");
    if (project === "new" || !order) return;
    const before = sortedAssets("thanks").map((a) => a.id);
    const unchanged =
      (assets.data ?? [])
        .filter((a) => a.kind === "thanks")
        .map((a) => a.id)
        .join() === before.join();
    if (unchanged) return setOrder(null);
    try {
      await send(
        "/owner/projects/" + project.id + "/assets/order",
        { ids: before },
        "PUT",
      );
      notify("並び順を保存しました");
    } catch (e) {
      setError((e as Error).message);
      setOrder(null);
    }
    assets.refresh();
  }
  useEffect(() => {
    if (!dragId) setOrder(null);
  }, [assets.data]);
  const widgetUrl =
    location.origin +
    "/widget/" +
    (project === "new" ? form.slug : project.slug);
  const embed = embedCode(
    location.origin,
    project === "new" ? form.slug : project.slug,
    embedTip,
    cleanTipLabel(embedTipLabel),
  );
  const title = project === "new" ? "サイトを追加" : project.title;
  // A plain function (not a component) so the form keeps its state and focus across renders.
  const frame = (children: ReactNode) =>
    inline ? (
      <section className="panel widget-settings">
        <div className="panel-heading">
          <h2>{title}</h2>
        </div>
        {children}
      </section>
    ) : (
      <Modal title={title + "の設定"} onClose={onClose} wide>
        {children}
      </Modal>
    );
  return frame(
    <>
      <div className="modal-tabs">
        {[
          ["settings", "基本設定"],
          ["images", "画像"],
          ["embed", "埋め込み"],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
            disabled={project === "new" && key !== "settings"}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="modal-body">
        <ErrorText>{error}</ErrorText>
        {tab === "settings" && (
          <form onSubmit={save} className="settings-form">
            <div className="form-grid">
              <label>
                サイト名
                <input
                  required
                  maxLength={80}
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </label>
              <label>
                URLスラッグ
                <input
                  required
                  pattern="[a-z0-9][a-z0-9-]{0,59}"
                  value={form.slug}
                  onChange={(e) => set("slug", e.target.value)}
                />
                <small>半角英小文字・数字・ハイフン</small>
              </label>
            </div>
            <label>
              NGキーワード
              <textarea
                rows={3}
                value={ngWords}
                onChange={(e) => setNgWords(e.target.value)}
              />
              <small>1行に1語。含む感想は「非表示」に入ります。</small>
            </label>
            <label>
              ブロックするサイト
              <textarea
                rows={3}
                placeholder="example.com"
                value={blockedSites}
                onChange={(e) => setBlockedSites(e.target.value)}
              />
              <small>
                1行に1ドメイン。サブドメインも含めて、ボタンの表示と拍手・感想の受付を止めます。
              </small>
            </label>
            <div className="setting-section">
              <h3>ウィジェットの機能</h3>
              <div className="widget-presets">
                {[
                  ["clap", "拍手のみ"],
                  ["message", "拍手＋感想"],
                ].map(([key, label]) => (
                  <button
                    type="button"
                    className={
                      "btn" + (presetOf(form) === key ? " active" : "")
                    }
                    aria-pressed={presetOf(form) === key}
                    key={key}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        clap_enabled: true,
                        message_enabled: key === "message",
                        reply_enabled: key === "message",
                        thanks_enabled: true,
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {[
                ["clap_enabled", "拍手を受け付ける"],
                ["message_enabled", "非公開の感想を受け付ける"],
                ["thanks_enabled", "お礼イラストを表示"],
                ["reply_enabled", "非公開の返信確認を有効にする"],
              ].map(([key, label]) => (
                <label className="toggle-row" key={key}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={!!form[key as keyof typeof form]}
                    onChange={(e) =>
                      set(key as keyof typeof form, e.target.checked)
                    }
                  />
                </label>
              ))}
              <label className="toggle-row">
                <span>お礼イラストの表示順</span>
                <select
                  value={form.thanks_order}
                  onChange={(e) => set("thanks_order", e.target.value)}
                >
                  <option value="random">ランダム</option>
                  <option value="sequential">順番</option>
                  <option value="fixed">最初に登録した画像のみ</option>
                </select>
              </label>
              <label>
                お礼の一言
                <textarea
                  rows={2}
                  maxLength={200}
                  value={form.thanks_message}
                  onChange={(e) => set("thanks_message", e.target.value)}
                />
              </label>
              <div className="reaction-setting">
                <span>リアクション</span>
                <div className="reaction-picker">
                  {REACTIONS.map((r) => {
                    const on = form.reactions.includes(r.key);
                    return (
                      <button
                        type="button"
                        key={r.key}
                        className="btn"
                        aria-label={r.label}
                        title={r.label}
                        aria-pressed={on}
                        disabled={!on && form.reactions.length >= MAX_REACTIONS}
                        onClick={() =>
                          set(
                            "reactions",
                            on
                              ? form.reactions.filter((k) => k !== r.key)
                              : REACTIONS.map((x) => x.key).filter(
                                  (k) =>
                                    k === r.key || form.reactions.includes(k),
                                ),
                          )
                        }
                      >
                        {r.emoji}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label>
                投げ銭リンク
                <input
                  type="url"
                  placeholder="https://ofuse.me/…"
                  value={form.tip_url}
                  onChange={(e) => set("tip_url", e.target.value)}
                />
                <small>
                  埋め込みコードで投げ銭をオンにしたページだけ、お礼の下に表示します。
                </small>
              </label>
            </div>
            <div className="modal-form-footer">
              {!inline && (
                <button type="button" className="btn" onClick={onClose}>
                  閉じる
                </button>
              )}
              <button className="btn primary" disabled={busy}>
                {busy ? "保存中…" : "設定を保存"}
              </button>
            </div>
          </form>
        )}
        {tab === "images" && (
          <div className="images-settings">
            <p className="muted">
              PNG/APNG・JPG・GIF・WebP、各2MB・4096px以下。複数ファイル・フォルダ・zipはドロップで一括追加できます。SVGは受け付けません。画像は訪問者に公開されます。
            </p>
            {(["button", "thanks"] as const).map((kind) => (
              <section key={kind}>
                <h3>
                  {kind === "button" ? "拍手ボタンの画像" : "お礼イラスト"}
                  <small>{kind === "button" ? "1枚" : "最大20枚"}</small>
                </h3>
                <div className="asset-grid">
                  {sortedAssets(kind).map((a) => (
                    <div
                      className={
                        "asset-item" + (dragId === a.id ? " dragging" : "")
                      }
                      key={a.id}
                      draggable={kind === "thanks" && !busy}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(a.id);
                        setOrder(sortedAssets("thanks").map((x) => x.id));
                      }}
                      onDragOver={(e) => {
                        if (!dragId || kind !== "thanks") return;
                        e.preventDefault();
                        if (dragId !== a.id)
                          setOrder((o) => {
                            const ids = (o ?? []).filter((x) => x !== dragId);
                            ids.splice(ids.indexOf(a.id), 0, dragId);
                            return ids;
                          });
                      }}
                      onDrop={(e) => e.preventDefault()}
                      onDragEnd={saveOrder}
                    >
                      <img
                        src={assetUrl(a.id)}
                        alt={kind === "button" ? "ボタン画像" : "お礼画像"}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        disabled={busy}
                        aria-label="画像を削除"
                        onClick={async () => {
                          if (!confirm("この公開画像を削除しますか？")) return;
                          setBusy(true);
                          try {
                            await api("/owner/assets/" + a.id, {
                              method: "DELETE",
                            });
                            assets.refresh();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <label
                    className={
                      "upload-tile" + (dropKind === kind ? " dragging" : "")
                    }
                    onDragOver={(e) => {
                      if (dragId) return;
                      e.preventDefault();
                      setDropKind(kind);
                    }}
                    onDragLeave={() => setDropKind("")}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDropKind("");
                      if (!dragId) upload(e.dataTransfer, kind);
                    }}
                  >
                    <Plus size={22} />
                    <span>{busy ? "追加しています…" : "画像を追加"}</span>
                    <input
                      type="file"
                      accept="image/png,image/apng,image/jpeg,image/gif,image/webp,.zip,application/zip"
                      multiple={kind === "thanks"}
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.files?.length)
                          upload(e.target.files, kind);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </section>
            ))}
          </div>
        )}
        {tab === "embed" && (
          <div className="embed-settings">
            <h3>埋め込みコード</h3>
            <p className="muted">
              どのページにも同じコードを貼ります。押されたページのURLとタイトルが記録されます。
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={embedTip}
                onChange={(e) => setEmbedTip(e.target.checked)}
              />
              このページで投げ銭を表示（data-tip="on"）
            </label>
            {embedTip && (
              <label className="tip-label-field">
                投げ銭の文言
                <input
                  value={embedTipLabel}
                  maxLength={30}
                  placeholder={defaultTipLabel}
                  onChange={(e) => setEmbedTipLabel(e.target.value)}
                />
              </label>
            )}
            <textarea
              aria-label="埋め込みコード"
              readOnly
              value={embed}
              rows={6}
            />
            <div className="button-row">
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await copy(embed);
                    notify("埋め込みコードをコピーしました");
                  } catch {
                    setError(
                      "コピーできませんでした。コードを選択してコピーしてください。",
                    );
                  }
                }}
              >
                <Copy size={15} />
                コードをコピー
              </button>
              <a
                href={widgetUrl}
                className="btn"
                target="_blank"
                rel="noreferrer"
              >
                ウィジェットを開く <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}
      </div>
    </>,
  );
}
function PrintPanel({
  project,
  notify,
}: {
  project: string;
  notify: (s: string) => void;
}) {
  const { data, error } = useApi<{ messages: Message[] }>(
    "/owner/export?format=json" +
      (project ? "&project=" + encodeURIComponent(project) : ""),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [options, setOptions] = useState<PrintOptions>(defaultPrint),
    [busy, setBusy] = useState(false),
    [printError, setPrintError] = useState("");
  const messages = (data?.messages || []).filter((m) => !m.blocked);
  useEffect(() => setSelected(new Set()), [project]);
  const chosen = messages.filter((m) => selected.has(m.id)),
    preview = chosen[0] || messages[0];
  async function create() {
    setBusy(true);
    setPrintError("");
    try {
      const { savePdf } = await import("./pdf");
      await savePdf(chosen, options);
      notify("印刷用PDFを作成しました");
    } catch (e) {
      setPrintError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="print-layout">
      <section className="panel">
        <div className="panel-heading">
          <h2>残したい言葉を選ぶ</h2>
          <span className="muted small-text">{selected.size} 件を選択</span>
        </div>
        <ErrorText>{error}</ErrorText>
        {messages.length ? (
          <>
            <label className="check-label select-all">
              <input
                type="checkbox"
                checked={selected.size === messages.length}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? new Set(messages.map((m) => m.id))
                      : new Set(),
                  )
                }
              />
              すべての感想を選択（{messages.length}件）
            </label>
            <div className="print-message-list">
              {messages.map((m) => (
                <label className="print-message" key={m.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(m.id);
                        else n.delete(m.id);
                        return n;
                      })
                    }
                  />
                  <span>
                    <small>
                      {m.page_title ? m.page_title + " · " : ""}
                      {date(m.created_at)}
                    </small>
                    <p>{m.body}</p>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <Empty title="メッセージはまだありません" icon={Printer} />
        )}
      </section>
      <div className="print-controls">
        <section className="panel">
          <div className="panel-heading">
            <h2>印刷の設定</h2>
            <Printer size={17} />
          </div>
          <div className="print-form">
            <label>
              用紙と面付け
              <select
                value={options.layout}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    layout: e.target.value as PrintOptions["layout"],
                  }))
                }
              >
                <option value="a4">A4・10面（2列×5段）</option>
                <option value="card">カード単体・91×55mm</option>
                <option value="l">L判・89×127mm</option>
              </select>
            </label>
            {options.layout === "a4" && (
              <div className="form-grid">
                {[
                  ["marginX", "左余白"],
                  ["marginY", "上余白"],
                  ["gapX", "横の間隔"],
                  ["gapY", "縦の間隔"],
                  ["offsetX", "横位置の補正"],
                  ["offsetY", "縦位置の補正"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}（mm）
                    <input
                      type="number"
                      step="0.1"
                      min={key.startsWith("offset") ? -10 : 0}
                      value={options[key as keyof PrintOptions] as number}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          [key]:
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={options.cropMarks}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, cropMarks: e.target.checked }))
                }
              />
              裁断線を付ける
            </label>
            <div className="print-card-preview">
              {preview?.page_title && <small>{preview.page_title}</small>}
              <p>{preview?.body || "メッセージ本文"}</p>
              <span>
                {preview ? date(preview.created_at) : "91 × 55 mm"} · 私的保存用
              </span>
            </div>
            <p className="small-text muted">
              日本語フォントを埋め込み、長文はカードに分割します。一部の絵文字は□に置換します。PDFは「実際のサイズ／100%」で印刷してください。
            </p>
            <button
              className="btn primary full-width"
              disabled={busy || !selected.size}
              onClick={create}
            >
              <Download size={15} />
              {busy ? "PDFを作成しています…" : "印刷用PDFをダウンロード"}
            </button>
            <ErrorText>{printError}</ErrorText>
          </div>
        </section>
        <p className="small-text muted print-disclaimer">
          画面のカードはイメージです。
        </p>
      </div>
    </div>
  );
}
const jstInput = (iso: string) =>
  iso ? new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 16) : "";
const fromJstInput = (v: string) =>
  v ? new Date(Date.parse(v + ":00+09:00")).toISOString() : "";
async function readTextFile(file: File) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Older Japanese services often export Shift_JIS.
    return new TextDecoder("shift_jis").decode(bytes);
  }
}
function ImportPanel({
  notify,
  refresh,
}: {
  notify: (s: string) => void;
  refresh: () => void;
}) {
  const projects = useApi<Project[]>("/owner/projects");
  const list = projects.data || [];
  const [text, setText] = useState(""),
    [rows, setRows] = useState<ImportRow[] | null>(null),
    [days, setDays] = useState<ClapDay[] | null>(null),
    [target, setTarget] = useState(""),
    [fallbackDate, setFallbackDate] = useState(""),
    [showAll, setShowAll] = useState(false),
    [skippedOnly, setSkippedOnly] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const projectId = target || list[0]?.id || "";
  const chosen = (rows || []).filter((r) => !r.skip);
  const undated = chosen.some((r) => !r.created_at);
  const ngWords = list.find((p) => p.id === projectId)?.ng_words || [];
  const norm = (v: string) => v.normalize("NFKC").toLowerCase();
  // Spam usually carries links; NG keywords come from the widget settings.
  const unwanted = (r: ImportRow) =>
    /https?:\/\/|www\./i.test(r.body) ||
    ngWords.some(
      (w) => w && norm(r.sender_name + "\n" + r.body).includes(norm(w)),
    );
  const update = (i: number, patch: Partial<ImportRow>) =>
    setRows((r) => r && r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  function read(source: string) {
    setError("");
    if (source.includes(clapDaysMarker)) {
      const parsed = parseClapDays(source);
      if (!parsed.length) setError("拍手数が見つかりません。");
      setDays(parsed.length ? parsed : null);
      return;
    }
    const parsed = /<(table|tr)[\s>]/i.test(source)
      ? parseImportHtml(source)
      : parseImport(source);
    if (!parsed.length) setError("メッセージが見つかりません。");
    setShowAll(false);
    setSkippedOnly(false);
    setRows(
      parsed.length ? parsed.map((r) => ({ ...r, skip: unwanted(r) })) : null,
    );
  }
  async function save() {
    if (!rows) return;
    setBusy(true);
    setError("");
    let added = 0,
      skipped = 0;
    try {
      const items = chosen
        .filter((r) => r.body.trim())
        .map((r) => ({
          created_at: r.created_at || fromJstInput(fallbackDate),
          sender_name: r.sender_name.trim(),
          body: r.body.trim(),
          reply_wanted: r.reply_wanted ?? null,
        }));
      for (let i = 0; i < items.length; i += 40) {
        const r = await send<{ added: number; skipped: number }>(
          "/owner/imports",
          { project_id: projectId, items: items.slice(i, i + 40) },
        );
        added += r.added;
        skipped += r.skipped;
      }
      notify(
        `${added} 件を取り込みました` +
          (skipped ? `（${skipped} 件は取り込み済み）` : ""),
      );
      setRows(null);
      setText("");
      refresh();
    } catch (e) {
      setError(
        (added ? `${added} 件を取り込んだ後に止まりました：` : "") +
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveDays() {
    if (!days) return;
    setBusy(true);
    setError("");
    let saved = 0;
    try {
      for (let i = 0; i < days.length; i += 500) {
        const r = await send<{ saved: number }>("/owner/imports/clap-days", {
          project_id: projectId,
          items: days.slice(i, i + 500),
        });
        saved += r.saved;
      }
      notify(`${saved} 日分の拍手数を取り込みました`);
      setDays(null);
      refresh();
    } catch (e) {
      setError(
        (saved ? `${saved} 日分を取り込んだ後に止まりました：` : "") +
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const dayTotal = (k: "claps" | "visitors") =>
    (days || []).reduce((a, d) => a + d[k], 0);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>過去の拍手・メッセージを取り込む</h2>
        <Upload size={18} />
      </div>
      <div className="data-section import-section">
        {list.length > 1 && (
          <div className="select-wrap">
            <select
              aria-label="取り込み先のサイト"
              value={projectId}
              onChange={(e) => setTarget(e.target.value)}
            >
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        )}
        {days ? (
          <>
            <dl className="import-summary">
              <div>
                <dt>期間</dt>
                <dd>
                  {days[days.length - 1].day.replaceAll("-", "/")} –{" "}
                  {days[0].day.replaceAll("-", "/")}
                </dd>
              </div>
              <div>
                <dt>日数</dt>
                <dd>{days.length}</dd>
              </div>
              <div>
                <dt>拍手</dt>
                <dd>{dayTotal("claps")}</dd>
              </div>
              <div>
                <dt>人数（日ごとの合計）</dt>
                <dd>{dayTotal("visitors")}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button
                className="btn primary"
                disabled={busy || !projectId}
                onClick={saveDays}
              >
                {busy ? "取り込み中…" : `${days.length} 日分を取り込む`}
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => setDays(null)}
              >
                戻る
              </button>
            </div>
          </>
        ) : !rows ? (
          <>
            <textarea
              aria-label="取り込むメッセージ"
              rows={8}
              placeholder={"2015/03/02 12:34\n名前：\nメッセージ"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                // A page copied from a browser carries its table as HTML.
                const html = e.clipboardData.getData("text/html");
                if (!html || !parseImportHtml(html).length) return;
                e.preventDefault();
                read(html);
              }}
            />
            <div className="button-row">
              <button
                className="btn primary"
                disabled={!text.trim()}
                onClick={() => read(text)}
              >
                読み込む
              </button>
              <label className="btn">
                <FileText size={15} />
                ファイルから読み込む
                <input
                  type="file"
                  hidden
                  aria-label="取り込むファイル"
                  accept=".txt,.csv,.tsv,.html,.htm,text/plain,text/csv,text/html"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) read(await readTextFile(f));
                  }}
                />
              </label>
            </div>
            <details className="restore-settings">
              <summary>web拍手から一括取得</summary>
              <div className="button-row">
                <button
                  className="btn"
                  onClick={async () => {
                    try {
                      await copy(webclapScript);
                      notify("スクリプトをコピーしました");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Copy size={15} />
                  取得用スクリプトをコピー
                </button>
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="inbox-tabs">
              <button
                className={!skippedOnly ? "active" : ""}
                onClick={() => setSkippedOnly(false)}
              >
                すべて（{rows.length}）
              </button>
              <button
                className={skippedOnly ? "active" : ""}
                onClick={() => setSkippedOnly(true)}
              >
                除外（{rows.length - chosen.length}）
              </button>
            </div>
            <div className="import-rows">
              {(() => {
                const shown = rows
                  .map((r, i) => [r, i] as const)
                  .filter(([r]) => !skippedOnly || r.skip);
                return (showAll ? shown : shown.slice(0, 200)).map(([r, i]) => (
                  <div
                    className={"import-row" + (r.skip ? " skipped" : "")}
                    key={i}
                  >
                    <div className="import-row-meta">
                      <input
                        type="checkbox"
                        aria-label="取り込む"
                        checked={!r.skip}
                        onChange={(e) => update(i, { skip: !e.target.checked })}
                      />
                      <input
                        type="datetime-local"
                        aria-label="日時"
                        value={jstInput(r.created_at)}
                        onChange={(e) =>
                          update(i, {
                            created_at: fromJstInput(e.target.value),
                          })
                        }
                      />
                      <input
                        aria-label="名前"
                        placeholder="名前"
                        maxLength={50}
                        value={r.sender_name}
                        onChange={(e) =>
                          update(i, { sender_name: e.target.value })
                        }
                      />
                    </div>
                    <textarea
                      aria-label="メッセージ"
                      rows={2}
                      maxLength={2000}
                      value={r.body}
                      onChange={(e) => update(i, { body: e.target.value })}
                    />
                  </div>
                ));
              })()}
              {!showAll && rows.length > 200 && (
                <button
                  className="text-button import-more"
                  onClick={() => setShowAll(true)}
                >
                  すべて表示（{rows.length} 件）
                </button>
              )}
            </div>
            {undated && (
              <label className="import-fallback">
                日時のないメッセージの日時
                <input
                  type="datetime-local"
                  value={fallbackDate}
                  onChange={(e) => setFallbackDate(e.target.value)}
                />
              </label>
            )}
            <div className="button-row">
              <button
                className="btn primary"
                disabled={
                  busy ||
                  !projectId ||
                  !chosen.length ||
                  (undated && !fallbackDate)
                }
                onClick={save}
              >
                {busy ? "取り込み中…" : `${chosen.length} 件を取り込む`}
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => setRows(null)}
              >
                戻る
              </button>
            </div>
          </>
        )}
        <ErrorText>{error || projects.error}</ErrorText>
      </div>
    </section>
  );
}
type ClapRecord = {
  id: string;
  created_at: string;
  page_url: string;
  page_title: string;
  mine: boolean;
};
function ClapRecords({
  notify,
  refresh,
}: {
  notify: (s: string) => void;
  refresh: () => void;
}) {
  const [day, setDay] = useState(() =>
    new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useApi<{ items: ClapRecord[] }>(
    "/owner/claps?day=" + encodeURIComponent(day),
  );
  const items = list.data?.items || [];
  useEffect(() => {
    setChecked(new Set(items.filter((x) => x.mine).map((x) => x.id)));
  }, [list.data]);
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  };
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>拍手の記録</h2>
        <input
          type="date"
          className="hour-date"
          aria-label="拍手の記録の日付"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
        />
      </div>
      <div className="data-section">
        <ErrorText>{list.error || error}</ErrorText>
        {list.loading ? (
          <div className="chart-loading">読み込んでいます…</div>
        ) : !items.length ? (
          <p>この日の拍手はありません。</p>
        ) : (
          <>
            <ul className="clap-records">
              {items.map((x) => (
                <li key={x.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked.has(x.id)}
                      onChange={() => toggle(x.id)}
                    />
                    <span className="clap-time">
                      {dateTime(x.created_at).slice(-5)}
                    </span>
                    <span className="clap-page">
                      {x.page_title || x.page_url || "ページ不明"}
                    </span>
                    {x.mine && <span className="clap-mine">自分の回線</span>}
                  </label>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <button
                className="btn"
                disabled={busy || !checked.size}
                onClick={async () => {
                  if (
                    !confirm(
                      `${checked.size} 件の拍手を削除します。元に戻せません。`,
                    )
                  )
                    return;
                  setBusy(true);
                  setError("");
                  try {
                    const r = await send<{ deleted: number }>(
                      "/owner/claps/delete",
                      { ids: [...checked] },
                    );
                    notify(`${r.deleted} 件の拍手を削除しました`);
                    list.refresh();
                    refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={14} />
                選択した拍手を削除（{checked.size}）
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
function DataPanel({
  notify,
  refresh,
}: {
  notify: (s: string) => void;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [file, setFile] = useState<File | null>(null);
  const backupStatus = useApi<{
    backups: {
      id: string;
      created_at: string;
      asset_count: number;
      kind: "daily" | "monthly";
    }[];
  }>("/owner/backups");
  const backups = backupStatus.data?.backups || [];
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (previewMode)
    return (
      <div className="data-layout">
        <ImportPanel notify={notify} refresh={refresh} />
        <ClapRecords notify={notify} refresh={refresh} />
        <section className="panel">
          <div className="panel-heading">
            <h2>体験版のデータ</h2>
            <Database size={18} />
          </div>
          <div className="data-section">
            <p>
              このブラウザ内の体験データです。サーバーへの保存・自動バックアップはありません。
            </p>
            <div className="button-row">
              <button
                className="btn"
                onClick={() =>
                  action(async () => {
                    await downloadEndpoint(
                      "/owner/export?format=csv",
                      "体験した感想.csv",
                    );
                    notify("体験データを書き出しました");
                  })
                }
              >
                CSVをダウンロード
              </button>
              <button
                className="btn"
                onClick={() =>
                  action(async () => {
                    await downloadEndpoint(
                      "/owner/export?format=json",
                      "体験した感想.json",
                    );
                    notify("体験データを書き出しました");
                  })
                }
              >
                JSONをダウンロード
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "このブラウザ内の体験データを初期状態に戻しますか？",
                    )
                  )
                    action(async () => {
                      await send("/owner/purge", {});
                      notify("体験データを初期化しました");
                      refresh();
                    });
                }}
              >
                体験データを初期化
              </button>
            </div>
            <ErrorText>{error}</ErrorText>
          </div>
        </section>
      </div>
    );
  return (
    <div className="data-layout">
      <ErrorText>{error}</ErrorText>
      <ImportPanel notify={notify} refresh={refresh} />
      <ClapRecords notify={notify} refresh={refresh} />
      <section className="panel">
        <div className="panel-heading">
          <h2>メッセージの書き出し</h2>
          <ArrowDownToLine size={18} />
        </div>
        <div className="data-section">
          <div className="button-row">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await downloadEndpoint(
                    "/owner/export?format=csv",
                    "感想.csv",
                  );
                  notify("CSVを書き出しました");
                })
              }
            >
              <Download size={15} />
              CSVをダウンロード
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await downloadEndpoint(
                    "/owner/export?format=json",
                    "感想.json",
                  );
                  notify("JSONを書き出しました");
                })
              }
            >
              <Download size={15} />
              JSONをダウンロード
            </button>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>バックアップと復元</h2>
          <Database size={18} />
        </div>
        <div className="data-section">
          <p>
            作品設定・拍手・感想・返信・画像をまとめて保存します。非公開情報を含むため、安全な場所に保管してください。
          </p>
          <div className="backup-status">
            <ShieldCheck size={19} />
            <span>
              自動バックアップ：毎日 03:00 JST・毎日分30日・毎月分12か月保持
              <small>
                {backups[0]
                  ? "直近の成功：" + dateTime(backups[0].created_at)
                  : "この環境では成功記録がまだありません。ローカルでは自動実行されません。"}
              </small>
            </span>
          </div>
          {backups.length > 0 && (
            <details className="restore-settings cloud-backups">
              <summary>クラウドのバックアップ（{backups.length}件）</summary>
              <ul>
                {backups.map((b) => (
                  <li key={b.id}>
                    <time>{dateTime(b.created_at)}</time>
                    <span>{b.kind === "monthly" ? "毎月" : "毎日"}</span>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          await downloadEndpoint(
                            "/owner/backups/" + b.id,
                            "hakushu_backup_" +
                              b.created_at.slice(0, 10) +
                              ".json",
                          );
                        })
                      }
                    >
                      <Download size={15} />
                      DL
                    </button>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        const input = window.prompt(
                          dateTime(b.created_at) +
                            " の内容で現在の作品・拍手・感想・返信・画像を置き換えます。「復元する」と入力してください。",
                        );
                        if (input !== "復元する") return;
                        action(async () => {
                          await send("/owner/backups/" + b.id + "/restore", {
                            confirmation: input,
                          });
                          notify("バックアップから復元しました");
                          refresh();
                          backupStatus.refresh();
                        });
                      }}
                    >
                      復元
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="button-row">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await downloadEndpoint(
                    "/owner/backup",
                    "hakushu_backup.json",
                  );
                  notify("完全バックアップを書き出しました");
                })
              }
            >
              <Download size={15} />
              完全バックアップをDL
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await send("/owner/backup-now", {});
                  backupStatus.refresh();
                  notify("非公開ストレージへバックアップしました");
                })
              }
            >
              今すぐバックアップ
            </button>
          </div>
          <details className="restore-settings">
            <summary>バックアップから復元</summary>
            <p>
              現在の作品・拍手・感想・返信・画像を置き換えます。先に完全バックアップをダウンロードしてください。復元後は公開画像も置き換わります。
            </p>
            <input
              aria-label="復元するバックアップファイル"
              type="file"
              accept=".json,application/json"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <label>
              確認のため「復元する」と入力
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <button
              className="btn"
              disabled={busy || !file || confirmation !== "復元する"}
              onClick={() =>
                action(async () => {
                  if (!file) return;
                  if (file.size > 50 * 1024 * 1024)
                    throw new Error("バックアップは50MB以下にしてください。");
                  await send("/owner/restore", {
                    confirmation,
                    backup: JSON.parse(await file.text()),
                  });
                  notify("バックアップから復元しました");
                  refresh();
                  backupStatus.refresh();
                  setConfirmation("");
                  setFile(null);
                })
              }
            >
              現在のデータを置き換えて復元
            </button>
          </details>
        </div>
      </section>
      <section className="panel danger-panel">
        <div className="panel-heading">
          <h2>データの削除</h2>
          <Trash2 size={18} />
        </div>
        <div className="data-section">
          <p>
            感想の全件削除は返信も削除し、返信URLを無効にします。バックアップには最長12か月残ります。全データ削除は画像・バックアップも削除します。
          </p>
          <div className="button-row">
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                const input = prompt(
                  "「感想を全件削除」と入力すると、すべての感想と返信を削除します。",
                );
                if (input === "感想を全件削除")
                  action(async () => {
                    await send("/owner/delete-messages", {
                      confirmation: input,
                    });
                    notify("感想と返信を全件削除しました");
                    refresh();
                  });
              }}
            >
              感想を全件削除
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => {
                const input = prompt(
                  "「バックアップを含む全データを削除」と入力すると、作品・画像・メッセージ・バックアップをすべて削除します。元に戻せません。",
                );
                if (input === "バックアップを含む全データを削除")
                  action(async () => {
                    await send("/owner/purge", { confirmation: input });
                    notify("全データを削除しました");
                    refresh();
                    backupStatus.refresh();
                  });
              }}
            >
              バックアップを含む全データを削除
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
const sizeKey = "hakushu_stats_print";
function loadSizes(): Partial<Record<PlannerId, PaperSize>> {
  try {
    return JSON.parse(localStorage.getItem(sizeKey) || "{}");
  } catch {
    return {};
  }
}
function StatsPrintModal({
  stats,
  hours,
  pageTitle,
  notify,
  onClose,
}: {
  stats: Stats;
  hours: HourStats | null;
  pageTitle: string;
  notify: (s: string) => void;
  onClose: () => void;
}) {
  const [planner, setPlanner] = useState<PlannerId>(planners[0].id),
    [sizes, setSizes] = useState(loadSizes),
    [a4, setA4] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const preset = planners.find((p) => p.id === planner)!,
    size: PaperSize = sizes[planner] || {
      w: preset.w,
      h: preset.h,
      bind: preset.bind,
    };
  function setSize(key: "w" | "h", value: number) {
    const next = { ...sizes, [planner]: { ...size, [key]: value } };
    setSizes(next);
    try {
      localStorage.setItem(sizeKey, JSON.stringify(next));
    } catch {}
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const { saveStatsPdf } = await import("./stats-pdf");
      await saveStatsPdf({ stats, hours, pageTitle, planner, size, a4 });
      notify("印刷用PDFを作成しました");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="統計を印刷" onClose={onClose}>
      <div className="modal-body print-form">
        <label>
          手帳
          <select
            value={planner}
            onChange={(e) => setPlanner(e.target.value as PlannerId)}
          >
            {planners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.group} {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          {(
            [
              ["w", "幅"],
              ["h", "高さ"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}（mm）
              <input
                type="number"
                step="0.5"
                min={15}
                value={Number.isFinite(size[key]) ? size[key] : ""}
                onChange={(e) =>
                  setSize(
                    key,
                    e.target.value === "" ? NaN : Number(e.target.value),
                  )
                }
              />
            </label>
          ))}
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={a4}
            onChange={(e) => setA4(e.target.checked)}
          />
          A4に並べて裁断線を付ける
        </label>
        <p className="small-text muted">
          PDFは「実際のサイズ／100%」で印刷してください。
        </p>
        <button
          className="btn primary full-width"
          disabled={busy}
          onClick={create}
        >
          <Download size={15} />
          {busy ? "PDFを作成しています…" : "印刷用PDFをダウンロード"}
        </button>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
async function hasNewVersion() {
  const current = document
    .querySelector<HTMLScriptElement>("script[type=module][src]")
    ?.getAttribute("src");
  if (!current) return false;
  try {
    const res = await fetch(location.pathname, { cache: "no-store" });
    if (!res.ok) return false;
    const html = await res.text();
    const latest = html.match(
      /<script[^>]*type="module"[^>]*src="([^"]+)"/,
    )?.[1];
    return !!latest && latest !== current;
  } catch {
    // An expired login redirects to Cloudflare Access; the data refresh handles that.
    return false;
  }
}
