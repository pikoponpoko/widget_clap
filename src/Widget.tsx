import { ClapControl } from "./ClapButton";
import { previewMode } from "./mode";
import { pageContext, tipRequested } from "./page-context";
import { assetUrl } from "./asset-url";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clapperboard,
  Copy,
  Heart,
  MessageCircle,
  Send,
  ThumbsUp,
} from "lucide-react";
import { api, send, useApi } from "./api";
import type { Project } from "./types";
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
  } = useApi<Project>("/public/projects/" + encodeURIComponent(slug));
  const initial = new URLSearchParams(location.search).get("after");
  const [stage, setStage] = useState<
    "button" | "clap" | "message" | "favorite"
  >(
    ["clap", "message", "favorite"].includes(initial || "")
      ? (initial as "clap" | "message" | "favorite")
      : "button",
  );
  const [body, setBody] = useState(""),
    [consent, setConsent] = useState(false),
    [favorite, setFavorite] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [sent, setSent] = useState(false),
    [replyUrl, setReplyUrl] = useState(""),
    [copied, setCopied] = useState(false),
    [captcha, setCaptcha] = useState(""),
    [captchaReset, setCaptchaReset] = useState(0),
    [website, setWebsite] = useState(""),
    [thanksIndex, setThanksIndex] = useState(() => Math.random()),
    [clapBusy, setClapBusy] = useState(false);
  // Favorites are per page when embedded, so one code can serve many works.
  const favoriteKey =
    "support-favorite:" +
    slug +
    (pageContext.page_url ? ":" + pageContext.page_url : "");
  const started = useRef(Date.now()),
    requestId = useRef(crypto.randomUUID()),
    lastBody = useRef("");
  useEffect(() => {
    try {
      setFavorite(localStorage.getItem(favoriteKey) === "true");
    } catch {
      setNotice("このブラウザではお気に入りを保存できません。");
    }
  }, [slug]);
  function open(reason: "clap" | "message" | "favorite") {
    setStage(reason);
    setThanksIndex(Math.random());
  }
  async function anotherClap() {
    if (clapBusy) return;
    setClapBusy(true);
    setNotice("");
    try {
      await send(
        "/public/projects/" + encodeURIComponent(slug) + "/claps",
        pageContext,
      );
      setThanksIndex(Math.random());
      setStage("clap");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setClapBusy(false);
    }
  }
  function toggleFavorite() {
    try {
      localStorage.setItem(favoriteKey, String(!favorite));
      setFavorite(!favorite);
    } catch {
      setNotice(
        "お気に入りを保存できません。ブラウザの保存設定をご確認ください。",
      );
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
  if (stage === "button")
    return (
      <div className="widget-button-only">
        <ClapControl project={p} onOpen={open} />
      </div>
    );
  const thanks = (p.assets || []).filter((a) => a.kind === "thanks");
  const image = thanks.length
    ? thanks[
        p.thanks_mode === "fixed" ? 0 : Math.floor(thanksIndex * thanks.length)
      ]
    : null;
  const thanksEnabled = p.thanks_enabled !== false && p.thanks_enabled !== 0;
  return (
    <div className={"widget-wrap thank-stage " + (embedded ? "embedded" : "")}>
      <section className="support-widget">
        <div className="widget-wordmark">
          <span className="tiny-dot" />
          {p.title}
        </div>
        {thanksEnabled && (stage === "clap" || sent) && (
          <div className="thank-art">
            <img
              src={image ? assetUrl(image.id) : "/thanks.svg"}
              alt="作者からのお礼イラスト"
            />
          </div>
        )}
        <h1>
          {sent
            ? "送信しました"
            : stage === "clap"
              ? "拍手しました"
              : "メッセージ"}
        </h1>
        <p className="widget-description" role="status">
          {sent || stage === "clap" ? null : p.description}
        </p>
        {previewMode && (
          <p className="preview-widget-note">
            体験版：このブラウザ内の保存です。作者への送信はありません。
          </p>
        )}
        <div className="thank-actions">
          {!!p.clap_enabled && (
            <button className="btn" disabled={clapBusy} onClick={anotherClap}>
              <ThumbsUp size={16} />
              {clapBusy ? "送信中…" : "もう一度"}
            </button>
          )}
          {!!p.favorite_enabled && (
            <button
              className="btn"
              aria-label="お気に入り"
              aria-pressed={favorite}
              onClick={toggleFavorite}
            >
              <Heart size={16} fill={favorite ? "currentColor" : "none"} />
              {favorite ? "お気に入り済み" : "お気に入り"}
            </button>
          )}
        </div>
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
              <label className="field-label" htmlFor="message">
                <MessageCircle size={15} />
                メッセージ（任意）
              </label>
              <textarea
                id="message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                required
                rows={4}
              />
              <div className="character-count">{body.length} / 2,000</div>
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
              <p className="privacy-note">
                {previewMode
                  ? "体験版の感想はこのブラウザ内に保存し、作者には送信しません。"
                  : "作者だけに届きます。作者が個人的に保存・印刷することがあります。"}
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>この感想の第三者公開を許可する（任意）</span>
              </label>
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
          <a
            className="tip-link"
            href={p.tip_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            任意の支援をする <ArrowUpRight size={14} />
            <small>支援なしでも無料で利用できます</small>
          </a>
        )}
        {previewMode && tipRequested && !p.tip_url && (
          <span className="tip-link tip-preview" aria-disabled="true">
            任意の支援をする
            <small>体験版：決済リンク未設定のため押せません</small>
          </span>
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
