import { ArrowRight, Inbox } from "lucide-react";
import { Widget } from "./Widget";
export default function PreviewHome() {
  return (
    <div className="preview-home">
      <header>
        <a className="brand" href="/">
          <span>Hakushu</span>
        </a>
        <a className="btn" href="/admin#inbox">
          <Inbox size={15} />
          このブラウザの受信箱 <ArrowRight size={14} />
        </a>
      </header>
      <main>
        <section className="preview-intro">
          <span className="preview-pill">ブラウザ体験版</span>
          <h1>Hakushu</h1>
        </section>
        <div className="preview-home-widget">
          <Widget slug="sample" embedded={false} />
        </div>
      </main>
      <footer>Hakushu · ブラウザ体験版</footer>
    </div>
  );
}
