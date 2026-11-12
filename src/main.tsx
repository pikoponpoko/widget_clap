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
// Only the admin screen is installable; embedded frames skip this.
// These files sit outside the Cloudflare Access paths so they load before login.
if (path === "/admin" || path.startsWith("/admin/")) {
  for (const [rel, href] of [
    ["manifest", "/app.webmanifest"],
    ["apple-touch-icon", "/icons/apple-touch-icon.png"],
  ]) {
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  }
  // iOS launch screens: [CSS width, CSS height, pixel ratio, also landscape].
  // Files are /icons/splash/<px width>x<px height>.png.
  for (const [w, h, dpr, landscape] of [
    [440, 956, 3], [430, 932, 3], [428, 926, 3], [420, 912, 3], [414, 896, 3],
    [414, 896, 2], [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3],
    [375, 667, 2], [320, 568, 2],
    [1032, 1376, 2, 1], [1024, 1366, 2, 1], [834, 1210, 2, 1], [834, 1194, 2, 1],
    [834, 1112, 2, 1], [820, 1180, 2, 1], [810, 1080, 2, 1], [768, 1024, 2, 1],
    [744, 1133, 2, 1],
  ]) {
    for (const portrait of landscape ? [true, false] : [true]) {
      const link = document.createElement("link");
      link.rel = "apple-touch-startup-image";
      link.media = `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${portrait ? "portrait" : "landscape"})`;
      link.href = portrait
        ? `/icons/splash/${w * dpr}x${h * dpr}.png`
        : `/icons/splash/${h * dpr}x${w * dpr}.png`;
      document.head.appendChild(link);
    }
  }
  for (const [name, content] of [
    ["theme-color", "#ffffff"],
    ["apple-mobile-web-app-title", "Hakushu"],
    ["mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-capable", "yes"],
  ]) {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/app-sw.js", { scope: "/admin" })
      .catch(() => {});
}
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
