import { previewMode } from "./mode";
import { pageContext, tipRequested } from "./page-context";
import { useEffect, useRef, useState } from "react";
import { assetUrl } from "./asset-url";
import { send, useApi } from "./api";
import type { Project } from "./types";
export type EntryReason = "clap" | "message" | "favorite";
export function ClapControl({
  project: p,
  onOpen,
}: {
  project: Project;
  onOpen: (reason: EntryReason) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const image = p.assets?.find((a) => a.kind === "button");
  const label = p.clap_enabled
    ? "拍手を送る"
    : p.message_enabled
      ? "感想を書く"
      : p.favorite_enabled
        ? "お気に入りを開く"
        : "";
  async function click() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (p.clap_enabled)
        await send(
          "/public/projects/" + encodeURIComponent(p.slug) + "/claps",
          pageContext,
        );
      onOpen(
        p.clap_enabled ? "clap" : p.message_enabled ? "message" : "favorite",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!label && !p.tip_url)
    return <span className="button-unavailable">受付休止中</span>;
  if (!label && p.tip_url)
    return (
      <a
        className="mini-clap"
        href={p.tip_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="任意の支援をする"
      >
        <img src={image ? assetUrl(image.id) : "/support-button.svg"} alt="" />
      </a>
    );
  return (
    <span className="mini-clap-wrap">
      <button
        className="mini-clap"
        onClick={click}
        disabled={busy}
        aria-label={label}
        title={
          error ||
          (previewMode ? label + "（体験版：ブラウザ内の保存）" : label)
        }
      >
        <img
          src={
            image
              ? assetUrl(image.id)
              : p.clap_enabled
                ? "/clap-button.svg"
                : "/support-button.svg"
          }
          alt=""
        />
        {busy && (
          <span className="mini-clap-busy" aria-hidden="true">
            …
          </span>
        )}
      </button>
      {error && (
        <span role="alert" className="mini-clap-error">
          {error}
        </span>
      )}
    </span>
  );
}
export function EmbeddedButton({ slug }: { slug: string }) {
  const { data: p, error } = useApi<Project>(
    "/public/projects/" + encodeURIComponent(slug),
  );
  const [fallback, setFallback] = useState("");
  const frame = useRef<HTMLSpanElement>(null);
  function postToHost(message: Record<string, unknown>) {
    const q = new URLSearchParams(location.search),
      instance = q.get("instance"),
      host = q.get("parent_origin");
    if (!instance || !host || window.parent === window) return false;
    try {
      const origin = new URL(host).origin;
      if (
        origin !== host ||
        !["https:", "http:"].includes(new URL(host).protocol)
      )
        return false;
      window.parent.postMessage(
        { ...message, project: slug, instance },
        origin,
      );
      return true;
    } catch {
      return false;
    }
  }
  // The host iframe follows the button image's own size (GIF buttons included).
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height)
        postToHost({
          type: "creator-support:size",
          width: Math.ceil(r.width),
          height: Math.ceil(r.height),
        });
    });
    observer.observe(el);
    return () => observer.disconnect();
  });
  function open(reason: EntryReason) {
    if (postToHost({ type: "creator-support:open", reason })) return;
    // A plain iframe can use the same small button without access to the host DOM.
    setFallback("/widget/" + encodeURIComponent(slug) + "?after=" + reason);
  }
  if (error)
    return (
      <span className="mini-clap-error" role="alert">
        {error}
      </span>
    );
  if (!p)
    return (
      <button className="mini-clap" disabled aria-label="読み込み中">
        <img src="/clap-button.svg" alt="" />
      </button>
    );
  return (
    <span ref={frame} className="mini-clap-frame">
      <ClapControl project={p} onOpen={open} />
      {/* data-tip="on" pages (e.g. tool downloads) show the tip link before any click. */}
      {tipRequested &&
        (p.clap_enabled || p.message_enabled || p.favorite_enabled) &&
        (p.tip_url ? (
          <a
            className="mini-tip"
            href={p.tip_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            任意の支援をする
          </a>
        ) : previewMode ? (
          <span className="mini-tip tip-preview" aria-disabled="true">
            任意の支援をする（体験版：決済リンク未設定）
          </span>
        ) : null)}
      {fallback && (
        <a
          className="button-fallback-link"
          href={fallback}
          target="_blank"
          rel="noreferrer"
        >
          お礼を開く
        </a>
      )}
    </span>
  );
}
