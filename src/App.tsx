import { embedCode } from "./embed-code";
import { cleanTipLabel, defaultTipLabel } from "./page-context";
import { previewMode } from "./mode";
import { assetUrl } from "./asset-url";
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
  X,
} from "lucide-react";
import { api, date, dateTime, downloadEndpoint, send, useApi } from "./api";
import { defaultPrint, type PrintOptions } from "./print-options";
import { collectImages } from "./image-files";
import type { Asset, HourStats, Message, Project, Stats } from "./types";
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
// Clicking a page narrows the dashboard to it; clicking it again shows all pages.
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
              <button
                type="button"
                className="page-filter"
                aria-pressed={p.page_url === selected}
                onClick={() =>
                  onSelect(p.page_url === selected ? "" : p.page_url)
                }
              >
                {p.page_title || p.page_url}
              </button>
              <a
                href={p.page_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={(p.page_title || p.page_url) + "を開く"}
              >
                <ExternalLink size={13} />
              </a>
            </>
          ) : (
            <span className="muted">ページ不明</span>
          )}
          <b>{p.count.toLocaleString()}</b>
        </li>
      ))}
    </ol>
  );
}
function Chart({
  stats,
  selected,
  onSelect,
}: {
  stats: Stats | null;
  selected: string;
  onSelect: (day: string) => void;
}) {
  if (!stats)
    return <div className="chart-loading">集計を読み込んでいます…</div>;
  const days: {
    day: string;
    claps: number;
    messages: number;
    visitors: number;
  }[] = [];
  let start = new Date(stats.from + "T00:00:00Z");
  let end = new Date(stats.to + "T00:00:00Z");
  while (start <= end && days.length < 366) {
    const day = start.toISOString().slice(0, 10);
    days.push({
      day,
      claps: stats.claps.find((x) => x.day === day)?.count || 0,
      messages: stats.messages.find((x) => x.day === day)?.count || 0,
      visitors: stats.visitors?.find((x) => x.day === day)?.count || 0,
    });
    start = new Date(start.getTime() + 86400000);
  }
  // An even maximum keeps the middle grid label distinct from the top one.
  let max = Math.max(2, ...days.map((d) => d.claps + d.messages));
  if (max % 2) max++;
  return (
    <div className="activity-chart">
      <div className="chart-grid">
        <span>{max}</span>
        <span>{max / 2}</span>
        <span>0</span>
      </div>
      <div className="chart-bars">
        {days.map((d) => (
          <button
            type="button"
            className={"chart-column " + (d.day === selected ? "active" : "")}
            key={d.day}
            title={`${d.day} 人数 ${d.visitors}・拍手 ${d.claps}・感想 ${d.messages}`}
            aria-label={`${d.day} 拍手 ${d.claps} 件`}
            onClick={() => onSelect(d.day)}
          >
            <div className="chart-stack">
              <div
                className="bar-message"
                style={{ height: `${(d.messages / max) * 115}px` }}
              />
              <div
                className="bar-clap"
                style={{ height: `${(d.claps / max) * 115}px` }}
              />
            </div>
          </button>
        ))}
      </div>
      <div className="chart-axis">
        <span>{stats.from.replaceAll("-", " / ")}</span>
        <span>{stats.to.replaceAll("-", " / ")}</span>
      </div>
    </div>
  );
}
function HourTable({ data }: { data: HourStats | null }) {
  if (!data)
    return <div className="chart-loading">集計を読み込んでいます…</div>;
  const max = Math.max(1, ...data.hours.map((h) => h.claps));
  const sum = (k: "claps" | "visitors" | "messages") =>
    data.hours.reduce((a, h) => a + h[k], 0);
  const half = (rows: HourStats["hours"]) => (
    <table className="hour-table">
      <thead>
        <tr>
          <th>時</th>
          <th>人数</th>
          <th>拍手</th>
          <th>感想</th>
          <th aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.hour} className={h.claps ? "" : "zero"}>
            <td>{h.hour}</td>
            <td>{h.visitors}</td>
            <td>{h.claps}</td>
            <td>{h.messages}</td>
            <td className="hour-bar-cell">
              <span
                className="hour-bar"
                style={{ width: `${(h.claps / max) * 100}%` }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      <div className="hour-tables">
        {half(data.hours.slice(0, 12))}
        {half(data.hours.slice(12))}
      </div>
      <div className="hour-total">
        <span>
          人数 <b>{sum("visitors")}</b>
        </span>
        <span>
          拍手 <b>{sum("claps")}</b>
        </span>
        <span>
          感想 <b>{sum("messages")}</b>
        </span>
      </div>
    </>
  );
}
export default function App() {
  const session = useApi<{
    role: string;
    local: boolean;
    tip_links_enabled: boolean;
  }>("/owner/session");
  const [section, setSection] = useState<Section>(() =>
    ["overview", "inbox", "projects", "print", "data"].includes(
      location.hash.slice(1),
    )
      ? (location.hash.slice(1) as Section)
      : "overview",
  );
  const [from, setFrom] = useState(jstToday(29)),
    [to, setTo] = useState(jstToday()),
    [day, setDay] = useState(jstToday()),
    [pageUrl, setPageUrl] = useState("");
  const [project, setProject] = useState(""),
    [toast, setToast] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [version, setVersion] = useState(0);
  const projects = useApi<Project[]>("/owner/projects?v=" + version),
    stats = useApi<Stats>(
      "/owner/stats?" +
        new URLSearchParams({
          ...(pageUrl ? { page: pageUrl } : {}),
          v: String(version),
          from,
          to,
        }),
    ),
    hours = useApi<HourStats>(
      "/owner/stats/hours?" +
        new URLSearchParams({
          ...(pageUrl ? { page: pageUrl } : {}),
          v: String(version),
          day,
        }),
    );
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
  function notify(s: string) {
    setToast(s);
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = () => {
      const s = location.hash.slice(1) as Section;
      if (s in titles) setSection(s);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const countClaps = list.reduce((a, p) => a + p.claps, 0),
    total = stats.data?.totals;
  if (session.loading)
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
        <div className="workspace">
          <span className="avatar">K</span>
          <span>
            マイワークスペース<small>Owner · すべての機能</small>
          </span>
          <LockKeyhole size={14} />
        </div>
        <div className="nav-caption">ワークスペース</div>
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
          <div className="owner-profile">
            <span className="avatar small">K</span>
            <div>
              Owner<small>永久無料</small>
            </div>
            <span className="tiny-dot" />
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-toggle icon-button"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="メニュー"
            >
              <MoreHorizontal />
            </button>
            <span>ワークスペース</span>
            <ChevronRight size={14} />
            <b>{titles[section]}</b>
          </div>
          <div className="topbar-right">
            <span className="private-badge">
              <LockKeyhole size={12} />
              非公開
            </span>
            <span className="avatar small">K</span>
          </div>
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
          {section === "overview" && (
            <div className="scope-bar date-bar">
              <div className="date-range">
                <input
                  type="date"
                  aria-label="集計の開始日"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <span>–</span>
                <input
                  type="date"
                  aria-label="集計の終了日"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <button
                className="icon-button"
                onClick={refresh}
                aria-label="集計を更新"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          )}
          <ErrorText>{projects.error || stats.error}</ErrorText>
          {section === "overview" && (
            <>
              <div className="stat-grid">
                <StatCard
                  label="受け取った拍手"
                  value={countClaps}
                  icon={ThumbsUp}
                  note="累計"
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
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <h2>日別の拍手</h2>
                      <span className="muted small-text">日本時間</span>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i className="legend-clap" />
                        拍手
                      </span>
                      <span>
                        <i className="legend-message" />
                        感想
                      </span>
                    </div>
                    <Chart
                      stats={stats.data}
                      selected={day}
                      onSelect={setDay}
                    />
                  </section>
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <h2>時間別</h2>
                      <input
                        type="date"
                        className="hour-date"
                        aria-label="時間別の日付"
                        value={day}
                        onChange={(e) =>
                          e.target.value && setDay(e.target.value)
                        }
                      />
                    </div>
                    <ErrorText>{hours.error}</ErrorText>
                    <HourTable data={hours.data} />
                  </section>
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <h2>ページ別の拍手</h2>
                    </div>
                    <PageStats
                      stats={stats.data}
                      selected={pageUrl}
                      onSelect={setPageUrl}
                    />
                  </section>
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
                  tipEnabled={!!session.data?.tip_links_enabled}
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
              {list.map((p, i) => (
                <article className="panel project-card" key={p.id}>
                  <div className="project-card-top">
                    <span className="project-symbol">
                      {String(i + 1).padStart(2, "0")}
                    </span>
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
          <footer className="page-footer">
            <span>Hakushu</span>
            <span>
              Owner · 非公開{session.data?.local ? " · ローカル開発環境" : ""}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
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
                  "この感想と返信を削除します。返信URLも無効になります。バックアップには最長7日残る場合があります。",
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
  tip_enabled: false,
  thanks_order: "random" as "random" | "sequential" | "fixed",
  thanks_message: "",
  tip_url: "",
  tip_legal_checked: false,
  tip_terms_checked: false,
  tip_privacy_checked: false,
  ng_words: [] as string[],
};
// Accepts full page URLs too; only the origin is allowed to embed.
function toOrigin(line: string) {
  const s = line.trim();
  try {
    return s ? new URL(s).origin : "";
  } catch {
    return s;
  }
}
function presetOf(f: {
  clap_enabled: unknown;
  message_enabled: unknown;
  tip_enabled: unknown;
}) {
  const clap = !!f.clap_enabled,
    message = !!f.message_enabled,
    tip = !!f.tip_enabled;
  if (clap && message && !tip) return "message";
  if (clap && !message) return tip ? "clap-tip" : "clap";
  if (!clap && !message && tip) return "tip";
  return "";
}
function ProjectModal({
  project,
  tipEnabled,
  onClose,
  notify,
  inline = false,
}: {
  project: Project | "new";
  tipEnabled: boolean;
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
          tip_enabled: !!project.tip_enabled,
          thanks_order: project.thanks_order,
          thanks_message: project.thanks_message || "",
          tip_url: project.tip_url || "",
          tip_legal_checked: !!project.tip_legal_checked,
          tip_terms_checked: !!project.tip_terms_checked,
          tip_privacy_checked: !!project.tip_privacy_checked,
          ng_words: project.ng_words || [],
        };
  const [form, setForm] = useState(initial),
    [origins, setOrigins] = useState(initial.allowed_origins.join("\n")),
    [ngWords, setNgWords] = useState(initial.ng_words.join("\n")),
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
          allowed_origins: [
            ...new Set(origins.split("\n").map(toOrigin).filter(Boolean)),
          ],
          ng_words: [
            ...new Set(
              ngWords
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
          await api("/owner/projects/" + project.id + "/assets?kind=" + kind, {
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
              埋め込みを許可するサイト
              <textarea
                rows={3}
                placeholder={"https://example.com\nhttps://www.example.com"}
                value={origins}
                onChange={(e) => setOrigins(e.target.value)}
              />
              <small>1行に1サイト。</small>
            </label>
            <label>
              NGキーワード
              <textarea
                rows={3}
                value={ngWords}
                onChange={(e) => setNgWords(e.target.value)}
              />
              <small>1行に1語。含む感想は「非表示」に入ります。</small>
            </label>
            <div className="setting-section">
              <h3>ウィジェットの機能</h3>
              <div className="widget-presets">
                {[
                  ["clap", "拍手のみ"],
                  ["message", "拍手＋感想"],
                  ["clap-tip", "拍手＋投げ銭"],
                  ["tip", "投げ銭のみ"],
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
                        clap_enabled: key !== "tip",
                        message_enabled: key === "message",
                        favorite_enabled: key === "message",
                        reply_enabled: key === "message",
                        thanks_enabled: key !== "tip",
                        tip_enabled: key === "clap-tip" || key === "tip",
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="small-text muted">
                投げ銭は接続・確認が完了するまで公開されません。
              </p>
              {[
                ["clap_enabled", "拍手を受け付ける"],
                ["message_enabled", "非公開の感想を受け付ける"],
                ["favorite_enabled", "ブラウザのお気に入りを表示"],
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
            </div>
            <details className="tip-settings">
              <summary>外部の支援リンク</summary>
              <p>
                適法性・決済事業者の規約・個人情報の表示を確認した外部リンクのみ設定できます。現在のサーバー設定：
                {tipEnabled ? "有効化可能" : "非表示"}
                。PayPayへの対応は未確認です。
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.tip_enabled}
                  onChange={(e) => set("tip_enabled", e.target.checked)}
                />
                確認済みの外部支援リンクを表示する（初期OFF）
              </label>
              <label>
                確認済み外部決済ページ
                <input
                  type="url"
                  value={form.tip_url}
                  onChange={(e) => set("tip_url", e.target.value)}
                />
              </label>
              {[
                ["tip_legal_checked", "適法性・法定表示・税務を確認した"],
                [
                  "tip_terms_checked",
                  "決済事業者がこの用途を許可していることを確認した",
                ],
                [
                  "tip_privacy_checked",
                  "決済画面・明細・領収書の個人情報表示を確認した",
                ],
              ].map(([key, label]) => (
                <label className="check-label" key={key}>
                  <input
                    type="checkbox"
                    checked={!!form[key as keyof typeof form]}
                    onChange={(e) =>
                      set(key as keyof typeof form, e.target.checked)
                    }
                  />
                  {label}
                </label>
              ))}
            </details>
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
              どのページにも同じコードを貼ります。押されたページのURLとタイトルが記録されます。設置先のオリジンは基本設定で許可してください。
            </p>
            {!origins.trim() && (
              <ErrorText>
                埋め込みを許可するサイトが未設定のため、設置してもボタンは表示されません。
              </ErrorText>
            )}
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
                      {m.page_title || m.project_title} · {date(m.created_at)}
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
              <small>
                {preview?.page_title || preview?.project_title || "ページ名"}
              </small>
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
    latest: { created_at: string; asset_count: number } | null;
  }>("/owner/backup-status");
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
                  confirm("このブラウザ内の体験データを初期状態に戻しますか？")
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
    );
  return (
    <div className="data-layout">
      <ErrorText>{error}</ErrorText>
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
              自動バックアップ：毎日 03:00 JST・7日間保持
              <small>
                {backupStatus.data?.latest
                  ? "直近の成功：" +
                    dateTime(backupStatus.data.latest.created_at)
                  : "この環境では成功記録がまだありません。ローカルでは自動実行されません。"}
              </small>
            </span>
          </div>
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
            感想の全件削除は返信も削除し、返信URLを無効にします。バックアップには最長7日残ります。全データ削除は画像・バックアップも削除します。
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
