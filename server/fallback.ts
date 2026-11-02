// Used only while D1 cannot be read (for example after the daily free-tier
// read limit). The button keeps showing from the latest R2 backup, and claps
// are kept in R2 until D1 answers again.
import { ApiError, type Env } from "./security";
import type { Project } from "./models";

type AssetMeta = {
  id: string;
  project_id: string;
  kind: string;
  storage_key: string;
  mime: string;
  size: number;
  name: string;
  created_at: string;
  sort_order: number;
};
type Fallback = { projects: Project[]; assets: AssetMeta[] };

const SNAPSHOT_KEY = "fallback/projects.json";
const PENDING = "pending/claps/";
let memo: { at: number; data: Fallback } | null = null;

// A database error, as opposed to an answer the API gives on purpose.
export const isDbFailure = (error: unknown) => !(error instanceof ApiError);

async function load(env: Env): Promise<Fallback> {
  if (memo && Date.now() - memo.at < 10 * 60 * 1000) return memo.data;
  let data: Fallback | null = null;
  const cached = await env.BACKUPS.get(SNAPSHOT_KEY);
  if (cached) data = await cached.json<Fallback>();
  if (!data) {
    // Backup keys start with the date, so the last one listed is the newest.
    let last: string | undefined;
    let cursor: string | undefined;
    do {
      const page = await env.BACKUPS.list({ prefix: "daily/", cursor });
      for (const o of page.objects) if (!last || o.key > last) last = o.key;
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    if (!last) throw new ApiError(503, "処理できませんでした。時間をおいてお試しください。");
    const backup = await (await env.BACKUPS.get(last))!.json<{
      projects: Project[];
      assets: (AssetMeta & { data?: string })[];
    }>();
    data = {
      projects: backup.projects,
      assets: backup.assets.map(({ data: _data, ...a }) => a),
    };
    await env.BACKUPS.put(SNAPSHOT_KEY, JSON.stringify(data), {
      httpMetadata: { contentType: "application/json" },
    });
  }
  memo = { at: Date.now(), data };
  return data;
}

export async function fallbackProject(env: Env, slug: string) {
  const data = await load(env);
  const p = data.projects.find((x) => x.slug === slug && x.owner_id === "owner");
  if (!p) throw new ApiError(404, "作品が見つかりません。");
  const assets = data.assets
    .filter((a) => a.project_id === p.id)
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    )
    .map(({ storage_key: _key, ...a }) => a);
  return { project: p, assets };
}

export async function fallbackAsset(env: Env, assetId: string) {
  const data = await load(env);
  const a = data.assets.find((x) => x.id === assetId);
  if (!a || !data.projects.some((p) => p.id === a.project_id && p.owner_id === "owner"))
    throw new ApiError(404, "画像が見つかりません。");
  return a;
}

export type PendingClap = {
  id: string;
  project_id: string;
  created_at: string;
  dedupe_key: string;
  page_url: string;
  page_title: string;
  visitor: string;
  attrs: string;
};

export async function queueClap(env: Env, clap: PendingClap) {
  // The dedupe key names the object, so a repeat within the hour is kept once.
  await env.BACKUPS.put(PENDING + clap.dedupe_key + ".json", JSON.stringify(clap), {
    httpMetadata: { contentType: "application/json" },
  });
}

// Moves kept claps into D1. Stops quietly while D1 still cannot be used.
export async function drainPending(env: Env) {
  let cursor: string | undefined;
  let moved = 0;
  do {
    const page = await env.BACKUPS.list({ prefix: PENDING, cursor });
    for (const o of page.objects) {
      const body = await env.BACKUPS.get(o.key);
      if (body) {
        const c = await body.json<PendingClap>();
        try {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO claps(id,project_id,created_at,dedupe_key,page_url,page_title,visitor,attrs) VALUES(?,?,?,?,?,?,?,?)",
          )
            .bind(c.id, c.project_id, c.created_at, c.dedupe_key, c.page_url, c.page_title, c.visitor, c.attrs)
            .run();
        } catch (error) {
          console.error("pending_claps_wait", (error as Error).name);
          return moved;
        }
      }
      await env.BACKUPS.delete(o.key);
      moved++;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  if (moved) {
    await env.BACKUPS.delete(SNAPSHOT_KEY);
    memo = null;
  }
  return moved;
}

export async function hasPending(env: Env) {
  return (await env.BACKUPS.list({ prefix: PENDING, limit: 1 })).objects.length > 0;
}
