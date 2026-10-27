import { z } from "zod";
import {
  ApiError,
  id,
  now,
  projectSchema,
  validateImage,
  type Env,
} from "./security";
import type { Asset } from "./models";
export async function snapshot(env: Env) {
  const [projects, claps, messages, replies, assets] = await env.DB.batch(
    ["projects", "claps", "messages", "replies", "assets"].map((t) =>
      env.DB.prepare(`SELECT * FROM ${t} ORDER BY id`),
    ),
  );
  const images = [];
  for (const row of assets.results as unknown as Asset[]) {
    const object = await env.IMAGES.get(row.storage_key);
    if (!object)
      throw new ApiError(
        500,
        "画像が欠けているためバックアップを中止しました。",
      );
    const bytes = new Uint8Array(await object.arrayBuffer());
    let binary = "";
    for (let p = 0; p < bytes.length; p += 8192)
      binary += String.fromCharCode(...bytes.subarray(p, p + 8192));
    images.push({ ...row, data: btoa(binary) });
  }
  return {
    version: 1 as const,
    created_at: now(),
    projects: projects.results,
    claps: claps.results,
    messages: messages.results,
    replies: replies.results,
    assets: images,
  };
}
export async function scheduledBackup(env: Env) {
  const data = await snapshot(env);
  const key = `daily/${now().slice(0, 10)}-${id()}.json`;
  await env.BACKUPS.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });
  await env.DB.prepare(
    "INSERT INTO backup_runs(id,storage_key,created_at,asset_count) VALUES(?,?,?,?)",
  )
    .bind(id(), key, now(), data.assets.length)
    .run();
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const expired = await env.DB.prepare(
    "SELECT id,storage_key FROM backup_runs WHERE created_at<?",
  )
    .bind(cutoff)
    .all<{ id: string; storage_key: string }>();
  for (const run of expired.results) {
    await env.BACKUPS.delete(run.storage_key);
    await env.DB.prepare("DELETE FROM backup_runs WHERE id=?")
      .bind(run.id)
      .run();
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(
      Math.floor(Date.now() / 1000),
    ),
    env.DB.prepare("DELETE FROM audit_logs WHERE created_at<?").bind(
      new Date(Date.now() - 90 * 86400000).toISOString(),
    ),
  ]);
}
const timestamp = z.iso.datetime();
const ident = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const flag = z.union([z.literal(0), z.literal(1)]);
const project = z
  .object({
    id: ident,
    owner_id: z.literal("owner"),
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    site_url: z.string(),
    allowed_origins: z.string(),
    clap_enabled: flag,
    message_enabled: flag,
    favorite_enabled: flag,
    thanks_enabled: flag.default(1),
    reply_enabled: flag.default(1),
    tip_enabled: flag.default(0),
    thanks_mode: z.enum(["random", "fixed"]),
    thanks_order: z.enum(["random", "sequential", "fixed"]).default("random"),
    thanks_message: z.string().max(200).default(""),
    tip_url: z.string(),
    tip_legal_checked: flag,
    tip_terms_checked: flag,
    tip_privacy_checked: flag,
    ng_words: z.string().max(8000).default("[]"),
    created_at: timestamp,
  })
  .strict();
const message = z
  .object({
    id: ident,
    project_id: ident,
    body: z.string().min(1).max(2000),
    created_at: timestamp,
    read_at: timestamp.nullable(),
    publication_consent: flag,
    reply_token_hash: hash.nullable(),
    dedupe_key: hash,
    blocked: flag,
    page_url: z.string().max(500).default(""),
    page_title: z.string().max(200).default(""),
    sender_name: z.string().max(50).default(""),
  })
  .strict();
const asset = z
  .object({
    id: ident,
    project_id: ident,
    kind: z.enum(["button", "thanks"]),
    storage_key: z.string().max(240),
    mime: z.string(),
    size: z.number().int().min(1).max(2097152),
    name: z.string().max(120),
    created_at: timestamp,
    data: z.string().max(2800000),
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    created_at: timestamp,
    projects: z.array(project).max(100),
    messages: z.array(message).max(10000),
    claps: z
      .array(
        z
          .object({
            id: ident,
            project_id: ident,
            created_at: timestamp,
            dedupe_key: hash,
            visitor: z.string().max(64).default(""),
            page_url: z.string().max(500).default(""),
            page_title: z.string().max(200).default(""),
          })
          .strict(),
      )
      .max(20000),
    replies: z
      .array(
        z
          .object({
            id: ident,
            message_id: ident,
            body: z.string().min(1).max(4000),
            created_at: timestamp,
          })
          .strict(),
      )
      .max(10000),
    assets: z.array(asset).max(100),
  })
  .strict();
