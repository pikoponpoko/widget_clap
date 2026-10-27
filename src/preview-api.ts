import type { Asset, Message, Project } from "./types";
type PreviewMessage = Message & {
  reply_token_hash: string | null;
  dedupe_key: string;
};
type PreviewAsset = Asset & { data?: string };
interface Store {
  version: 1;
  projects: Project[];
  messages: PreviewMessage[];
  claps: {
    project_id: string;
    created_at: string;
    key: string;
    visitor?: string;
    page_url?: string;
    page_title?: string;
  }[];
  assets: PreviewAsset[];
}
const key = "hakushu-browser-preview-v3";
function initial(): Store {
  const rows = [["sample", "example.com", ""]];
  return {
    version: 1,
    projects: rows.map(([id, title, description]) => ({
      id,
      title,
      description,
      slug: id,
      site_url: "https://example.com",
      allowed_origins: ["https://example.com"],
      clap_enabled: true,
      message_enabled: true,
      favorite_enabled: true,
      thanks_enabled: true,
      reply_enabled: true,
      tip_enabled: false,
      thanks_order: "random",
      thanks_message: "",
      tip_url: "",
      tip_legal_checked: false,
      tip_terms_checked: false,
      tip_privacy_checked: false,
      ng_words: [],
      claps: 0,
      messages: 0,
    })),
    messages: [],
    claps: [],
    assets: rows.flatMap(([id]) => [
      {
        id: "builtin-" + id,
        project_id: id,
        kind: "thanks" as const,
        mime: "image/svg+xml",
        size: 0,
        name: "お礼イラスト",
        created_at: new Date().toISOString(),
      },
      {
        id: "builtin-button-" + id,
        project_id: id,
        kind: "button" as const,
        mime: "image/gif",
        size: 0,
        name: "ボタン画像",
        created_at: new Date().toISOString(),
      },
    ]),
  };
}
function read(): Store {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initial();
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !Array.isArray(data.projects) ||
      !Array.isArray(data.messages) ||
      !Array.isArray(data.assets) ||
      !Array.isArray(data.claps)
    )
      throw new Error();
    data.projects = data.projects.map((p: Project) => ({
      ...p,
      thanks_enabled: p.thanks_enabled ?? true,
      reply_enabled: p.reply_enabled ?? true,
      tip_enabled: p.tip_enabled ?? false,
      ng_words: p.ng_words ?? [],
    }));
    return data;
  } catch {
    throw new Error(
      "ブラウザ内の保存データを読み込めません。保存設定を確認してください。",
    );
  }
}
function save(s: Store) {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    throw new Error(
      "ブラウザの保存容量が不足しています。体験版のデータ管理から整理してください。",
    );
  }
}
async function digest(s: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
const urls = new Map<string, string>();
export function previewAssetUrl(id: string) {
  if (id.startsWith("builtin-button-")) return "/buttons/push-me.gif";
  if (id.startsWith("builtin-")) return "/thanks.svg";
  if (urls.has(id)) return urls.get(id)!;
  try {
    const a = read().assets.find((a) => a.id === id);
    if (!a?.data) return "";
    const bytes = Uint8Array.from(atob(a.data), (x) => x.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: a.mime }));
    urls.set(id, url);
    return url;
  } catch {
    return "";
  }
}
function previewPage(data: { page_url?: unknown; page_title?: unknown }) {
  let page_url = "";
  try {
    const u = new URL(String(data.page_url || ""));
    if (["http:", "https:"].includes(u.protocol) && !u.username) {
      u.hash = "";
      if (u.href.length <= 500) page_url = u.href;
    }
  } catch {}
  return {
    page_url,
    page_title: String(data.page_title || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .trim()
      .slice(0, 200),
  };
}
const jst = (iso: string) =>
  new Date(Date.parse(iso) + 9 * 3600000).toISOString();
const normalizeWord = (s: string) => s.normalize("NFKC").toLowerCase();
function visitorId() {
  try {
    let v = localStorage.getItem("hakushu-browser-visitor");
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem("hakushu-browser-visitor", v);
    }
    return v;
  } catch {
    return "browser";
  }
}
const fail = (s: string): never => {
  throw new Error(s);
};
export async function previewRequest(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const u = new URL(path, "https://preview.local"),
    p = u.pathname,
    method = options.method || "GET",
    s = read();
  const data = typeof options.body === "string" ? JSON.parse(options.body) : {};
  const assets = (projectId: string) =>
    s.assets
      .filter((a) => a.project_id === projectId)
      .map(({ data, ...a }) => a);
  const project = (slug: string) =>
    s.projects.find((p) => p.slug === slug) || fail("作品が見つかりません。");
  const message = (id: string) =>
    s.messages.find((m) => m.id === id) || fail("感想が見つかりません。");
  if (p === "/owner/session")
    return {
      role: "owner",
      plan: "owner",
      local: false,
      preview: true,
      tip_links_enabled: false,
    };
  let m = p.match(/^\/public\/projects\/([^/]+)(?:\/(claps|messages))?$/);
  if (m) {
    const pr = project(decodeURIComponent(m[1]));
    if (!m[2])
      return {
        ...pr,
        assets: assets(pr.id),
        tip_url: null,
        turnstile_site_key: null,
      };
    if (m[2] === "claps") {
      if (!pr.clap_enabled) fail("拍手はお休み中です。");
      const page = previewPage(data);
      const k = pr.id + page.page_url + new Date().toISOString().slice(0, 13);
      const counted = !s.claps.some((c) => c.key === k);
      if (counted) {
        const created_at = new Date().toISOString();
        s.claps.push({
          project_id: pr.id,
          created_at,
          key: k,
          visitor: (
            await digest(visitorId() + jst(created_at).slice(0, 10))
          ).slice(0, 32),
          ...page,
        });
        save(s);
      }
      return { ok: true, counted };
    }
    if (!pr.message_enabled) fail("感想の受付はお休み中です。");
    if (
      typeof data.body !== "string" ||
      !data.body.trim() ||
      data.body.length > 2000
    )
      fail("感想は1〜2000文字で入力してください。");
    if (Date.now() - data.started_at < 1500 || data.website)
      fail("少し待ってから送信してください。");
    const dedupe = await digest(pr.id + data.request_id),
      raw = await digest("browser-preview:" + pr.id + data.request_id),
      h = await digest(raw);
    const existing = s.messages.find((x) => x.dedupe_key === dedupe);
    if (existing)
      return {
        ok: true,
        reply_token: existing.reply_token_hash === h ? raw : null,
        duplicate: true,
      };
    s.messages.push({
      id: crypto.randomUUID(),
      project_id: pr.id,
      project_title: pr.title,
      ...previewPage(data),
      sender_name: String(data.sender_name || "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, 50),
      body: data.body.trim(),
      created_at: new Date().toISOString(),
      read_at: null,
      publication_consent: data.publication_consent === true ? 1 : 0,
      blocked: (pr.ng_words || []).some(
        (w) =>
          w &&
          normalizeWord(
            String(data.sender_name || "") + "\n" + data.body,
          ).includes(normalizeWord(w)),
      )
        ? 1
        : 0,
      reply_body: null,
      replied_at: null,
      reply_link_active: 1,
      reply_token_hash:
        pr.reply_enabled === false || pr.reply_enabled === 0 ? null : h,
      dedupe_key: dedupe,
    });
    save(s);
    return {
      ok: true,
      reply_token:
        pr.reply_enabled === false || pr.reply_enabled === 0 ? null : raw,
    };
  }
  if (p === "/public/reply") {
    const h = await digest(data.token || "");
    const row =
      s.messages.find(
        (x) =>
          x.reply_token_hash === h &&
          !x.blocked &&
          s.projects.find((p) => p.id === x.project_id)?.reply_enabled !==
            false &&
          s.projects.find((p) => p.id === x.project_id)?.reply_enabled !== 0,
      ) ||
      fail(
        "このブラウザに返信が見つかりません。体験版のURLは、送信したブラウザだけで確認できます。",
      );
    return {
      title: row.project_title,
      body: row.body,
      created_at: row.created_at,
      reply_body: row.reply_body,
      replied_at: row.replied_at,
    };
  }
  if (p === "/owner/projects" && method === "GET")
    return s.projects.map((pr) => ({
      ...pr,
      claps: s.claps.filter((c) => c.project_id === pr.id).length,
      messages: s.messages.filter((m) => m.project_id === pr.id && !m.blocked)
        .length,
    }));
  if (p === "/owner/projects" && method === "POST") {
    if (!data.title?.trim() || !data.slug?.match(/^[a-z0-9][a-z0-9-]{0,59}$/))
      fail("作品名・スラッグを確認してください。");
    if (s.projects.some((p) => p.slug === data.slug))
      fail("このスラッグはすでに使用されています。");
    const id = crypto.randomUUID();
    s.projects.push({ ...data, id, claps: 0, messages: 0 });
    save(s);
    return { id };
  }
  m = p.match(/^\/owner\/projects\/([^/]+)$/);
  if (m && method === "PUT") {
    const index = s.projects.findIndex((pr) => pr.id === m![1]);
    if (index < 0) fail("作品が見つかりません。");
    if (!data.title?.trim() || !data.slug?.match(/^[a-z0-9][a-z0-9-]{0,59}$/))
      fail("作品名・スラッグを確認してください。");
    if (s.projects.some((pr) => pr.slug === data.slug && pr.id !== m![1]))
      fail("このスラッグは使用されています。");
    s.projects[index] = { ...s.projects[index], ...data };
    s.messages.forEach((x) => {
      if (x.project_id === m![1]) x.project_title = data.title;
    });
    save(s);
    return { ok: true };
  }
  if (p === "/owner/messages") {
    const status = u.searchParams.get("status"),
      projectId = u.searchParams.get("project"),
      page = Number(u.searchParams.get("page")) || 0;
    let rows = s.messages.filter(
      (x) =>
        (!projectId || x.project_id === projectId) &&
        (status === "blocked" ? x.blocked : !x.blocked),
    );
    if (status === "unread") rows = rows.filter((x) => !x.read_at);
    if (status === "unreplied") rows = rows.filter((x) => !x.reply_body);
    if (status === "replied") rows = rows.filter((x) => !!x.reply_body);
    const months = Array.from(
      rows.reduce((map, x) => {
        const month = jst(x.created_at).slice(0, 7);
        return map.set(month, (map.get(month) || 0) + 1);
      }, new Map<string, number>()),
      ([month, count]) => ({ month, count }),
    ).sort((a, b) => b.month.localeCompare(a.month));
    const month = u.searchParams.get("month");
    if (month) rows = rows.filter((x) => jst(x.created_at).startsWith(month));
    rows = rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      total: rows.length,
      months,
      page,
      items: rows
        .slice(page * 50, (page + 1) * 50)
        .map(({ reply_token_hash, dedupe_key, ...row }) => ({
          ...row,
          reply_link_active: !!reply_token_hash,
        })),
    };
  }
  if (p === "/owner/messages/bulk") {
    const ids = new Set<string>(Array.isArray(data.ids) ? data.ids : []);
    if (!ids.size) fail("感想を選んでください。");
    const rows = s.messages.filter((x) => ids.has(x.id));
    if (data.action === "delete")
      s.messages = s.messages.filter((x) => !ids.has(x.id));
    else
      for (const row of rows) {
        if (data.action === "read") row.read_at ||= new Date().toISOString();
        if (data.action === "unread") row.read_at = null;
        if (data.action === "block") row.blocked = 1;
        if (data.action === "unblock") row.blocked = 0;
      }
    save(s);
    return { ok: true, changed: rows.length };
  }
  m = p.match(/^\/owner\/messages\/([^/]+)(?:\/(reply|reply-token))?$/);
  if (m) {
    const row = message(m[1]);
    if (m[2] === "reply") {
      if (
        typeof data.body !== "string" ||
        !data.body.trim() ||
        data.body.length > 4000
      )
        fail("返信は1〜4000文字で入力してください。");
      row.reply_body = data.body.trim();
      row.replied_at = new Date().toISOString();
      row.read_at ||= row.replied_at;
    } else if (m[2] === "reply-token") {
      const token =
        data.action === "rotate" ? await digest(crypto.randomUUID()) : null;
      row.reply_token_hash = token ? await digest(token) : null;
      save(s);
      return { token };
    } else if (method === "DELETE")
      s.messages = s.messages.filter((x) => x.id !== row.id);
    else {
      if (data.read !== undefined)
        row.read_at = data.read ? new Date().toISOString() : null;
      if (data.blocked !== undefined) row.blocked = Number(!!data.blocked);
    }
    save(s);
    return { ok: true };
  }
  if (p === "/owner/stats") {
    const projectId = u.searchParams.get("project"),
      from =
        u.searchParams.get("from") ||
        new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
      to = u.searchParams.get("to") || new Date().toISOString().slice(0, 10);
    if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 365)
      fail("日付の範囲は366日以内にしてください。");
    const pageUrl = u.searchParams.get("page") || "";
    const rows = s.messages.filter(
      (m) => !m.blocked && (!projectId || m.project_id === projectId),
    );
    const onPage = (x: { page_url?: string }) =>
      !pageUrl || (x.page_url || "") === pageUrl;
    const daily = (
      items: { created_at: string; visitor?: string }[],
      distinct = false,
    ) => {
      const counts = new Map<string, Set<string> | number>();
      for (const x of items) {
        const day = jst(x.created_at).slice(0, 10);
        if (day < from || day > to) continue;
        if (distinct) {
          if (!x.visitor) continue;
          const set = (counts.get(day) as Set<string>) || new Set<string>();
          counts.set(day, set.add(x.visitor));
        } else counts.set(day, ((counts.get(day) as number) || 0) + 1);
      }
      return Array.from(counts, ([day, v]) => ({
        day,
        count: typeof v === "number" ? v : v.size,
      })).sort((a, b) => a.day.localeCompare(b.day));
    };
    const scopedClaps = s.claps.filter(
      (c) => (!projectId || c.project_id === projectId) && onPage(c),
    );
    return {
      from,
      to,
      claps: daily(scopedClaps),
      visitors: daily(scopedClaps, true),
      messages: daily(rows.filter(onPage)),
      pages: Array.from(
        s.claps
          .filter(
            (c) =>
              (!projectId || c.project_id === projectId) &&
              jst(c.created_at).slice(0, 10) >= from &&
              jst(c.created_at).slice(0, 10) <= to,
          )
          .reduce((map, c) => {
            const row = map.get(c.page_url || "") || {
              page_url: c.page_url || "",
              page_title: c.page_title || "",
              count: 0,
            };
            row.count++;
            row.page_title ||= c.page_title || "";
            return map.set(row.page_url, row);
          }, new Map<string, { page_url: string; page_title: string; count: number }>())
          .values(),
      )
        .sort((a, b) => b.count - a.count)
        .slice(0, 100),
      totals: {
        total: rows.length,
        unread: rows.filter((m) => !m.read_at).length,
        unreplied: rows.filter((m) => !m.reply_body).length,
      },
    };
  }
  if (p === "/owner/stats/hours") {
    const projectId = u.searchParams.get("project"),
      pageUrl = u.searchParams.get("page") || "",
      day =
        u.searchParams.get("day") || jst(new Date().toISOString()).slice(0, 10);
    const match = (x: {
      project_id: string;
      created_at: string;
      page_url?: string;
    }) =>
      (!projectId || x.project_id === projectId) &&
      (!pageUrl || (x.page_url || "") === pageUrl) &&
      jst(x.created_at).startsWith(day);
    const hourOf = (iso: string) => Number(jst(iso).slice(11, 13));
    const claps = s.claps.filter(match),
      messages = s.messages.filter((x) => !x.blocked && match(x));
    return {
      day,
      hours: Array.from({ length: 24 }, (_, hour) => {
        const inHour = claps.filter((c) => hourOf(c.created_at) === hour);
        return {
          hour,
          claps: inHour.length,
          visitors: new Set(inHour.map((c) => c.visitor).filter(Boolean)).size,
          messages: messages.filter((x) => hourOf(x.created_at) === hour)
            .length,
        };
      }),
    };
  }
  m = p.match(/^\/owner\/projects\/([^/]+)\/assets$/);
  if (m) {
    if (method === "GET") return assets(m[1]);
    if (!(options.body instanceof Blob)) fail("画像を選んでください。");
    const file = options.body as Blob;
    if (file.size > 2097152) fail("画像は2MB以下にしてください。");
    if (
      ![
        "image/png",
        "image/apng",
        "image/jpeg",
        "image/gif",
        "image/webp",
      ].includes(file.type)
    )
      fail("PNG/APNG・JPG・GIF・WebPを選んでください。");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const id = crypto.randomUUID(),
      kind = u.searchParams.get("kind");
    if (kind !== "button" && kind !== "thanks")
      fail("画像の種類を選んでください。");
    s.assets.push({
      id,
      project_id: m[1],
      kind: kind as "button" | "thanks",
      mime: file.type === "image/apng" ? "image/png" : file.type,
      size: file.size,
      name: "画像",
      created_at: new Date().toISOString(),
      data: btoa(binary),
    });
    save(s);
    return { id };
  }
  m = p.match(/^\/owner\/assets\/([^/]+)$/);
  if (m && method === "DELETE") {
    s.assets = s.assets.filter((a) => a.id !== m![1]);
    const url = urls.get(m[1]);
    if (url) URL.revokeObjectURL(url);
    urls.delete(m[1]);
    save(s);
    return { ok: true };
  }
  if (p === "/owner/export") {
    const projectId = u.searchParams.get("project");
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      messages: s.messages
        .filter((m) => !projectId || m.project_id === projectId)
        .map(({ reply_token_hash, dedupe_key, ...m }) => m),
    };
  }
  if (p === "/owner/backup-status") return { latest: null };
  if (p === "/owner/backup") return s;
  if (p === "/owner/delete-messages") {
    s.messages = [];
    save(s);
    return { ok: true };
  }
  if (p === "/owner/purge") {
    save(initial());
    return { ok: true };
  }
  fail(
    "この機能はサーバー接続後に利用できます。体験版では外部への送信は行いません。",
  );
}
export async function previewDownload(path: string): Promise<Blob> {
  const data = (await previewRequest(path)) as Record<string, unknown>;
  if (
    new URL(path, "https://preview.local").searchParams.get("format") === "csv"
  ) {
    const rows = data.messages as Record<string, unknown>[],
      keys = [
        "project_title",
        "page_title",
        "page_url",
        "sender_name",
        "body",
        "created_at",
        "publication_consent",
        "reply_body",
        "replied_at",
      ];
    const cell = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return new Blob(
      [
        "\uFEFF" +
          [
            keys.map(cell).join(","),
            ...rows.map((row) => keys.map((k) => cell(row[k])).join(",")),
          ].join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
  }
  return new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
}
