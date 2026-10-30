import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Inbox } from "lucide-react";
import { embedCode } from "./embed-code";
import { cleanTipLabel, defaultTipLabel } from "./page-context";
const slug = "sample";
// The demo shows three pages on one screen, so each copy names its page explicitly.
function EmbedExample({
  path,
  title,
  tip = false,
  tipLabel = "",
}: {
  path: string;
  title: string;
  tip?: boolean;
  tipLabel?: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = host.current!;
    const script = document.createElement("script");
    script.src = "/embed.js";
    script.dataset.project = slug;
    script.dataset.pageUrl = new URL(path, location.origin).href;
    script.dataset.pageTitle = title;
    if (tip) script.dataset.tip = "on";
    if (tipLabel) script.dataset.tipLabel = tipLabel;
    node.appendChild(script);
    return () => {
      node.replaceChildren();
    };
  }, [path, title, tip, tipLabel]);
  return <span className="demo-button-mount" ref={host} />;
}
export default function EmbedDemo() {
  const [tip, setTip] = useState(false),
    [label, setLabel] = useState(""),
    [copied, setCopied] = useState(false);
  const code = embedCode(location.origin, slug, tip, cleanTipLabel(label));
  return (
    <div className="embed-demo">
      <header>
        <a className="brand" href="/demo">
          <span>Hakushu</span>
        </a>
        <nav>
          <a href="/admin">
            <Inbox size={14} />
            管理画面
          </a>
          <a href="/about">
            サービス紹介 <ArrowUpRight size={13} />
          </a>
        </nav>
      </header>
      <main>
        <div className="demo-heading">
          <h1>埋め込みデモ</h1>
          <p>4つのページに同じコードを貼っています。</p>
        </div>
        <div className="demo-examples">
          <article className="demo-example demo-tool">
            <span className="demo-example-type">無料ツールの配布ページ</span>
            <h2>サンプルツール</h2>
            <span className="demo-download-label">
              ツールはいつでも無料で利用できます
            </span>
            <div className="demo-inline-embed">
              <EmbedExample path="/tools/sample-tool" title="サンプルツール" />
            </div>
          </article>
          <article className="demo-example demo-work">
            <span className="demo-example-type">作品ページ</span>
            <div className="demo-work-art" aria-hidden="true">
              <svg viewBox="0 0 280 110">
                <path
                  d="M0 95 55 60 99 81 155 30 220 76 280 50v60H0Z"
                  fill="#e2e2e2"
                />
                <path d="m18 110 65-32 48 21 54-24 95 35" fill="#cecece" />
                <circle cx="228" cy="25" r="12" fill="#ccc" />
              </svg>
            </div>
            <h2>ある日の風景</h2>
            <div className="demo-inline-embed">
              <EmbedExample path="/works/landscape" title="ある日の風景" />
            </div>
          </article>
          <article className="demo-example demo-blog">
            <span className="demo-example-type">ブログ・記事の末尾</span>
            <h2>ブログ記事</h2>
            <div className="demo-blog-footer">
              <span>この記事への拍手</span>
              <EmbedExample path="/blog/2026-10-26" title="ブログ記事" />
            </div>
            <p className="demo-following-content">記事の本文が続きます。</p>
          </article>
          <article className="demo-example demo-tool">
            <span className="demo-example-type">
              投げ銭ON・文言変更（data-tip-label）
            </span>
            <h2>サンプルアプリ</h2>
            <div className="demo-inline-embed">
              <EmbedExample
                path="/tools/sample-app"
                title="サンプルアプリ"
                tip
                tipLabel="コーヒーをおごる"
              />
            </div>
          </article>
        </div>
        <section className="demo-embed-code">
          <div>
            <h2>自分のページに貼るコード</h2>
            <p>
              どのページにも同じコードを貼ります。押されたページのURLとタイトルが記録されます。
            </p>
          </div>
          <label>
            <input
              type="checkbox"
              checked={tip}
              onChange={(e) => {
                setTip(e.target.checked);
                setCopied(false);
              }}
            />
            このページで投げ銭を表示
          </label>
          {tip && (
            <label>
              投げ銭の文言
              <input
                value={label}
                maxLength={30}
                placeholder={defaultTipLabel}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setCopied(false);
                }}
              />
            </label>
          )}
          <textarea
            aria-label="小型ボタンの埋め込みコード"
            readOnly
            value={code}
            rows={3}
            onFocus={(e) => e.target.select()}
          />
          <button
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
            {copied ? "コピーしました" : "埋め込みコードをコピー"}
          </button>
          <p className="demo-preview-caveat">
            体験版：拍手と感想はこのブラウザ内に保存され、作者には届きません。
          </p>
        </section>
      </main>
    </div>
  );
}
