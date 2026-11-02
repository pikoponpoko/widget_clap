import { previewMode } from "./mode";
import { clapContext } from "./page-context";
import { useEffect, useRef, useState } from "react";
import { assetUrl, densityOf } from "./asset-url";
import { inlineProject, send, useApi } from "./api";
import type { Project } from "./types";
export type EntryReason = "clap" | "message";
export function ClapControl({
  project: p,
  onOpen,
  onReady,
  onFail,
}: {
  project: Project;
  onOpen: (reason: EntryReason) => void;
  onReady?: () => void;
  onFail?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const image = p.assets?.find((a) => a.kind === "button");
  const density = image ? densityOf(image.name) : 1;
  const [size, setSize] = useState<{ width: number; height: number }>();
  const label = p.clap_enabled
    ? "拍手を送る"
    : p.message_enabled
      ? "感想を書く"
      : "";
  async function click() {
    if (busy) return;
    setBusy(true);
    setError("");
    // The thank-you opens at once; it is closed again if the clap cannot be saved.
    const opened = !!p.clap_enabled && !!onFail;
    if (opened) onOpen("clap");
    try {
      if (p.clap_enabled)
        await send(
          "/public/projects/" + encodeURIComponent(p.slug) + "/claps",
          clapContext,
        );
      if (!opened) onOpen(p.clap_enabled ? "clap" : "message");
    } catch (e) {
      setError((e as Error).message);
      if (opened) onFail?.();
    } finally {
      setBusy(false);
    }
  }
  const unavailable = !label;
  useEffect(() => {
    if (unavailable) onReady?.();
  }, [unavailable]);
  if (unavailable)
    return <span className="button-unavailable">受付休止中</span>;
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
          style={density > 1 ? size : undefined}
          onLoad={(e) => {
            // A Retina image (name@2x / @3x) is shown at its 1x size.
            const img = e.currentTarget;
            if (density > 1)
              setSize({
                width: Math.round(img.naturalWidth / density),
                height: Math.round(img.naturalHeight / density),
              });
            onReady?.();
          }}
          onError={onReady}
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
    inlineProject<Project>(slug),
  );
  const [fallback, setFallback] = useState("");
  // Nothing is shown until the owner's own button image has loaded.
  const [ready, setReady] = useState(false);
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
  if (!p) return <span className="mini-clap-frame" aria-busy="true" />;
  return (
    <span
      ref={frame}
      className="mini-clap-frame"
      style={ready ? undefined : { visibility: "hidden" }}
      aria-busy={!ready}
    >
      <ClapControl
        project={p}
        onOpen={open}
        onReady={() => setReady(true)}
        onFail={() => {
          postToHost({ type: "creator-support:close" });
          setFallback("");
        }}
      />
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
