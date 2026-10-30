import { Hono } from "hono";
import { z } from "zod";
import {
  ApiError,
  assertOwner,
  assertSameOrigin,
  hash,
  id,
  now,
  local,
  privateKey,
  limit,
  jsonBody,
  readBounded,
  projectSchema,
  clapSchema,
  normalizePage,
  messageSchema,
  assetOrderSchema,
  replySchema,
  checkSpam,
  validateImage,
  csvCell,
  tipVisible,
  token,
  hasNgWord,
  jstDay,
  type Env,
} from "./security";
import { snapshot, scheduledBackup, restore } from "./backup";
import type { Project, Message, Asset } from "./models";
const app = new Hono<{ Bindings: Env }>();
const audit = (env: Env, action: string, target: string | null = null) =>
  env.DB.prepare(
    "INSERT INTO audit_logs(id,action,target_id,created_at) VALUES(?,?,?,?)",
  )
    .bind(id(), action, target, now())
    .run();
async function projectBy(env: Env, slug: string) {
  const p = await env.DB.prepare(
    "SELECT * FROM projects WHERE slug=? AND owner_id=?",
  )
    .bind(slug, "owner")
    .first<Project>();
  if (!p) throw new ApiError(404, "作品が見つかりません。");
  return p;
}
async function messageBy(env: Env, messageId: string) {
  const m = await env.DB.prepare(
    "SELECT m.* FROM messages m JOIN projects p ON p.id=m.project_id WHERE m.id=? AND p.owner_id=?",
  )
    .bind(messageId, "owner")
    .first<Message>();
  if (!m) throw new ApiError(404, "感想が見つかりません。");
  return m;
}
async function assetList(env: Env, projectId: string) {
  const rows = await env.DB.prepare(
    "SELECT id,project_id,kind,mime,size,name,created_at,sort_order FROM assets WHERE project_id=? ORDER BY sort_order,created_at,id",
  )
    .bind(projectId)
    .all();
  return rows.results;
}
function safeProject(p: Project, env: Env, assets: unknown[]) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    clap_enabled: !!p.clap_enabled,
    message_enabled: !!p.message_enabled,
    favorite_enabled: !!p.favorite_enabled,
    thanks_enabled: !!p.thanks_enabled,
    reply_enabled: !!p.reply_enabled,
    tip_enabled: !!p.tip_enabled,
    thanks_order: p.thanks_order,
    thanks_message: p.thanks_message,
    tip_url: tipVisible(p as unknown as Record<string, unknown>, env)
      ? p.tip_url
      : null,
    assets,
    turnstile_site_key: env.TURNSTILE_SITE_KEY || null,
  };
}
app.onError((err, c) => {
  if (err instanceof ApiError) {
    if (err.status === 429) c.header("Retry-After", "60");
    return c.json({ error: err.message }, err.status as 400);
  }
  console.error("request_failed", err.name);
  return c.json(
    { error: "処理できませんでした。時間をおいてお試しください。" },
    500,
  );
});
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (c.req.path.startsWith("/api/")) {
    c.header("Cache-Control", "no-store");
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; sandbox",
    );
  }
});
app.use("/api/owner/*", async (c, next) => {
  await assertOwner(c.req.raw, c.env);
  if (!["GET", "HEAD"].includes(c.req.method)) assertSameOrigin(c.req.raw);
  await next();
});
app.get("/api/owner/session", (c) =>
  c.json({
    role: "owner",
    plan: "owner",
    billing: "exempt",
    local: local(c.req.raw, c.env),
    tip_links_enabled: c.env.TIP_LINKS_ENABLED === "true",
  }),
);
app.get("/api/public/projects/:slug", async (c) => {
  const p = await projectBy(c.env, c.req.param("slug"));
  return c.json(safeProject(p, c.env, await assetList(c.env, p.id)));
});
app.post("/api/public/projects/:slug/claps", async (c) => {
  assertSameOrigin(c.req.raw);
  const p = await projectBy(c.env, c.req.param("slug"));
  if (!p.clap_enabled) throw new ApiError(403, "拍手は現在お休み中です。");
  const page = normalizePage(
    await jsonBody(c.req.raw, clapSchema, 4000),
    p.allowed_origins,
  );
  const key = await privateKey(c.req.raw, c.env);
  await limit(c.env, `clap:${key}`, 60, 60);
  const dedupe = await hash(
    `${key}:${p.id}:${page.page_url}:${now().slice(0, 13)}`,
  );
  // Daily-salted so visitors cannot be linked across days.
  const visitor = (await hash(`${key}:visitor:${jstDay()}`)).slice(0, 32);
  const result = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO claps(id,project_id,created_at,dedupe_key,page_url,page_title,visitor) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM claps)<20000",
  )
    .bind(id(), p.id, now(), dedupe, page.page_url, page.page_title, visitor)
    .run();
  if (
    !result.meta.changes &&
    !(await c.env.DB.prepare("SELECT id FROM claps WHERE dedupe_key=?")
      .bind(dedupe)
      .first())
  )
    throw new ApiError(
      503,
      "受付容量に達しています。作者の整理後にお試しください。",
    );
  return c.json({ ok: true, counted: result.meta.changes > 0 });
});
app.post("/api/public/projects/:slug/messages", async (c) => {
  assertSameOrigin(c.req.raw);
  const p = await projectBy(c.env, c.req.param("slug"));
  if (!p.message_enabled)
    throw new ApiError(403, "感想の受付は現在お休み中です。");
  const data = await jsonBody(c.req.raw, messageSchema);
  const page = normalizePage(data, p.allowed_origins);
  const key = await privateKey(c.req.raw, c.env);
  await limit(c.env, `attempt:${key}`, 40, 3600);
  const dedupe = await hash(`${p.id}:${data.request_id}`);
  const secret =
    c.env.SPAM_SECRET ||
    (local(c.req.raw, c.env) ? "local-development-spam-secret" : "");
  const replyToken = await hash(`${secret}:reply:${p.id}:${data.request_id}`);
  const existing = await c.env.DB.prepare(
    "SELECT id,reply_token_hash FROM messages WHERE dedupe_key=? AND project_id=?",
  )
    .bind(dedupe, p.id)
    .first<{ id: string; reply_token_hash: string | null }>();
  if (existing) {
    return c.json({
      ok: true,
      reply_token:
        existing.reply_token_hash === (await hash(replyToken))
          ? replyToken
          : null,
      duplicate: true,
    });
  }
  await checkSpam(c.req.raw, c.env, data);
  await limit(c.env, `message:${key}`, 5, 3600);
  // Global capacity bounds backups and prevents unbounded D1 growth in this single-owner edition.
  const result = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO messages(id,project_id,body,created_at,publication_consent,reply_token_hash,dedupe_key,page_url,page_title,sender_name,reply_wanted,blocked) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM messages)<10000 AND (SELECT COALESCE(sum(length(CAST(body AS BLOB))),0) FROM messages)+(SELECT COALESCE(sum(length(CAST(body AS BLOB))),0) FROM replies)+?<=4194304",
  )
    .bind(
      id(),
      p.id,
      data.body,
      now(),
      data.publication_consent ? 1 : 0,
      p.reply_enabled ? await hash(replyToken) : null,
      dedupe,
      page.page_url,
      page.page_title,
      data.sender_name,
      data.reply_wanted === null ? null : Number(data.reply_wanted),
      hasNgWord(
        data.sender_name + "\n" + data.body,
        JSON.parse(p.ng_words || "[]"),
      )
        ? 1
        : 0,
      new TextEncoder().encode(data.body).length,
    )
    .run();
  if (!result.meta.changes) {
    const retry = await c.env.DB.prepare(
      "SELECT id FROM messages WHERE dedupe_key=?",
    )
      .bind(dedupe)
      .first();
    if (!retry)
      throw new ApiError(
        503,
        "受付容量に達しています。作者の整理後にお試しください。",
      );
  }
  return c.json(
    { ok: true, reply_token: p.reply_enabled ? replyToken : null },
    201,
  );
});
app.post("/api/public/reply", async (c) => {
  assertSameOrigin(c.req.raw);
  const data = await jsonBody(
    c.req.raw,
    z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43,64}$/) }).strict(),
  );
  await limit(c.env, `reply:${await privateKey(c.req.raw, c.env)}`, 120, 3600);
  const m = await c.env.DB.prepare(
    "SELECT m.body,m.created_at,r.body AS reply_body,r.created_at AS replied_at,p.title FROM messages m JOIN projects p ON p.id=m.project_id LEFT JOIN replies r ON r.message_id=m.id WHERE m.reply_token_hash=? AND m.blocked=0 AND p.reply_enabled=1",
  )
    .bind(await hash(data.token))
    .first();
  if (!m)
    throw new ApiError(
      404,
      "この返信確認URLは見つからないか、無効になっています。",
    );
  return c.json(m);
});
app.get("/api/public/assets/:id", async (c) => {
  const a = await c.env.DB.prepare(
    "SELECT a.* FROM assets a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.owner_id=?",
  )
    .bind(c.req.param("id"), "owner")
    .first<Asset>();
  if (!a) throw new ApiError(404, "画像が見つかりません。");
  const object = await c.env.IMAGES.get(a.storage_key);
  if (!object) throw new ApiError(404, "画像が見つかりません。");
  return new Response(object.body, {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(a.size),
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
app.get("/api/owner/projects", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT p.*,(SELECT count(*) FROM claps c WHERE c.project_id=p.id) AS claps,(SELECT count(*) FROM messages m WHERE m.project_id=p.id AND blocked=0) AS messages FROM projects p WHERE owner_id=? ORDER BY created_at,id",
  )
    .bind("owner")
    .all();
  return c.json(
    rows.results.map((p) => ({
      ...p,
      allowed_origins: JSON.parse(p.allowed_origins as string),
      ng_words: JSON.parse((p.ng_words as string) || "[]"),
    })),
  );
});
app.post("/api/owner/projects", async (c) => {
  const data = await jsonBody(c.req.raw, projectSchema);
  const keys = Object.keys(data),
    values = Object.entries(data).map(([k, v]) =>
      k === "allowed_origins" || k === "ng_words"
        ? JSON.stringify(v)
        : typeof v === "boolean"
          ? Number(v)
          : v,
    );
  const projectId = id();
  try {
    await c.env.DB.prepare(
      `INSERT INTO projects(id,${keys.join(",")}) SELECT ?,${keys.map(() => "?").join(",")} WHERE (SELECT count(*) FROM projects)<100`,
    )
      .bind(projectId, ...values)
      .run();
  } catch {
    throw new ApiError(409, "このスラッグはすでに使用されています。");
  }
  const p = await c.env.DB.prepare("SELECT id FROM projects WHERE id=?")
    .bind(projectId)
    .first();
  if (!p) throw new ApiError(400, "作品は100件までです。");
  await audit(c.env, "project.create", projectId);
  return c.json({ id: projectId }, 201);
});
app.put("/api/owner/projects/:id", async (c) => {
  const p = await c.env.DB.prepare(
    "SELECT id FROM projects WHERE id=? AND owner_id=?",
  )
    .bind(c.req.param("id"), "owner")
    .first();
  if (!p) throw new ApiError(404, "作品が見つかりません。");
  const data = await jsonBody(c.req.raw, projectSchema);
  const keys = Object.keys(data),
    values = Object.entries(data).map(([k, v]) =>
      k === "allowed_origins" || k === "ng_words"
        ? JSON.stringify(v)
        : typeof v === "boolean"
          ? Number(v)
          : v,
    );
  try {
    await c.env.DB.prepare(
      `UPDATE projects SET ${keys.map((k) => k + "=?").join(",")} WHERE id=? AND owner_id=?`,
    )
      .bind(...values, c.req.param("id"), "owner")
      .run();
  } catch {
    throw new ApiError(409, "このスラッグはすでに使用されています。");
  }
  await audit(c.env, "project.update", c.req.param("id"));
  return c.json({ ok: true });
});
app.get("/api/owner/messages", async (c) => {
  const project = c.req.query("project"),
    status = c.req.query("status");
  const where = ["p.owner_id=?"];
  const values: unknown[] = ["owner"];
  if (project) {
    where.push("m.project_id=?");
    values.push(project);
  }
  if (status === "unread") where.push("m.read_at IS NULL AND m.blocked=0");
  if (status === "unreplied") where.push("r.id IS NULL AND m.blocked=0");
  if (status === "replied") where.push("r.id IS NOT NULL AND m.blocked=0");
  if (status === "blocked") where.push("m.blocked=1");
  else where.push("m.blocked=0");
  const monthWhere = [...where],
    monthValues = [...values];
  const month = c.req.query("month");
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new ApiError(400, "月の指定が正しくありません。");
    where.push("strftime('%Y-%m',m.created_at,'+9 hours')=?");
    values.push(month);
  }
  const page = Math.max(0, Math.min(10000, Number(c.req.query("page")) || 0));
  const clause = where.join(" AND ");
  const [rows, total, months] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT m.id,m.project_id,m.body,m.sender_name,m.reply_wanted,m.created_at,m.page_url,m.page_title,m.read_at,m.publication_consent,m.blocked,(m.reply_token_hash IS NOT NULL) AS reply_link_active,p.title AS project_title,r.body AS reply_body,r.created_at AS replied_at FROM messages m JOIN projects p ON p.id=m.project_id LEFT JOIN replies r ON r.message_id=m.id WHERE ${clause} ORDER BY m.created_at DESC,m.id DESC LIMIT 50 OFFSET ?`,
    ).bind(...values, page * 50),
    c.env.DB.prepare(
      `SELECT count(*) AS total FROM messages m JOIN projects p ON p.id=m.project_id LEFT JOIN replies r ON r.message_id=m.id WHERE ${clause}`,
    ).bind(...values),
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m',m.created_at,'+9 hours') AS month,count(*) AS count FROM messages m JOIN projects p ON p.id=m.project_id LEFT JOIN replies r ON r.message_id=m.id WHERE ${monthWhere.join(" AND ")} GROUP BY month ORDER BY month DESC`,
    ).bind(...monthValues),
  ]);
  return c.json({
    items: rows.results,
    total: (total.results[0] as { total: number }).total,
    page,
    months: months.results,
  });
});
app.patch("/api/owner/messages/:id", async (c) => {
  const m = await messageBy(c.env, c.req.param("id"));
  const data = await jsonBody(
    c.req.raw,
    z
      .object({ read: z.boolean().optional(), blocked: z.boolean().optional() })
      .strict(),
  );
  await c.env.DB.prepare("UPDATE messages SET read_at=?,blocked=? WHERE id=?")
    .bind(
      data.read === undefined ? m.read_at : data.read ? now() : null,
      data.blocked === undefined ? m.blocked : Number(data.blocked),
      m.id,
    )
    .run();
  await audit(c.env, "message.update", m.id);
  return c.json({ ok: true });
});
app.put("/api/owner/messages/:id/reply", async (c) => {
  const m = await messageBy(c.env, c.req.param("id"));
  if (m.blocked) throw new ApiError(400, "非表示の感想には返信できません。");
  const data = await jsonBody(c.req.raw, replySchema);
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO replies(id,message_id,body,created_at) SELECT ?,?,?,? WHERE (SELECT COALESCE(sum(length(CAST(body AS BLOB))),0) FROM messages)+(SELECT COALESCE(sum(length(CAST(body AS BLOB))),0) FROM replies WHERE message_id<>?)+?<=4194304 ON CONFLICT(message_id) DO UPDATE SET body=excluded.body,created_at=excluded.created_at",
    ).bind(
      id(),
      m.id,
      data.body,
      now(),
      m.id,
      new TextEncoder().encode(data.body).length,
    ),
    c.env.DB.prepare(
      "UPDATE messages SET read_at=COALESCE(read_at,?) WHERE id=?",
    ).bind(now(), m.id),
  ]);
  if (!results[0].meta.changes)
    throw new ApiError(
      503,
      "感想・返信の保存容量に達しています。データを書き出して整理してください。",
    );
  await audit(c.env, "reply.save", m.id);
  return c.json({ ok: true });
});
app.post("/api/owner/messages/:id/reply-token", async (c) => {
  const m = await messageBy(c.env, c.req.param("id"));
  const data = await jsonBody(
    c.req.raw,
    z.object({ action: z.enum(["revoke", "rotate"]) }).strict(),
  );
  const raw = data.action === "rotate" ? token() : null;
  await c.env.DB.prepare("UPDATE messages SET reply_token_hash=? WHERE id=?")
    .bind(raw ? await hash(raw) : null, m.id)
    .run();
  await audit(c.env, "reply-token." + data.action, m.id);
  return c.json({ token: raw });
});
app.post("/api/owner/messages/bulk", async (c) => {
  const data = await jsonBody(
    c.req.raw,
    z
      .object({
        ids: z.array(z.string().min(1).max(64)).min(1).max(200),
        action: z.enum(["read", "unread", "block", "unblock", "delete"]),
      })
      .strict(),
  );
  const marks = data.ids.map(() => "?").join(",");
  const sql = {
    read: `UPDATE messages SET read_at=COALESCE(read_at,?) WHERE id IN (${marks})`,
    unread: `UPDATE messages SET read_at=NULL WHERE id IN (${marks})`,
    block: `UPDATE messages SET blocked=1 WHERE id IN (${marks})`,
    unblock: `UPDATE messages SET blocked=0 WHERE id IN (${marks})`,
    delete: `DELETE FROM messages WHERE id IN (${marks})`,
  }[data.action];
  const result = await c.env.DB.prepare(sql)
    .bind(...(data.action === "read" ? [now()] : []), ...data.ids)
    .run();
  await audit(c.env, "message.bulk." + data.action, String(data.ids.length));
  return c.json({ ok: true, changed: result.meta.changes });
});
app.delete("/api/owner/messages/:id", async (c) => {
  const m = await messageBy(c.env, c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM messages WHERE id=?").bind(m.id).run();
  await audit(c.env, "message.delete", m.id);
  return c.json({ ok: true });
});
app.get("/api/owner/projects/:id/assets", async (c) => {
  const p = await c.env.DB.prepare(
    "SELECT id FROM projects WHERE id=? AND owner_id=?",
  )
    .bind(c.req.param("id"), "owner")
    .first();
  if (!p) throw new ApiError(404, "作品が見つかりません。");
  return c.json(await assetList(c.env, c.req.param("id")));
});
app.post("/api/owner/projects/:id/assets", async (c) => {
  const p = await c.env.DB.prepare(
    "SELECT id FROM projects WHERE id=? AND owner_id=?",
  )
    .bind(c.req.param("id"), "owner")
    .first();
  if (!p) throw new ApiError(404, "作品が見つかりません。");
  const kind = c.req.query("kind");
  if (kind !== "button" && kind !== "thanks")
    throw new ApiError(400, "画像の用途を選択してください。");
  const bytes = await readBounded(c.req.raw, 2 * 1024 * 1024);
  const v = validateImage(bytes);
  const assetId = id();
  const key = `public/${assetId}`;
  await c.env.IMAGES.put(key, bytes, { httpMetadata: { contentType: v.mime } });
  try {
    const result = await c.env.DB.prepare(
      "INSERT INTO assets(id,project_id,kind,storage_key,mime,size,name,created_at,sort_order) SELECT ?,?,?,?,?,?,?,?,(SELECT COALESCE(max(sort_order),0)+1 FROM assets WHERE project_id=?) WHERE (SELECT COALESCE(sum(size),0) FROM assets)+?<=10485760 AND (SELECT count(*) FROM assets)<100 AND (SELECT count(*) FROM assets WHERE project_id=? AND kind=?)<?",
    )
      .bind(
        assetId,
        c.req.param("id"),
        kind,
        key,
        v.mime,
        bytes.length,
        "画像",
        now(),
        c.req.param("id"),
        bytes.length,
        c.req.param("id"),
        kind,
        kind === "button" ? 1 : 20,
      )
      .run();
    if (!result.meta.changes)
      throw new ApiError(
        400,
        "画像の上限です。ボタン1枚・お礼20枚／作品、全体10MB・100枚までです。古い画像を削除してください。",
      );
  } catch (error) {
    await c.env.IMAGES.delete(key);
    throw error;
  }
  await audit(c.env, "asset.upload", assetId);
  return c.json({ id: assetId }, 201);
});
app.put("/api/owner/projects/:id/assets/order", async (c) => {
  const { ids } = await jsonBody(c.req.raw, assetOrderSchema);
  const owned = await c.env.DB.prepare(
    "SELECT a.id FROM assets a JOIN projects p ON p.id=a.project_id WHERE a.project_id=? AND p.owner_id=?",
  )
    .bind(c.req.param("id"), "owner")
    .all<{ id: string }>();
  const known = new Set(owned.results.map((r) => r.id));
  if (!ids.every((x) => known.has(x)))
    throw new ApiError(404, "画像が見つかりません。");
  if (ids.length)
    await c.env.DB.batch(
      ids.map((assetId, i) =>
        c.env.DB.prepare("UPDATE assets SET sort_order=? WHERE id=?").bind(
          i + 1,
          assetId,
        ),
      ),
    );
  await audit(c.env, "asset.reorder", c.req.param("id"));
  return c.json({ ok: true });
});
app.delete("/api/owner/assets/:id", async (c) => {
  const a = await c.env.DB.prepare(
    "SELECT a.* FROM assets a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.owner_id=?",
  )
    .bind(c.req.param("id"), "owner")
    .first<Asset>();
  if (!a) throw new ApiError(404, "画像が見つかりません。");
  await c.env.IMAGES.delete(a.storage_key);
  await c.env.DB.prepare("DELETE FROM assets WHERE id=?").bind(a.id).run();
  await audit(c.env, "asset.delete", a.id);
  return c.json({ ok: true });
});
app.get("/api/owner/stats", async (c) => {
  const project = c.req.query("project");
  const start =
      c.req.query("from") ||
      jstDay(new Date(Date.now() - 29 * 86400000).toISOString()),
    end = c.req.query("to") || jstDay();
  if (
    !z.iso.date().safeParse(start).success ||
    !z.iso.date().safeParse(end).success ||
    start > end ||
    (Date.parse(end) - Date.parse(start)) / 86400000 > 365
  )
    throw new ApiError(
      400,
      "日付の範囲は正しい日付で366日以内にしてください。",
    );
  const pageUrl = c.req.query("page") || "";
  const suffix = project ? " AND project_id=?" : "",
    range = [
      new Date(Date.parse(start + "T00:00:00+09:00")).toISOString(),
      new Date(Date.parse(end + "T23:59:59.999+09:00")).toISOString(),
    ],
    args = project ? [...range, project] : range,
    pageSuffix = suffix + (pageUrl ? " AND page_url=?" : ""),
    pageArgs = pageUrl ? [...args, pageUrl] : args,
    day = "strftime('%Y-%m-%d',created_at,'+9 hours')";
  const [claps, messages, totals, pages, visitors] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT ${day} AS day,count(*) AS count FROM claps WHERE created_at>=? AND created_at<=?${pageSuffix} GROUP BY day ORDER BY day`,
    ).bind(...pageArgs),
    c.env.DB.prepare(
      `SELECT ${day} AS day,count(*) AS count FROM messages WHERE blocked=0 AND created_at>=? AND created_at<=?${pageSuffix} GROUP BY day ORDER BY day`,
    ).bind(...pageArgs),
    c.env.DB.prepare(
      `SELECT count(*) AS total,sum(read_at IS NULL) AS unread,sum(NOT EXISTS(SELECT 1 FROM replies r WHERE r.message_id=messages.id)) AS unreplied FROM messages WHERE blocked=0${suffix}`,
    ).bind(...(project ? [project] : [])),
    c.env.DB.prepare(
      `SELECT page_url,max(page_title) AS page_title,count(*) AS count FROM claps WHERE created_at>=? AND created_at<=?${suffix} GROUP BY page_url ORDER BY count DESC,page_url LIMIT 100`,
    ).bind(...args),
    c.env.DB.prepare(
      `SELECT ${day} AS day,count(DISTINCT visitor) AS count FROM claps WHERE visitor<>'' AND created_at>=? AND created_at<=?${pageSuffix} GROUP BY day ORDER BY day`,
    ).bind(...pageArgs),
  ]);
  return c.json({
    claps: claps.results,
    messages: messages.results,
    visitors: visitors.results,
    totals: totals.results[0],
    pages: pages.results,
    from: start,
    to: end,
  });
});
app.get("/api/owner/stats/hours", async (c) => {
  const project = c.req.query("project"),
    pageUrl = c.req.query("page") || "",
    day = c.req.query("day") || jstDay();
  if (!z.iso.date().safeParse(day).success)
    throw new ApiError(400, "日付が正しくありません。");
  const args: unknown[] = [
    new Date(Date.parse(day + "T00:00:00+09:00")).toISOString(),
    new Date(Date.parse(day + "T23:59:59.999+09:00")).toISOString(),
  ];
  let suffix = "";
  if (project) {
    suffix += " AND project_id=?";
    args.push(project);
  }
  if (pageUrl) {
    suffix += " AND page_url=?";
    args.push(pageUrl);
  }
  const hour = "CAST(strftime('%H',created_at,'+9 hours') AS INTEGER)";
  const [claps, messages] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT ${hour} AS hour,count(*) AS claps,count(DISTINCT NULLIF(visitor,'')) AS visitors FROM claps WHERE created_at>=? AND created_at<=?${suffix} GROUP BY hour`,
    ).bind(...args),
    c.env.DB.prepare(
      `SELECT ${hour} AS hour,count(*) AS messages FROM messages WHERE blocked=0 AND created_at>=? AND created_at<=?${suffix} GROUP BY hour`,
    ).bind(...args),
  ]);
  const c2 = claps.results as {
      hour: number;
      claps: number;
      visitors: number;
    }[],
    m2 = messages.results as { hour: number; messages: number }[];
  return c.json({
    day,
    hours: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      claps: c2.find((x) => x.hour === h)?.claps || 0,
      visitors: c2.find((x) => x.hour === h)?.visitors || 0,
      messages: m2.find((x) => x.hour === h)?.messages || 0,
    })),
  });
});
app.get("/api/owner/export", async (c) => {
  const project = c.req.query("project");
  const sql =
    "SELECT m.id,m.project_id,p.title AS project_title,m.page_url,m.page_title,m.sender_name,m.body,m.created_at,m.reply_wanted,m.publication_consent,m.blocked,r.body AS reply_body,r.created_at AS replied_at FROM messages m JOIN projects p ON p.id=m.project_id LEFT JOIN replies r ON r.message_id=m.id WHERE p.owner_id=?" +
    (project ? " AND m.project_id=?" : "") +
    " ORDER BY m.created_at,m.id";
  const rows = await c.env.DB.prepare(sql)
    .bind("owner", ...(project ? [project] : []))
    .all();
  await audit(
    c.env,
    "export." + (c.req.query("format") === "csv" ? "csv" : "json"),
  );
  if (c.req.query("format") === "csv") {
    const keys = [
      "id",
      "project_id",
      "project_title",
      "page_title",
      "page_url",
      "sender_name",
      "body",
      "created_at",
      "reply_wanted",
      "publication_consent",
      "blocked",
      "reply_body",
      "replied_at",
    ];
    c.header("Content-Disposition", 'attachment; filename="messages.csv"');
    return c.body(
      "\uFEFF" +
        [
          keys.map(csvCell).join(","),
          ...rows.results.map((row) =>
            keys.map((k) => csvCell(row[k])).join(","),
          ),
        ].join("\r\n"),
      200,
      { "Content-Type": "text/csv; charset=utf-8" },
    );
  }
  return c.json(
    { version: 1, exported_at: now(), messages: rows.results },
    200,
    { "Content-Disposition": 'attachment; filename="messages.json"' },
  );
});
app.get("/api/owner/backup", async (c) => {
  const data = await snapshot(c.env);
  await audit(c.env, "backup.download");
  return c.json(data, 200, {
    "Content-Disposition": 'attachment; filename="support-backup.json"',
  });
});
app.get("/api/owner/backup-status", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT created_at,asset_count FROM backup_runs ORDER BY created_at DESC LIMIT 1",
  ).all();
  return c.json({ latest: rows.results[0] || null });
});
app.post("/api/owner/backup-now", async (c) => {
  await scheduledBackup(c.env);
  await audit(c.env, "backup.create");
  return c.json({ ok: true });
});
app.post("/api/owner/restore", async (c) => {
  const data = await jsonBody(
    c.req.raw,
    z
      .object({ confirmation: z.literal("復元する"), backup: z.unknown() })
      .strict(),
    50 * 1024 * 1024,
  );
  const result = await restore(c.env, data.backup);
  await audit(c.env, "backup.restore");
  return c.json(result);
});
app.post("/api/owner/delete-messages", async (c) => {
  await jsonBody(
    c.req.raw,
    z.object({ confirmation: z.literal("感想を全件削除") }).strict(),
  );
  await c.env.DB.prepare("DELETE FROM messages").run();
  await audit(c.env, "messages.delete-all");
  return c.json({ ok: true });
});
app.post("/api/owner/purge", async (c) => {
  await jsonBody(
    c.req.raw,
    z
      .object({ confirmation: z.literal("バックアップを含む全データを削除") })
      .strict(),
  );
  for (const bucket of [c.env.IMAGES, c.env.BACKUPS]) {
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ cursor });
      if (page.objects.length)
        await bucket.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  await c.env.DB.batch(
    ["projects", "rate_limits", "audit_logs", "backup_runs"].map((t) =>
      c.env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  return c.json({ ok: true });
});
function pageCsp(ancestors: string) {
  return `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors ${ancestors}`;
}
async function embedPage(c: import("hono").Context<{ Bindings: Env }>) {
  let p: Awaited<ReturnType<typeof projectBy>>;
  try {
    p = await projectBy(c.env, c.req.param("slug") || "");
  } catch (error) {
    // An embedded frame must stay blank rather than show an API error as text.
    if (error instanceof ApiError && error.status === 404)
      return c.html('<!doctype html><meta charset="utf-8">', 404, {
        "Content-Security-Policy": pageCsp("*"),
        "Cache-Control": "no-store",
      });
    throw error;
  }
  const origins = JSON.parse(p.allowed_origins) as string[];
  const response = await c.env.ASSETS.fetch(
    new Request(new URL("/", c.req.url), c.req.raw),
  );
  const out = new Response(response.body, response);
  out.headers.set(
    "Content-Security-Policy",
    pageCsp(["'self'", ...origins].join(" ")),
  );
  out.headers.delete("X-Frame-Options");
  out.headers.set("Cache-Control", "no-store");
  return out;
}
// The embed demo belongs to the browser trial; the Owner site starts at the admin screen.
app.get("/", (c) => c.redirect("/admin"));
app.get("/demo", (c) => c.redirect("/admin"));
app.get("/about", (c) => c.redirect("/admin"));
app.get("/widget/:slug", embedPage);
app.get("/button/:slug", embedPage);
app.all("/api/*", (c) => c.json({ error: "APIが見つかりません。" }, 404));
app.get("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const out = new Response(res.body, res);
  out.headers.set("Content-Security-Policy", pageCsp("'none'"));
  out.headers.set("X-Frame-Options", "DENY");
  return out;
});
export { app };
export default {
  fetch: app.fetch,
  scheduled: async (
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ) => {
    ctx.waitUntil(scheduledBackup(env));
  },
};
