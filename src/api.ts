import { previewMode } from "./mode";
import { useCallback, useEffect, useState } from "react";
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (previewMode) {
    const { previewRequest } = await import("./preview-api");
    return (await previewRequest(path, options)) as T;
  }
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    let message = "通信できませんでした。";
    try {
      message =
        ((await response.json()) as { error?: string }).error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
export const send = <T>(path: string, data: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(data) });
// The "v" parameter only asks for fresh numbers, so a path that differs in it
// alone is the same view and keeps showing what it has while it reloads.
function viewKey(path: string) {
  return path.replace(/([?&])v=\d+&?/, "$1").replace(/[?&]$/, "");
}
const CACHE_PREFIX = "hakushu-cache:";
function readCache<T>(path: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + viewKey(path));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeCache(path: string, data: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + viewKey(path), JSON.stringify(data));
  } catch {}
}
// Removes the saved admin numbers, for when the login is no longer valid.
export function clearCache() {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
  } catch {}
}
// keep: show the previous result while a new path loads, so the page does not jump.
// An empty path loads nothing.
// persist: show the last result saved on this device at once, then refresh it.
export function useApi<T>(
  path: string,
  initial?: T | null,
  keep = false,
  persist = false,
) {
  const [state, setState] = useState<{
    path: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>(() => {
    if (initial) return { path, data: initial, error: "", loading: false };
    const saved = persist && !previewMode ? readCache<T>(path) : null;
    return { path, data: saved, error: "", loading: true };
  });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (initial && version === 0 && state.path === path && state.data) return;
    if (!path) return;
    let active = true;
    setState((old) => ({
      path,
      data:
        old.path === path || keep || viewKey(old.path) === viewKey(path)
          ? old.data
          : persist
            ? readCache<T>(path)
            : null,
      error: "",
      loading: true,
    }));
    api<T>(path)
      .then((data) => {
        if (!active) return;
        setState({ path, data, error: "", loading: false });
        if (persist && !previewMode) writeCache(path, data);
      })
      .catch((e) => {
        if (active)
          setState({ path, data: null, error: e.message, loading: false });
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  if (state.path === path) return { ...state, refresh };
  const same = keep || viewKey(state.path) === viewKey(path);
  return {
    data: same ? state.data : persist ? readCache<T>(path) : null,
    error: "",
    loading: true,
    refresh,
  };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function downloadEndpoint(path: string, name: string) {
  if (previewMode) {
    const { previewDownload } = await import("./preview-api");
    download(await previewDownload(path), name);
    return;
  }
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "ダウンロードできませんでした。");
  }
  download(await res.blob(), name);
}
export const date = (s: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(s));
export const dateTime = (s: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(s));
// Embed pages carry the public project data in the HTML, saving one request.
export function inlineProject<T extends { slug: string }>(slug: string) {
  try {
    const el = document.getElementById("hakushu-project");
    const data = el && (JSON.parse(el.textContent || "") as T);
    return data && data.slug === slug ? data : null;
  } catch {
    return null;
  }
}
