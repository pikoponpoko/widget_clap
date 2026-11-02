import { ClapControl } from "./ClapButton";
import { previewMode } from "./mode";
import {
  clapContext,
  pageContext,
  tipLabel,
  tipRequested,
} from "./page-context";
import { assetUrl } from "./asset-url";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clapperboard,
  Copy,
  Heart,
  Send,
  ThumbsUp,
} from "lucide-react";
import { api, inlineProject, send, useApi } from "./api";
import type { Project } from "./types";
import { reactionOf } from "./reactions";
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}
function Turnstile({
  siteKey,
  onToken,
  reset,
}: {
  siteKey: string;
  onToken: (s: string) => void;
  reset: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  useEffect(() => {
    let widget: string | undefined;
    let cancelled = false;
    const render = () => {
      if (!cancelled && container.current && window.turnstile)
        widget = window.turnstile.render(container.current, {
          sitekey: siteKey,
          action: "message",
          theme: "light",
          appearance: "interaction-only",
          callback: (s: string) => callback.current(s),
          "expired-callback": () => callback.current(""),
          "error-callback": () => callback.current(""),
        });
    };
    let script = document.querySelector<HTMLScriptElement>("#turnstile-script");
    if (window.turnstile) render();
    else {
      if (!script) {
        script = document.createElement("script");
        script.id = "turnstile-script";
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener("load", render);
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, reset]);
  return <div ref={container} />;
}
export function Widget({
  slug,
  embedded = true,
}: {
  slug: string;
  embedded?: boolean;
}) {
  const {
    data: p,
    error,
    loading,
  } = useApi<Project>(
    "/public/projects/" + encodeURIComponent(slug),
    inlineProject<Project>(slug),
  );
  const params = new URLSearchParams(location.search);
  const initial = params.get("after");
  // Loaded ahead of the click by embed.js; stays blank until the host says to show.
  const [waiting, setWaiting] = useState(params.get("preload") === "1");
  const [stage, setStage] = useState<"button" | "clap" | "message">(
    ["clap", "message"].includes(initial || "")
      ? (initial as "clap" | "message")
      : "button",
  );
  const [body, setBody] = useState(""),
    [name, setName] = useState(""),
    [consent, setConsent] = useState(false),
    [replyWanted, setReplyWanted] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [sent, setSent] = useState(false),
    [replyUrl, setReplyUrl] = useState(""),
    [copied, setCopied] = useState(false),
    [captcha, setCaptcha] = useState(""),
    [captchaReset, setCaptchaReset] = useState(0),
    [website, setWebsite] = useState(""),
    [thanksIndex, setThanksIndex] = useState(() =>
      stage === "button" ? { random: 0, sequence: 0 } : nextThanks(),
    ),
    [clapBusy, setClapBusy] = useState(false),
    [reacted, setReacted] = useState<string[]>([]);
  const started = useRef(Date.now()),
    requestId = useRef(crypto.randomUUID()),
    lastBody = useRef("");
  useEffect(() => {
    if (!waiting) return;
    const host = params.get("parent_origin");
    function show(event: MessageEvent) {
      const reason = event.data?.reason;
      if (
        event.source !== window.parent ||
        event.origin !== host ||
        event.data?.type !== "creator-support:show" ||
        !["clap", "message"].includes(reason)
      )
        return;
      open(reason);
      setWaiting(false);
    }
    window.addEventListener("message", show);
    return () => window.removeEventListener("message", show);
  }, [waiting]);
  // Tell the host it can show this frame without waiting for a fresh load.
  useEffect(() => {
    if (!waiting || !p) return;
    const host = params.get("parent_origin");
    if (!host || window.parent === window) return;
    for (const a of (p.assets || []).filter((a) => a.kind === "thanks"))
      new Image().src = assetUrl(a.id);
    try {
      if (new URL(host).origin === host)
        window.parent.postMessage({ type: "creator-support:ready" }, host);
    } catch {}
  }, [waiting, p]);
  // Each showing advances a per-browser counter, used by the "sequential" order.
  function nextThanks() {
    const key = "hakushu-thanks:" + slug;
    let n = 0;
    try {
      n = Number(localStorage.getItem(key)) || 0;
      localStorage.setItem(key, String(n + 1));
    } catch {}
    return { random: Math.random(), sequence: n };
  }
  // Widens the host dialog so the illustration can be shown at 100%.
  function fitDialog(width: number) {
    const host = new URLSearchParams(location.search).get("parent_origin");
    if (!host || window.parent === window) return;
    try {
      const origin = new URL(host).origin;
      if (origin === host)
        window.parent.postMessage(
          { type: "creator-support:thanks-width", width },
          origin,
        );
    } catch {}
  }
  // Shrinks the host dialog to the content so no blank space is left below.
  const wrap = useRef<HTMLDivElement>(null);
  const showing = !waiting && stage !== "button" && !!p;
  useEffect(() => {
    const host = params.get("parent_origin");
    const el = wrap.current;
    if (!showing || !el || !host || window.parent === window) return;
    let origin: string;
    try {
      origin = new URL(host).origin;
    } catch {
      return;
    }
    if (origin !== host) return;
    const report = () =>
      window.parent.postMessage(
        {
          type: "creator-support:thanks-height",
          height: Math.ceil(el.getBoundingClientRect().height),
        },
        origin,
      );
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, [showing]);
  function open(reason: "clap" | "message") {
    setStage(reason);
    setThanksIndex(nextThanks());
    setReacted([]);
  }
  async function react(kind: string) {
    if (reacted.includes(kind)) return;
    setReacted((r) => [...r, kind]);
    setNotice("");
    try {
      await send(
        "/public/projects/" + encodeURIComponent(slug) + "/reactions",
        { kind, ...pageContext },
      );
    } catch (e) {
      setReacted((r) => r.filter((k) => k !== kind));
      setNotice((e as Error).message);
    }
  }
  async function anotherClap() {
    if (clapBusy) return;
    setClapBusy(true);
    setNotice("");
    try {
      await send(
        "/public/projects/" + encodeURIComponent(slug) + "/claps",
        clapContext,
      );
      setThanksIndex(nextThanks());
      setStage("clap");
      setReacted([]);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setClapBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    if (lastBody.current && lastBody.current !== body)
      requestId.current = crypto.randomUUID();
    lastBody.current = body;
    try {
      const result = await send<{ reply_token: string | null }>(
        "/public/projects/" + encodeURIComponent(slug) + "/messages",
        {
          body,
          sender_name: name,
          reply_wanted: replyWanted,
          publication_consent: consent,
          request_id: requestId.current,
          website,
          started_at: started.current,
          turnstile: captcha || undefined,
          ...pageContext,
        },
      );
      setReplyUrl(
        result.reply_token
          ? `${location.origin}/reply#${result.reply_token}`
          : "",
      );
      setSent(true);
      setBody("");
    } catch (e) {
      setNotice((e as Error).message);
      setCaptcha("");
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="widget-loading" role="status">
        読み込んでいます…
      </div>
    );
  if (error || !p)
    return (
      <div className="widget-error">
        <p role="alert">{error || "表示できません。"}</p>
        <button className="btn" onClick={() => location.reload()}>
          再読み込み
        </button>
      </div>
    );
  if (waiting) return null;
  if (stage === "button")
    return (
      <div className="widget-button-only">
        <ClapControl project={p} onOpen={open} />
      </div>
    );
  const thanks = (p.assets || []).filter((a) => a.kind === "thanks");
  const image = thanks.length
    ? thanks[
        p.thanks_order === "fixed"
          ? 0
          : p.thanks_order === "sequential"
            ? thanksIndex.sequence % thanks.length
            : Math.floor(thanksIndex.random * thanks.length)
      ]
    : null;
  const reactions = (p.reactions || [])
    .map(reactionOf)
    .filter((r) => r !== undefined);
  const thanksEnabled = p.thanks_enabled !== false && p.thanks_enabled !== 0;
  return (
    <div
      ref={wrap}
      className={"widget-wrap thank-stage " + (embedded ? "embedded" : "")}
    >
      <section className="support-widget">
        {!embedded && <div className="widget-logo">Hakushu</div>}
        {thanksEnabled && (stage === "clap" || sent) && (
          <div className="thank-art">
            <img
              src={image ? assetUrl(image.id) : "/thanks.svg"}
              alt="作者からのお礼イラスト"
              onLoad={(e) => fitDialog(e.currentTarget.naturalWidth)}
            />
          </div>
        )}
        {(stage === "clap" || sent) && p.thanks_message && (
          <p className="thank-message">{p.thanks_message}</p>
        )}
        {(sent || stage !== "clap") && (
          <h1>{sent ? "送信しました" : "メッセージ"}</h1>
        )}
        {previewMode && (
          <p className="preview-widget-note">
            体験版：このブラウザ内の保存です。作者への送信はありません。
          </p>
        )}
        {(!!p.clap_enabled || reactions.length > 0) && (
          <div className="thank-actions">
            {!!p.clap_enabled && (
              <button className="btn" disabled={clapBusy} onClick={anotherClap}>
                <ThumbsUp size={14} />
                {clapBusy ? "送信中…" : "もう一度"}
              </button>
            )}
            {reactions.length > 0 && (
              <div className="reaction-row">
                {reactions.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className="btn reaction-button"
                    aria-label={r.label}
                    title={r.label}
                    aria-pressed={reacted.includes(r.key)}
                    onClick={() => react(r.key)}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {sent ? (
          <>
            {replyUrl && (
              <div className="reply-link-box">
                <b>返信はこちらから</b>
                <p>
                  {previewMode
                    ? "体験版のURLはこのブラウザでのみ確認できます。"
                    : "このURLを保存してください。共有した相手も閲覧できます。再表示はできません。"}
                </p>
                <a href={replyUrl} target="_blank" rel="noreferrer">
                  返信を確認する <ArrowUpRight size={14} />
                </a>
                <button
                  className="btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(replyUrl);
                      setCopied(true);
                    } catch {
                      setNotice(
                        "コピーできませんでした。下のURLを保存してください。",
                      );
                    }
                  }}
                >
                  <Copy size={14} />
                  {copied ? "コピーしました" : "確認URLをコピー"}
                </button>
                <input
                  aria-label="返信確認URL"
                  readOnly
                  value={replyUrl}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            )}
            <button
              className="text-button"
              onClick={() => {
                setSent(false);
                setReplyUrl("");
                setConsent(false);
                setReplyWanted(null);
                requestId.current = crypto.randomUUID();
                started.current = Date.now();
                setCaptcha("");
                setCaptchaReset((n) => n + 1);
              }}
            >
              メッセージを追加
            </button>
          </>
        ) : (
          !!p.message_enabled && (
            <form className="optional-message" onSubmit={submit}>
              <input
                className="sender-name-input"
                aria-label="お名前（任意）"
                placeholder="お名前（任意）"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                autoComplete="nickname"
              />
              <textarea
                aria-label="メッセージ"
                placeholder="メッセージ"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                required
                rows={4}
              />
              {body.length > 1800 && (
                <div className="character-count">{body.length} / 2,000</div>
              )}
              <div className="honeypot" aria-hidden="true">
                <label>
                  Website
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>
              {previewMode && (
                <p className="privacy-note">
                  体験版の感想はこのブラウザ内に保存し、作者には送信しません。
                </p>
              )}
              <div className="reply-choice">
                {(
                  [
                    [false, "返事不要"],
                    [true, "返事が欲しい"],
                  ] as const
                ).map(([value, label]) => (
                  <label className="check-label" key={label}>
                    <input
                      type="checkbox"
                      checked={replyWanted === value}
                      onChange={(e) =>
                        setReplyWanted(e.target.checked ? value : null)
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>公開を許可</span>
                </label>
              </div>
              {p.turnstile_site_key && (
                <Turnstile
                  siteKey={p.turnstile_site_key}
                  onToken={setCaptcha}
                  reset={captchaReset}
                />
              )}
              <button
                className="btn primary send-button"
                disabled={
                  busy || !body.trim() || (!!p.turnstile_site_key && !captcha)
                }
              >
                <Send size={15} />
                {busy
                  ? "保存しています…"
                  : previewMode
                    ? "感想を保存して試す"
                    : "送信"}
              </button>
            </form>
          )
        )}
        {p.tip_url && tipRequested && (
          <div className="tip-link">
            <a
              className="tip-button"
              href={p.tip_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tipLabel} <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        {previewMode && tipRequested && !p.tip_url && (
          <div className="tip-link">
            <span className="tip-button tip-preview" aria-disabled="true">
              {tipLabel}
            </span>
            <small>体験版：投げ銭リンク未設定</small>
          </div>
        )}
        {notice && (
          <p className="error" role="alert">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
export function ReplyPage() {
  const [data, setData] = useState<{
      title: string;
      body: string;
      created_at: string;
      reply_body: string | null;
      replied_at: string | null;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const token = location.hash.slice(1);
    if (!token) {
      setError("返信確認URLが必要です。");
      return;
    }
    api<typeof data>("/public/reply", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="reply-page">
      <div className="widget-wordmark">
        <span className="tiny-dot" />
        Hakushu
      </div>
      <h1>返信</h1>
      <p className="muted">このURLを知っている人は誰でも閲覧できます。</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : data ? (
        <>
          <span className="eyebrow">{data.title}</span>
          <div className="reply-original">
            <small>送信したメッセージ</small>
            <p>{data.body}</p>
          </div>
          <div className="reply-letter">
            <Heart size={24} strokeWidth={1.2} />
            <h2>作者から</h2>
            <p>{data.reply_body || "返信はまだありません"}</p>
          </div>
          <button className="btn" onClick={() => location.reload()}>
            最新の返信を確認
          </button>
        </>
      ) : (
        <p>読み込んでいます…</p>
      )}
    </main>
  );
}
