import { previewMode } from "./mode";
import { useState } from "react";
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
          {},
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
  function open(reason: EntryReason) {
    const q = new URLSearchParams(location.search),
      instance = q.get("instance"),
      host = q.get("parent_origin");
    if (instance && host && window.parent !== window) {
      try {
        const origin = new URL(host).origin;
        if (
          origin === host &&
          ["https:", "http:"].includes(new URL(host).protocol)
        ) {
          window.parent.postMessage(
            { type: "creator-support:open", project: slug, instance, reason },
            origin,
          );
          return;
        }
      } catch {}
    }
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
    <>
      <ClapControl project={p} onOpen={open} />
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
    </>
  );
}
