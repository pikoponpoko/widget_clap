// Offline only: produces reviewable recovery files; performs no remote writes.
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
const [input, destination] = process.argv.slice(2);
if (!input || !destination) {
  console.error(
    "Usage: node scripts/prepare-recovery.mjs <backup.json> <new-output-directory>",
  );
  process.exit(1);
}
const fail = (message) => {
  throw new Error(message);
};
const tables = {
  projects: [
    "id",
    "owner_id",
    "title",
    "slug",
    "description",
    "site_url",
    "allowed_origins",
    "clap_enabled",
    "message_enabled",
    "favorite_enabled",
    "thanks_enabled",
    "reply_enabled",
    "tip_enabled",
    "thanks_mode",
    "tip_url",
    "tip_legal_checked",
    "tip_terms_checked",
    "tip_privacy_checked",
    "created_at",
  ],
  claps: ["id", "project_id", "created_at", "dedupe_key"],
  messages: [
    "id",
    "project_id",
    "body",
    "created_at",
    "read_at",
    "publication_consent",
    "reply_token_hash",
    "dedupe_key",
    "blocked",
  ],
  replies: ["id", "message_id", "body", "created_at"],
  assets: [
    "id",
    "project_id",
    "kind",
    "storage_key",
    "mime",
    "size",
    "name",
    "created_at",
  ],
};
if ((await stat(input)).size > 50 * 1024 * 1024) fail("Backup exceeds 50MB");
const data = JSON.parse(await readFile(input, "utf8"));
if (Array.isArray(data.projects))
  data.projects = data.projects.map((p) => ({
    ...p,
    thanks_enabled: p.thanks_enabled ?? 1,
    reply_enabled: p.reply_enabled ?? 1,
    tip_enabled: p.tip_enabled ?? 0,
  }));
if (data.version !== 1) fail("Unsupported backup version");
for (const [table, keys] of Object.entries(tables)) {
  if (!Array.isArray(data[table])) fail(`Missing table: ${table}`);
  const seen = new Set();
  for (const row of data[table]) {
    if (
      !row ||
      typeof row !== "object" ||
      keys.some((k) => !(k in row)) ||
      Object.keys(row).some(
        (k) => !keys.includes(k) && !(table === "assets" && k === "data"),
      )
    )
      fail(`Unexpected fields in ${table}`);
    if (
      typeof row.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(row.id) ||
      seen.has(row.id)
    )
      fail(`Invalid/duplicate ID in ${table}`);
    seen.add(row.id);
    if (table === "projects" && row.owner_id !== "owner")
      fail("Only owner projects can be restored");
    for (const k of keys)
      if (
        row[k] !== null &&
        typeof row[k] !== "string" &&
        !(typeof row[k] === "number" && Number.isFinite(row[k]))
      )
        fail(`Invalid scalar: ${table}.${k}`);
  }
}
const projectIds = new Set(data.projects.map((x) => x.id)),
  messageIds = new Set(data.messages.map((x) => x.id));
if (
  [...data.claps, ...data.messages, ...data.assets].some(
    (x) => !projectIds.has(x.project_id),
  ) ||
  data.replies.some((x) => !messageIds.has(x.message_id))
)
  fail("Broken references");
const images = [];
for (const a of data.assets) {
  if (
    !/^(public|restored)\/[a-f0-9-]{36}$/.test(a.storage_key) ||
    !["image/png", "image/gif", "image/webp"].includes(a.mime) ||
    typeof a.data !== "string" ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)
  )
    fail("Invalid asset metadata");
  const bytes = Buffer.from(a.data, "base64");
  if (bytes.length !== a.size || a.size > 2097152)
    fail("Asset byte size mismatch");
  images.push({ key: a.storage_key, bytes, mime: a.mime });
}
const quote = (v) =>
  v === null
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : "'" + v.replace(/\0/g, "").replace(/'/g, "''") + "'";
const sql = [
  "-- Restore into a NEW, EMPTY D1 database after applying migrations.",
  "PRAGMA defer_foreign_keys=ON;",
];
for (const [table, keys] of Object.entries(tables))
  for (const row of data[table])
    sql.push(
      `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map((k) => quote(row[k])).join(",")});`,
    );
const output = resolve(destination);
await mkdir(output, { recursive: false, mode: 0o700 });
await writeFile(join(output, "data.sql"), sql.join("\n") + "\n", {
  mode: 0o600,
});
for (const image of images) {
  const path = join(output, "images", image.key);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, image.bytes, { mode: 0o600 });
}
await writeFile(
  join(output, "images.json"),
  JSON.stringify(
    images.map(({ key, mime }) => ({ key, mime, file: "images/" + key })),
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  `Prepared ${data.projects.length} projects, ${data.messages.length} messages and ${images.length} images in ${output}. No Cloudflare changes were made.`,
);
