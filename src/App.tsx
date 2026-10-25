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
import type { Asset, Message, Project, Stats } from "./types";
type Section = "overview" | "inbox" | "projects" | "print" | "data";
const titles: Record<Section, string> = {
  overview: "ダッシュボード",
  inbox: "届いた感想",
  projects: "作品・ツール",
  print: "手帳に残す",
  data: "データ管理",
};
const navs: [Section, typeof Inbox, string][] = [
  ["overview", LayoutDashboard, "ダッシュボード"],
  ["inbox", Inbox, "届いた感想"],
  ["projects", FolderHeart, "作品・ツール"],
  ["print", Printer, "手帳に残す"],
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
  note: string;
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
      <span className="stat-note">{note}</span>
    </div>
  );
}
function Chart({ stats }: { stats: Stats | null }) {
  if (!stats)
    return <div className="chart-loading">集計を読み込んでいます…</div>;
  const days: { day: string; claps: number; messages: number }[] = [];
  let start = new Date(stats.from + "T00:00:00Z");
  let end = new Date(stats.to + "T00:00:00Z");
  while (start <= end && days.length < 366) {
    const day = start.toISOString().slice(0, 10);
    days.push({
      day,
      claps: stats.claps.find((x) => x.day === day)?.count || 0,
      messages: stats.messages.find((x) => x.day === day)?.count || 0,
    });
    start = new Date(start.getTime() + 86400000);
  }
  const max = Math.max(1, ...days.map((d) => d.claps + d.messages));
  return (
    <div className="activity-chart">
      <div className="chart-grid">
        <span>{max}</span>
        <span>{Math.ceil(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="chart-bars">
        {days.map((d) => (
          <div
            className="chart-column"
            key={d.day}
            title={`${d.day} 拍手 ${d.claps}・感想 ${d.messages}`}
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
          </div>
        ))}
      </div>
      <div className="chart-axis">
        <span>{stats.from.replaceAll("-", " / ")}</span>
        <span>{stats.to.replaceAll("-", " / ")}</span>
      </div>
    </div>
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
  const [from, setFrom] = useState(
      new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [project, setProject] = useState(""),
    [toast, setToast] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [version, setVersion] = useState(0);
  const projects = useApi<Project[]>("/owner/projects?v=" + version),
    stats = useApi<Stats>(
      "/owner/stats?" +
        new URLSearchParams({
          ...(project ? { project } : {}),
          v: String(version),
          from,
          to,
        }),
    );
  const [selected, setSelected] = useState<Message | null>(null),
    [edit, setEdit] = useState<Project | "new" | null>(null);
  function navigate(next: Section) {
    setSection(next);
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
  const list = projects.data || [];
  const filtered = list.filter((p) => !project || p.id === project),
    countClaps = filtered.reduce((a, p) => a + p.claps, 0),
    total = stats.data?.totals;
  if (session.loading)
    return (
      <div className="auth-page">
        <span className="brand-mark">
          <Heart size={24} />
        </span>
        <p>応援の便りを開いています…</p>
      </div>
    );
  if (session.error)
    return (
      <div className="auth-page">
        <LockKeyhole size={32} />
        <h1>Ownerのための場所です。</h1>
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
          <span className="brand-mark">
            <Heart size={22} strokeWidth={1.5} />
          </span>
          <span>応援の便り</span>
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
          <div className="private-note">
            <ShieldCheck size={17} />
            <span>
              あなたと、送り主だけの場所。<small>感想は公開されません。</small>
            </span>
          </div>
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
              <p>
                {section === "overview"
                  ? "届いた応援を、今日の制作の力に。"
                  : section === "inbox"
                    ? "ひとつひとつの言葉を、ゆっくりと。"
                    : section === "projects"
                      ? "それぞれの場所に、小さな応援の入口を。"
                      : section === "print"
                        ? "大切な言葉を、手にとれるかたちに。"
                        : "受け取った便りを、大切に保管する。"}
              </p>
            </div>
            {section === "projects" ? (
              <button className="btn primary" onClick={() => setEdit("new")}>
                <Plus size={16} />
                作品を追加
              </button>
            ) : section === "overview" ? (
              <button className="btn" onClick={() => navigate("projects")}>
                <Settings2 size={15} />
                ウィジェットを設定
              </button>
            ) : null}
          </div>
          {(section === "overview" ||
            section === "inbox" ||
            section === "print") && (
            <div className="scope-bar">
              <span className="scope-label">作品・ツール</span>
              <div className="select-wrap">
                <select
                  aria-label="作品で絞り込む"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">すべての作品・ツール</option>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>
              {section === "overview" && (
                <>
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
                  <span className="scope-meta">{list.length} 件の設置先</span>
                </>
              )}
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
                  note="これまでに届いた応援"
                />
                <StatCard
                  label="届いた感想"
                  value={total?.total || 0}
                  icon={MessageCircle}
                  note={`${total?.unread || 0} 件の未読の便り`}
                />
                <StatCard
                  label="返信を待つ便り"
                  value={total?.unreplied || 0}
                  icon={Reply}
                  note="あなたのペースで大丈夫です"
                />
              </div>
              <div className="dashboard-columns">
                <div className="dashboard-main">
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <h2>応援のあしあと</h2>
                      <span className="muted small-text">日別集計 · UTC</span>
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
                    <Chart stats={stats.data} />
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
                      project={project}
                      version={version}
                      compact
                      onSelect={setSelected}
                    />
                  </section>
                  <div className="quiet-note">
                    <LockKeyhole size={15} />
                    <p>
                      届いた言葉は、あなただけのもの。
                      <br />
                      <span>個人的な保存や印刷で、いつでも読み返せます。</span>
                    </p>
                  </div>
                </div>
                <div className="dashboard-side">
                  <section className="panel widget-preview-panel">
                    <div className="panel-heading">
                      <h2>応援の入口</h2>
                      <span className="status-dot">プレビュー</span>
                    </div>
                    {list.length ? (
                      <>
                        <div className="mini-site">
                          <span className="mini-site-icon">
                            <FolderHeart size={18} />
                          </span>
                          <span>
                            {
                              (list.find((p) => p.id === project) || list[0])
                                .title
                            }
                            <small>訪問者に表示されるウィジェット</small>
                          </span>
                        </div>
                        <iframe
                          title="ウィジェットのプレビュー"
                          className="preview-frame"
                          src={
                            "/widget/" +
                            (list.find((p) => p.id === project) || list[0]).slug
                          }
                        />
                        <div className="preview-actions">
                          <a
                            href={
                              "/widget/" +
                              (list.find((p) => p.id === project) || list[0])
                                .slug
                            }
                            className="text-button"
                            target="_blank"
                            rel="noreferrer"
                          >
                            別のタブで試す <ExternalLink size={13} />
                          </a>
                          <button className="text-button" onClick={refresh}>
                            <RefreshCw size={13} />
                            集計を更新
                          </button>
                        </div>
                      </>
                    ) : (
                      <Empty title="最初の入口をつくる">
                        <button className="btn" onClick={() => setEdit("new")}>
                          作品を追加
                        </button>
                      </Empty>
                    )}
                  </section>
                  <section className="paper-note">
                    <Heart size={26} strokeWidth={1} />
                    <h3>
                      うれしい言葉を、
                      <br />
                      手帳の片すみに。
                    </h3>
                    <p>
                      届いた感想をカードにして、
                      <br />
                      制作のお守りにしませんか。
                    </p>
                    <button
                      className="text-button"
                      onClick={() => navigate("print")}
                    >
                      手帳に残す <ArrowRight size={14} />
                    </button>
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
              />
            </section>
          )}
          {section === "projects" && (
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
                  <p>{p.description || "まだ紹介文はありません。"}</p>
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
                <span>新しい作品・ツールを追加</span>
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
            <span>応援の便り</span>
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
      {edit && (
        <ProjectModal
          project={edit}
          tipEnabled={!!session.data?.tip_links_enabled}
          onClose={() => {
            setEdit(null);
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
}: {
  project: string;
  version: number;
  compact?: boolean;
  onSelect: (m: Message) => void;
}) {
  const [status, setStatus] = useState("all"),
    [page, setPage] = useState(0),
    [search, setSearch] = useState("");
  useEffect(() => setPage(0), [project, status]);
  const { data, error, loading } = useApi<{
    items: Message[];
    total: number;
    page: number;
  }>(
    "/owner/messages?" +
      new URLSearchParams({
        project,
        status,
        page: String(page),
        v: String(version),
      }),
  );
  const items = (data?.items || []).filter(
    (m) =>
      !search || m.body.includes(search) || m.project_title.includes(search),
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
      <ErrorText>{error}</ErrorText>
      {loading && !data ? (
        <p className="loading-text">読み込んでいます…</p>
      ) : items.length ? (
        <div className="message-list">
          {items.slice(0, compact ? 4 : 50).map((m) => (
            <button
              className={"message-row " + (!m.read_at ? "unread" : "")}
              key={m.id}
              onClick={() => onSelect(m)}
            >
              <span className="letter-avatar">
                <Mail size={18} strokeWidth={1.3} />
              </span>
              <div className="message-summary">
                <div className="message-meta">
                  <span className="project-tag">{m.project_title}</span>
                  {!m.read_at && <span className="unread-dot" />}
                  <time>{dateTime(m.created_at)}</time>
                </div>
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
          ))}
        </div>
      ) : (
        <Empty
          title={
            search
              ? "該当する感想がありません"
              : status === "all"
                ? "最初の便りを、待っています。"
                : "該当する便りはありません。"
          }
        >
          {status === "all" && !search
            ? "作品にウィジェットを置くと、ここに感想が届きます。"
            : undefined}
        </Empty>
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
          <span className="project-tag">{m.project_title}</span>
          <time>
            {date(m.created_at)} · {dateTime(m.created_at)}
          </time>
        </div>
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
            placeholder="便りへのお返事を。"
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
  thanks_mode: "random" as "random" | "fixed",
  tip_url: "",
  tip_legal_checked: false,
  tip_terms_checked: false,
  tip_privacy_checked: false,
};
function ProjectModal({
  project,
  tipEnabled,
  onClose,
  notify,
}: {
  project: Project | "new";
  tipEnabled: boolean;
  onClose: () => void;
  notify: (s: string) => void;
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
          thanks_mode: project.thanks_mode,
          tip_url: project.tip_url || "",
          tip_legal_checked: !!project.tip_legal_checked,
          tip_terms_checked: !!project.tip_terms_checked,
          tip_privacy_checked: !!project.tip_privacy_checked,
        };
  const [form, setForm] = useState(initial),
    [origins, setOrigins] = useState(initial.allowed_origins.join("\n")),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("settings");
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
          allowed_origins: origins
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
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
  async function upload(file: File, kind: "button" | "thanks") {
    setBusy(true);
    setError("");
    try {
      if (file.size > 2097152) throw new Error("画像は2MB以下にしてください。");
      if (project === "new") return;
      await api("/owner/projects/" + project.id + "/assets?kind=" + kind, {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/octet-stream" },
      });
      assets.refresh();
      notify("画像を登録しました");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const widgetUrl =
    location.origin +
    "/widget/" +
    (project === "new" ? form.slug : project.slug);
  const embed = `<iframe src="${widgetUrl}" title="作者への応援" width="100%" height="780" loading="lazy" referrerpolicy="no-referrer" style="border:0;max-width:440px"></iframe>`;
  return (
    <Modal
      title={
        project === "new" ? "作品・ツールを追加" : project.title + "の設定"
      }
      onClose={onClose}
      wide
    >
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
                作品・ツール名
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
              ひとこと紹介
              <input
                maxLength={240}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </label>
            <label>
              作品ページURL
              <input
                type="url"
                placeholder="https://kazukisekiguchi.com/..."
                value={form.site_url}
                onChange={(e) => set("site_url", e.target.value)}
              />
            </label>
            <label>
              埋め込みを許可するサイト
              <textarea
                rows={3}
                placeholder={"https://kazukisekiguchi.com\nhttps://example.com"}
                value={origins}
                onChange={(e) => setOrigins(e.target.value)}
              />
              <small>
                オリジンを1行ずつ。末尾スラッシュ・ページパスは不要です。
              </small>
            </label>
            <div className="setting-section">
              <h3>ウィジェットの機能</h3>
              {[
                ["clap_enabled", "拍手を受け付ける"],
                ["message_enabled", "非公開の感想を受け付ける"],
                ["favorite_enabled", "ブラウザのお気に入りを表示"],
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
                <span>お礼イラストの表示</span>
                <select
                  value={form.thanks_mode}
                  onChange={(e) => set("thanks_mode", e.target.value)}
                >
                  <option value="random">ランダム</option>
                  <option value="fixed">最初に登録した画像</option>
                </select>
              </label>
            </div>
            <details className="tip-settings">
              <summary>外部の支援リンク</summary>
              <p>
                適法性・決済事業者の規約・個人情報の表示を確認した外部リンクのみ設定できます。現在のサーバー設定：
                {tipEnabled ? "有効化可能" : "非表示"}
                。PayPayへの対応は未確認です。
              </p>
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
              <button type="button" className="btn" onClick={onClose}>
                閉じる
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "保存中…" : "設定を保存"}
              </button>
            </div>
          </form>
        )}
        {tab === "images" && (
          <div className="images-settings">
            <p className="muted">
              PNG/APNG・GIF・WebP、各2MB・4096px以下。SVGは受け付けません。画像は訪問者に公開されます。
            </p>
            {(["button", "thanks"] as const).map((kind) => (
              <section key={kind}>
                <h3>
                  {kind === "button" ? "拍手ボタンの画像" : "お礼イラスト"}
                  <small>{kind === "button" ? "1枚" : "最大20枚"}</small>
                </h3>
                <div className="asset-grid">
                  {assets.data
                    ?.filter((a) => a.kind === kind)
                    .map((a) => (
                      <div className="asset-item" key={a.id}>
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
                            if (!confirm("この公開画像を削除しますか？"))
                              return;
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
                  <label className="upload-tile">
                    <Plus size={22} />
                    <span>画像を追加</span>
                    <input
                      type="file"
                      accept="image/png,image/apng,image/gif,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(f, kind);
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
            <h3>あなたのサイトに、応援の入口を。</h3>
            <p className="muted">
              基本設定で設置先のオリジンを許可し、下のコードをページに貼り付けてください。
            </p>
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
            <p className="small-text muted">
              スマートフォンでは横幅が自動で縮みます。高さはページに合わせて調整できます。
            </p>
          </div>
        )}
      </div>
    </Modal>
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
                      {m.project_title} · {date(m.created_at)}
                    </small>
                    <p>{m.body}</p>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <Empty title="残したい便りが届いたら。" icon={Printer}>
            感想を選んで、カードやシール用PDFにできます。
          </Empty>
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
              <small>{preview?.project_title || "作品・ツール名"}</small>
              <p>{preview?.body || "大切な言葉が、ここに。"}</p>
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
          画面のカードはイメージです。シール用紙の規格と印刷位置は、普通紙で試してから調整してください。
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
          <h2>便りを書き出す</h2>
          <ArrowDownToLine size={18} />
        </div>
        <div className="data-section">
          <p>すべての感想・返信・公開同意を、手元に保存できます。</p>
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
                    "応援の便り_バックアップ.json",
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
                  "「バックアップを含む全データを削除」と入力すると、作品・画像・便り・バックアップをすべて削除します。元に戻せません。",
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
