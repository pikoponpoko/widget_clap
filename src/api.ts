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
export function useApi<T>(path: string) {
  const [state, setState] = useState<{
    path: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ path, data: null, error: "", loading: true });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setState((old) => ({
      path,
      data: old.path === path ? old.data : null,
      error: "",
      loading: true,
    }));
    api<T>(path)
      .then((data) => {
        if (active) setState({ path, data, error: "", loading: false });
      })
      .catch((e) => {
        if (active)
          setState({ path, data: null, error: e.message, loading: false });
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return state.path === path
    ? { ...state, refresh }
    : { data: null, error: "", loading: true, refresh };
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
