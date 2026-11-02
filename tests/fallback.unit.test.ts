import { describe, expect, it } from "vitest";
import { app } from "../server/index";
import { drainPending } from "../server/fallback";

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
  reactions: "[]",
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
});
