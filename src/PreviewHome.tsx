import { useState } from "react";
import {
  ArrowRight,
  Heart,
  Inbox,
  LockKeyhole,
  MessageCircle,
  ThumbsUp,
} from "lucide-react";
import { Widget } from "./Widget";
export default function PreviewHome() {
  const [slug, setSlug] = useState("prepro");
  return (
    <div className="preview-home">
      <header>
        <a className="brand" href="/">
          <span className="brand-mark">
            <Heart size={22} />
          </span>
          <span>Web拍手</span>
        </a>
        <a className="btn" href="/admin#inbox">
          <Inbox size={15} />
          このブラウザの受信箱 <ArrowRight size={14} />
        </a>
      </header>
      <main>
        <section className="preview-intro">
          <span className="preview-pill">ブラウザ体験版</span>
          <h1>Web拍手 体験版</h1>
          <div
            className="preview-project-picker"
            role="group"
            aria-label="体験する作品・ツール"
          >
            {[
              ["prepro", "プリプロ名人"],
              ["shakutori", "尺取名人"],
              ["ohanashi", "おはなし名人"],
              ["works", "作品ページ"],
            ].map(([id, title]) => (
              <button
                key={id}
                aria-pressed={slug === id}
                className={slug === id ? "active" : ""}
                onClick={() => setSlug(id)}
              >
                {title}
              </button>
            ))}
          </div>
          <div className="preview-steps">
            <span>
              <ThumbsUp size={16} />
              拍手を送る体験
            </span>
            <span>
              <MessageCircle size={16} />
              匿名の感想を書く体験
            </span>
            <span>
              <Heart size={16} />
              お礼イラストを受け取る体験
            </span>
          </div>
          <div className="preview-local-note">
            <LockKeyhole size={17} />
            <p>
              入力内容は、このブラウザだけに保存します。
              <br />
              作者への送信・外部決済は行いません。
            </p>
          </div>
        </section>
        <div className="preview-home-widget">
          <Widget key={slug} slug={slug} embedded={false} />
        </div>
      </main>
      <footer>Web拍手 · ブラウザ体験版</footer>
    </div>
  );
}
