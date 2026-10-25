import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Heart, Inbox } from "lucide-react";
import { embedCode } from "./embed-code";
function EmbedExample({ slug }: { slug: string }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = host.current!;
    const script = document.createElement("script");
    script.src = "/embed.js";
    script.dataset.project = slug;
    node.appendChild(script);
    return () => {
      node.replaceChildren();
    };
  }, [slug]);
  return <span className="demo-button-mount" ref={host} />;
}
export default function EmbedDemo() {
  const [slug, setSlug] = useState("prepro"),
    [copied, setCopied] = useState(false);
  const code = embedCode(location.origin, slug);
  return (
    <div className="embed-demo">
      <header>
        <a className="brand" href="/demo">
          <span className="brand-mark">
            <Heart size={22} />
          </span>
          <span>応援の便り</span>
        </a>
        <nav>
          <a href="/admin#projects">
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
          <h1>小さな拍手ボタンを、好きな場所に。</h1>
          <p>
            下のページ例は、発行した埋め込みコードでボタンを置いています。押すと拍手が保存され、お礼イラストと任意の感想欄が開きます。
          </p>
        </div>
        <div className="demo-examples">
          <article className="demo-example demo-tool">
            <span className="demo-example-type">無料ツールの配布ページ</span>
            <h2>プリプロ名人</h2>
            <p>
              制作の準備を、少し軽やかに。
              <br />
              企画を整理する無料ツールです。
            </p>
            <span className="demo-download-label">
              ツールはいつでも無料で利用できます
            </span>
            <div className="demo-inline-embed">
              <span>使ってみてよかったら。</span>
              <EmbedExample slug="prepro" />
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
            <p>作品を見てくださって、ありがとうございます。</p>
            <div className="demo-inline-embed">
              <EmbedExample slug="works" />
            </div>
          </article>
          <article className="demo-example demo-blog">
            <span className="demo-example-type">ブログ・記事の末尾</span>
            <h2>つくる日々の、小さな記録。</h2>
            <p>
              物語のきっかけを集めて、今日はひとつだけ形にしました。読んでくださって、ありがとうございます。
            </p>
            <div className="demo-blog-footer">
              <span>この記事への拍手</span>
              <EmbedExample slug="ohanashi" />
            </div>
            <p className="demo-following-content">
              ボタンの後の文章も、いつもの位置に表示されます。
            </p>
          </article>
        </div>
        <section className="demo-embed-code">
          <div>
            <h2>自分のページに貼るコード</h2>
            <p>
              設置したい位置に1行貼り付けます。実運用では管理画面で設置先のオリジンを許可します。
            </p>
          </div>
          <label>
            設置先
            <select
              aria-label="コードを発行する作品"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setCopied(false);
              }}
            >
              <option value="prepro">プリプロ名人</option>
              <option value="shakutori">尺取名人</option>
              <option value="ohanashi">おはなし名人</option>
              <option value="works">作品ページ</option>
            </select>
          </label>
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
            現在は体験版です。拍手・感想はブラウザ内に保存され、作者には届きません。別サイトではブラウザの保存制限・保存領域の分離が適用される場合があります。本番サイトへの導入はサーバー接続後に行います。
          </p>
        </section>
      </main>
    </div>
  );
}