export async function restore(env: Env, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, "バックアップ形式が不正です。");
  const d = result.data;
  const projectIds = new Set(d.projects.map((x) => x.id)),
    messageIds = new Set(d.messages.map((x) => x.id));
  const unique = (rows: { id: string }[]) =>
    new Set(rows.map((x) => x.id)).size === rows.length;
  const distinct = <T>(rows: T[], get: (row: T) => string | null) => {
    const values = rows.map(get).filter((x) => x !== null);
    return new Set(values).size === values.length;
  };
  if (
    !distinct(d.projects, (x) => x.slug) ||
    !distinct(d.claps, (x) => x.dedupe_key) ||
    !distinct(d.messages, (x) => x.dedupe_key) ||
    !distinct(d.messages, (x) => x.reply_token_hash) ||
    !distinct(d.replies, (x) => x.message_id) ||
    !distinct(d.assets, (x) => x.storage_key)
  )
    throw new ApiError(400, "バックアップに重複したキーがあります。");
  if (
    ![d.projects, d.messages, d.claps, d.replies, d.assets].every(unique) ||
    d.projects.some((p) => !validProject(p)) ||
    [...d.messages, ...d.claps, ...d.assets].some(
      (x) => !projectIds.has(x.project_id),
    ) ||
    d.replies.some((x) => !messageIds.has(x.message_id))
  )
    throw new ApiError(400, "バックアップの参照関係・設定が不正です。");
  if (d.assets.reduce((a, x) => a + x.size, 0) > 10 * 1024 * 1024)
    throw new ApiError(400, "画像の合計は10MB以下にしてください。");
  if (
    [...d.messages, ...d.replies].reduce(
      (a, x) => a + new TextEncoder().encode(x.body).length,
      0,
    ) > 4194304
  )
    throw new ApiError(400, "感想・返信の本文の合計は4MB以下にしてください。");
  const old = await env.DB.prepare("SELECT storage_key FROM assets").all<{
    storage_key: string;
  }>();
  const uploaded: string[] = [];
  try {
    for (const a of d.assets) {
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0));
      } catch {
        throw new ApiError(400, "画像データが不正です。");
      }
      const v = validateImage(bytes);
      if (v.mime !== a.mime || bytes.length !== a.size)
        throw new ApiError(400, "画像が一致しません。");
      a.storage_key = `restored/${id()}`;
      await env.IMAGES.put(a.storage_key, bytes, {
        httpMetadata: { contentType: v.mime },
      });
      uploaded.push(a.storage_key);
    }
    const statements = [env.DB.prepare("DELETE FROM projects")];
    const insert = (table: string, rows: Record<string, unknown>[]) => {
      for (const row of rows) {
        const keys = Object.keys(row);
        statements.push(
          env.DB.prepare(
            `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
          ).bind(...Object.values(row)),
        );
      }
    };
    insert("projects", d.projects);
    insert("claps", d.claps);
    insert("messages", d.messages);
    insert("replies", d.replies);
    insert(
      "assets",
      d.assets.map(({ data, ...a }) => a),
    );
    // D1 batch is transactional: failure rolls back all database changes.
    await env.DB.batch(statements);
  } catch (error) {
    await Promise.all(uploaded.map((key) => env.IMAGES.delete(key)));
    throw error;
  }
  for (const a of old.results) await env.IMAGES.delete(a.storage_key);
  return {
    projects: d.projects.length,
    messages: d.messages.length,
    assets: d.assets.length,
  };
}
function validProject(p: z.infer<typeof project>) {
  try {
    const {
      id: _,
      owner_id: __,
      created_at: ___,
      thanks_mode: ____,
      ...fields
    } = p;
    return projectSchema.safeParse({
      ...fields,
      allowed_origins: JSON.parse(p.allowed_origins),
      ng_words: JSON.parse(p.ng_words),
      clap_enabled: !!p.clap_enabled,
      message_enabled: !!p.message_enabled,
      favorite_enabled: !!p.favorite_enabled,
      tip_legal_checked: !!p.tip_legal_checked,
      tip_terms_checked: !!p.tip_terms_checked,
      tip_privacy_checked: !!p.tip_privacy_checked,
      thanks_enabled: !!p.thanks_enabled,
      reply_enabled: !!p.reply_enabled,
      tip_enabled: !!p.tip_enabled,
    }).success;
  } catch {
    return false;
  }
}
