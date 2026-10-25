import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
const App = lazy(() => import("./App"));
const EmbedDemo = lazy(() => import("./EmbedDemo"));
import { EmbeddedButton } from "./ClapButton";
const Widget = lazy(() =>
  import("./Widget").then((m) => ({ default: m.Widget })),
);
const ReplyPage = lazy(() =>
  import("./Widget").then((m) => ({ default: m.ReplyPage })),
);
const PreviewHome = lazy(() => import("./PreviewHome"));
import { previewMode } from "./mode";
import "./styles.css";
const path = location.pathname;
const button = path.match(/^\/button\/([^/]+)$/);
const widget = path.match(/^\/widget\/([^/]+)$/);
if (button) {
  document.body.classList.add("button-frame-page");
  document.documentElement.classList.add("embed-document");
}
if (previewMode) document.body.classList.add("browser-preview");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense
      fallback={<span className="widget-loading">読み込んでいます…</span>}
    >
      {previewMode && !button && !widget && (
        <div className="preview-notice">
          ブラウザ体験版 ·
          入力内容はこのブラウザだけに保存され、作者には届きません。
        </div>
      )}
      {button ? (
        <EmbeddedButton slug={decodeURIComponent(button[1])} />
      ) : widget ? (
        <Widget slug={decodeURIComponent(widget[1])} />
      ) : path === "/reply" ? (
        <ReplyPage />
      ) : path === "/" || path === "/demo" ? (
        <EmbedDemo />
      ) : path === "/about" ? (
        <PreviewHome />
      ) : (
        <App />
      )}
    </Suspense>
  </React.StrictMode>,
);
