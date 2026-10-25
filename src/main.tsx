import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Widget, ReplyPage } from "./Widget";
import PreviewHome from "./PreviewHome";
import { previewMode } from "./mode";
import "./styles.css";
const path = location.pathname;
const widget = path.match(/^\/widget\/([^/]+)$/);
if (previewMode) document.body.classList.add("browser-preview");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {previewMode && (
      <div className="preview-notice">
        ブラウザ体験版 ·
        入力内容はこのブラウザだけに保存され、作者には届きません。
      </div>
    )}
    {widget ? (
      <Widget slug={decodeURIComponent(widget[1])} />
    ) : path === "/reply" ? (
      <ReplyPage />
    ) : previewMode && path === "/" ? (
      <PreviewHome />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
