import { previewMode } from "./mode";
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
  const [body, setBody] = useState(""),
    [consent, setConsent] = useState(false),
    [favorite, setFavorite] = useState(false),
    [claps, setClaps] = useState(0),
    [clapBusy, setClapBusy] = useState(false),
    [clapNote, setClapNote] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [sent, setSent] = useState(false),
    [replyUrl, setReplyUrl] = useState(""),
    [copied, setCopied] = useState(false),
    [captcha, setCaptcha] = useState(""),
    [captchaReset, setCaptchaReset] = useState(0),
    [storageWarning, setStorageWarning] = useState(""),
    [website, setWebsite] = useState("");
  const started = useRef(Date.now()),
    requestId = useRef(crypto.randomUUID()),
    lastBody = useRef("");
  const [thanksIndex] = useState(() => Math.random());
  useEffect(() => {
    try {
      setFavorite(localStorage.getItem("support-favorite:" + slug) === "true");
    } catch {
      setStorageWarning("このブラウザではお気に入りを保存できません。");
    }
  }, [slug]);
  async function clap() {
    setClaps((n) => n + 1);
    if (clapBusy) return;
    setClapBusy(true);
    setNotice("");
    try {
      await send("/public/projects/" + encodeURIComponent(slug) + "/claps", {});
      setClapNote(
        previewMode ? "体験用の拍手を保存しました。" : "拍手を届けました。",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setClapBusy(false);
    }
  }
  function toggleFavorite() {
    try {
      localStorage.setItem("support-favorite:" + slug, String(!favorite));
      setFavorite(!favorite);
    } catch {
      setStorageWarning(
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
      <div className="widget-wrap">
        <p className="muted">読み込んでいます…</p>
      </div>
    );
  if (error || !p)
    return (
      <div className="widget-wrap">
        <p role="alert">{error || "表示できません。"}</p>
        <button className="btn" onClick={() => location.reload()}>
          再読み込み
        </button>
      </div>
    );
  const assets = p.assets || [],
    button = assets.find((a) => a.kind === "button"),
    thanks = assets.filter((a) => a.kind === "thanks"),
    image = thanks.length
      ? thanks[
          p.thanks_mode === "fixed"
            ? 0
            : Math.floor(thanksIndex * thanks.length)
        ]
      : null;
  return (
    <div className={"widget-wrap " + (embedded ? "embedded" : "")}>
      <section className="support-widget">
        <div className="widget-wordmark">
          <span className="tiny-dot" /> 応援の便り
        </div>
        {sent ? (
          <div className="thank-you">
            <div className="thank-art">
              {image ? (
                <img src={assetUrl(image.id)} alt="作者からのお礼イラスト" />
              ) : (
                <Heart size={48} strokeWidth={1} />
              )}
            </div>
            <h1>言葉を、ありがとう。</h1>
            <p>
              {previewMode
                ? "このブラウザに、体験用の便りを保存しました。"
                : "あなたの便りを作者に届けました。"}
            </p>
            {replyUrl && (
              <div className="reply-link-box">
                <b>返信はこちらから</b>
                <p>
                  {previewMode
                    ? "体験版のURLは、このブラウザだけで確認できます。"
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
              ウィジェットに戻る
            </button>
          </div>
        ) : (
          <>
            <h1>
              {p.title}へ、
              <br />
              小さな応援を。
            </h1>
            <p className="widget-description">
              {p.description ||
                "ひとつの拍手も、ひとことも。制作の励みになります。"}
            </p>
            <div className="widget-actions">
              {!!p.clap_enabled && (
                <button
                  className={"clap-button " + (claps ? "clapped" : "")}
                  onClick={clap}
                  aria-label="拍手を送る"
                >
                  {button ? (
                    <img src={assetUrl(button.id)} alt="" />
                  ) : (
                    <ThumbsUp size={24} strokeWidth={1.5} />
                  )}
                  <span>{claps ? "もう一度、拍手" : "拍手を送る"}</span>
                  {claps > 0 && <span className="clap-number">+{claps}</span>}
                </button>
              )}
              {!!p.favorite_enabled && (
                <button
                  className={"favorite-button " + (favorite ? "active" : "")}
                  onClick={toggleFavorite}
                  aria-pressed={favorite}
                  aria-label="お気に入り"
                >
                  <Heart size={21} fill={favorite ? "currentColor" : "none"} />
                </button>
              )}
            </div>
            <p className="widget-feedback" aria-live="polite">
              {clapNote || storageWarning || " "}
            </p>
            {!!p.message_enabled && (
              <form onSubmit={submit}>
                <label className="field-label" htmlFor="message">
                  <MessageCircle size={15} /> ひとこと、添える
                </label>
                <textarea
                  id="message"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={2000}
                  required
                  placeholder="使ってみたこと、好きだったところ。お気軽に。"
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
                      : "感想を届ける"}
                </button>
              </form>
            )}
            {p.tip_url && (
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
          </>
        )}
        {notice && (
          <p className="error" role="alert">
            {notice}
          </p>
        )}
        <div className="widget-footer">
          {favorite
            ? "このブラウザにお気に入りを保存しました"
            : "あなたのペースで、応援を。"}
        </div>
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
        応援の便り
      </div>
      <h1>あなたへの返信</h1>
      <p className="muted">
        このURLを知っている人だけが確認できます。大切に保管してください。
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : data ? (
        <>
          <span className="eyebrow">{data.title}</span>
          <div className="reply-original">
            <small>あなたの感想</small>
            <p>{data.body}</p>
          </div>
          <div className="reply-letter">
            <Heart size={24} strokeWidth={1.2} />
            <h2>作者から</h2>
            <p>
              {data.reply_body ||
                "まだ返信は届いていません。また、のぞいてみてください。"}
            </p>
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
