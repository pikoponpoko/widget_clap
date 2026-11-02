import { describe, expect, it } from "vitest";
import { app } from "../server/index";
import { drainPending } from "../server/fallback";
import { REACTION_KEYS } from "../src/reactions";

class MemoryBucket {
  store = new Map<string, string>();
  async get(key: string) {
    const v = this.store.get(key);
    return v === undefined
      ? null
      : { json: async () => JSON.parse(v), arrayBuffer: async () => new TextEncoder().encode(v).buffer, body: v };
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
  async list({ prefix = "", limit }: { prefix?: string; limit?: number }) {
    const objects = [...this.store.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
      .slice(0, limit ?? 1000)
      .map((key) => ({ key }));
    return { objects, truncated: false, cursor: undefined };
  }
}
const project = {
  id: "p1",
  owner_id: "owner",
  slug: "kazuki",
  title: "t",
  description: "",
  clap_enabled: 1,
  message_enabled: 1,
  favorite_enabled: 0,
  thanks_enabled: 1,
  reply_enabled: 0,
  tip_enabled: 0,
  reactions: JSON.stringify([REACTION_KEYS[0]]),
  ng_words: "[]",
  blocked_sites: "[]",
};
const blockedDb = {
  prepare() {
    const fail = async () => {
      throw new Error("D1_ERROR: rows read limit");
    };
    const stmt = { bind: () => stmt, first: fail, all: fail, run: fail };
    return stmt;
  },
};
function env(db: unknown, backups = new MemoryBucket()) {
  backups.store.set(
    "daily/2026-11-01-a.json",
    JSON.stringify({
      projects: [project],
      assets: [
        { id: "a1", project_id: "p1", kind: "button", storage_key: "k1", mime: "image/gif", size: 3, name: "b", created_at: "x", sort_order: 1, data: "AAAA" },
      ],
    }),
  );
  const images = new MemoryBucket();
  images.store.set("k1", "gif");
  return {
    DB: db,
    BACKUPS: backups,
    IMAGES: images,
    ASSETS: { fetch: async () => new Response("<html><head></head></html>") },
    SPAM_SECRET: "x".repeat(32),
    TURNSTILE_SECRET_KEY: "test",
  } as never;
}
const origin = "https://hakushu.example";
const clap = (e: unknown) =>
  app.fetch(
    new Request(origin + "/api/public/projects/kazuki/claps", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
      body: JSON.stringify({ page_url: "https://kazukisekiguchi.com/", page_title: "top" }),
    }),
    e as never,
  );

describe("D1 read fallback", () => {
  it("shows the button and keeps claps in R2 while D1 fails", async () => {
    const e = env(blockedDb) as unknown as { BACKUPS: MemoryBucket };
    const page = await app.fetch(new Request(origin + "/button/kazuki?parent_origin=https://kazukisekiguchi.com"), e as never);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('"slug":"kazuki"');
    const img = await app.fetch(new Request(origin + "/api/public/assets/a1"), e as never);
    expect(img.status).toBe(200);
    const res = await clap(e);
    expect(await res.json()).toEqual({ ok: true, counted: true });
    await clap(e); // same visitor, same page, same hour
    expect([...e.BACKUPS.store.keys()].filter((k) => k.startsWith("pending/claps/"))).toHaveLength(1);
  });
  it("moves kept claps into D1 once it answers, and waits while it fails", async () => {
    const e = env(blockedDb) as unknown as { BACKUPS: MemoryBucket; DB: unknown };
    await clap(e);
    expect(await drainPending(e as never)).toBe(0);
    const inserted: unknown[][] = [];
    e.DB = {
      prepare: () => {
        let args: unknown[] = [];
        const stmt = { bind: (...a: unknown[]) => ((args = a), stmt), run: async () => (inserted.push(args), { meta: { changes: 1 } }) };
        return stmt;
      },
    };
    expect(await drainPending(e as never)).toBe(1);
    expect(inserted[0][1]).toBe("p1");
    expect([...e.BACKUPS.store.keys()].some((k) => k.startsWith("pending/"))).toBe(false);
  });
  it("keeps reactions and messages in R2 and moves them in later", async () => {
    const e = env(blockedDb) as unknown as { BACKUPS: MemoryBucket; DB: unknown };
    const post = (path: string, body: unknown) =>
      app.fetch(
        new Request(origin + "/api/public/projects/kazuki/" + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
          body: JSON.stringify(body),
        }),
        e as never,
      );
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({ success: true, hostname: "hakushu.example", action: "message" })) as typeof fetch;
    const r = await post("reactions", { kind: REACTION_KEYS[0], page_url: "https://kazukisekiguchi.com/" });
    expect(r.status).toBe(200);
    const m = await post("messages", {
      body: "よかったです",
      request_id: crypto.randomUUID(),
      started_at: Date.now() - 5000,
      page_url: "https://kazukisekiguchi.com/",
    });
    globalThis.fetch = realFetch;
    expect(m.status).toBe(201);
    const keys = [...e.BACKUPS.store.keys()].filter((k) => k.startsWith("pending/"));
    expect(keys.some((k) => k.startsWith("pending/reactions/"))).toBe(true);
    expect(keys.some((k) => k.startsWith("pending/messages/"))).toBe(true);
    const sql: string[] = [];
    e.DB = {
      prepare: (q: string) => {
        sql.push(q);
        const stmt = { bind: () => stmt, run: async () => ({ meta: { changes: 1 } }) };
        return stmt;
      },
    };
    expect(await drainPending(e as never)).toBe(2);
    expect(sql.some((q) => q.startsWith("INSERT OR IGNORE INTO messages("))).toBe(true);
    expect(sql.some((q) => q.startsWith("INSERT OR IGNORE INTO reactions("))).toBe(true);
  });
  it("keeps posts in R2 when the project reads but later D1 steps fail", async () => {
    const partialDb = {
      prepare(q: string) {
        const fail = async () => {
          throw new Error("D1_ERROR: rows read limit");
        };
        const stmt = {
          bind: () => stmt,
          first: q.includes("FROM projects WHERE slug") ? async () => project : fail,
          all: q.includes("FROM assets") ? async () => ({ results: [] }) : fail,
          run: fail,
        };
        return stmt;
      },
    };
    const e = env(partialDb) as unknown as { BACKUPS: MemoryBucket };
    const post = (path: string, body: unknown) =>
      app.fetch(
        new Request(origin + "/api/public/projects/kazuki/" + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
          body: JSON.stringify(body),
        }),
        e as never,
      );
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({ success: true, hostname: "hakushu.example", action: "message" })) as typeof fetch;
    expect((await clap(e)).status).toBe(200);
    expect((await post("reactions", { kind: REACTION_KEYS[0], page_url: "https://kazukisekiguchi.com/" })).status).toBe(200);
    const m = await post("messages", {
      body: "よかったです",
      request_id: crypto.randomUUID(),
      started_at: Date.now() - 5000,
      page_url: "https://kazukisekiguchi.com/",
    });
    globalThis.fetch = realFetch;
    expect(m.status).toBe(201);
    const keys = [...e.BACKUPS.store.keys()];
    for (const t of ["claps", "reactions", "messages"])
      expect(keys.some((k) => k.startsWith(`pending/${t}/`))).toBe(true);
  });
});
