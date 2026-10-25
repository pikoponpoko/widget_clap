import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  BACKUPS: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT?: string;
  LOCAL_OWNER_ENABLED?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  OWNER_EMAIL?: string;
  SPAM_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TIP_LINKS_ENABLED?: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const local = (request: Request, env: Env) =>
  env.ENVIRONMENT === "local" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function assertOwner(request: Request, env: Env) {
  if (local(request, env) && env.LOCAL_OWNER_ENABLED === "true") return;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUDIENCE || !env.OWNER_EMAIL)
    throw new ApiError(
      503,
      "Owner認証が未設定です。Cloudflare Accessを設定してください。",
    );
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))
    throw new ApiError(503, "認証ドメインの設定が不正です。");
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) throw new ApiError(401, "Ownerでログインしてください。");
  try {
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    let keys = keysets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      keysets.set(issuer, keys);
    }
    const { payload } = await jwtVerify(jwt, keys, {
      issuer,
      audience: env.ACCESS_AUDIENCE,
      algorithms: ["RS256"],
    });
    if (payload.email !== env.OWNER_EMAIL || !payload.sub)
      throw new Error("owner mismatch");
  } catch {
    throw new ApiError(403, "Owner権限を確認できません。");
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin !== new URL(request.url).origin)
    throw new ApiError(403, "この送信元からは操作できません。");
}
export async function hash(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
export async function privateKey(request: Request, env: Env) {
  const secret =
    env.SPAM_SECRET ||
    (local(request, env) ? "local-development-spam-secret" : "");
  if (secret.length < 24)
    throw new ApiError(503, "スパム対策の秘密鍵が未設定です。");
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    (local(request, env) ? "loopback" : "");
  if (!ip) throw new ApiError(403, "送信元を確認できません。");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${now().slice(0, 10)}:${ip}`),
  );
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function limit(
  env: Env,
  key: string,
  max: number,
  seconds: number,
) {
  const t = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count",
  )
    .bind(key, t + seconds, t, t)
    .first<{ count: number }>();
  if (!result || result.count > max)
    throw new ApiError(429, "少し時間をおいて、もう一度お試しください。");
}
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s),
      "使用できない制御文字があります。",
    );
export const messageSchema = z
  .object({
    body: text(2000),
    publication_consent: z.boolean().default(false),
    request_id: z.uuid(),
    website: z.string().max(200).default(""),
    started_at: z.number(),
    turnstile: z.string().max(4096).optional(),
  })
  .strict();
export const replySchema = z.object({ body: text(4000) }).strict();
const https = z.url().refine((s) => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}, "HTTPSのURLを入力してください。");
export const projectSchema = z
  .object({
    title: text(80),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
    description: z.string().trim().max(240).default(""),
    site_url: z.union([https, z.literal("")]).default(""),
    allowed_origins: z
      .array(
        https.refine((s) => {
          try {
            return new URL(s).origin === s;
          } catch {
            return false;
          }
        }, "末尾スラッシュのないオリジンを指定してください。"),
      )
      .max(20)
      .default([]),
    clap_enabled: z.boolean().default(true),
    message_enabled: z.boolean().default(true),
    favorite_enabled: z.boolean().default(true),
    thanks_mode: z.enum(["fixed", "random"]).default("random"),
    tip_url: z.union([https, z.literal("")]).default(""),
    tip_legal_checked: z.boolean().default(false),
    tip_terms_checked: z.boolean().default(false),
    tip_privacy_checked: z.boolean().default(false),
  })
  .strict();
export async function jsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  max = 20000,
): Promise<T> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new ApiError(415, "JSONで送信してください。");
  const bytes = await readBounded(request, max);
  try {
    return schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new ApiError(400, "入力内容を確認してください。");
  }
}
export async function readBounded(request: Request, max: number) {
  if (Number(request.headers.get("Content-Length")) > max)
    throw new ApiError(413, "データが大きすぎます。");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "データがありません。");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > max) {
        await reader.cancel();
        throw new ApiError(413, "データが大きすぎます。");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(length);
  let p = 0;
  for (const chunk of chunks) {
    out.set(chunk, p);
    p += chunk.length;
  }
  return out;
}
export async function checkSpam(
  request: Request,
  env: Env,
  data: z.infer<typeof messageSchema>,
) {
  if (
    data.website ||
    Date.now() - data.started_at < 1500 ||
    data.started_at > Date.now() ||
    Date.now() - data.started_at > 86400000
  )
    throw new ApiError(400, "少し待ってから送信してください。");
  if (env.TURNSTILE_SECRET_KEY) {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: data.turnstile || "",
          remoteip: request.headers.get("CF-Connecting-IP") || "",
        }),
      },
    );
    const result = (await response.json()) as {
      success: boolean;
      hostname?: string;
      action?: string;
    };
    if (
      !result.success ||
      result.hostname !== new URL(request.url).hostname ||
      result.action !== "message"
    )
      throw new ApiError(400, "スパム防止の確認をやり直してください。");
  } else if (!local(request, env))
    throw new ApiError(503, "投稿のスパム防止設定が未完了です。");
}
export function validateImage(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024)
    throw new ApiError(413, "画像は2MB以下にしてください。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let mime = "",
    w = 0,
    h = 0;
  const ascii = (a: number, b: number) =>
    String.fromCharCode(...bytes.subarray(a, b));
  if (
    bytes.length >= 33 &&
    bytes[0] === 137 &&
    ascii(1, 4) === "PNG" &&
    ascii(4, 8) === "\r\n\x1a\n" &&
    ascii(12, 16) === "IHDR"
  ) {
    mime = "image/png";
    w = view.getUint32(16);
    h = view.getUint32(20);
    let p = 8,
      ended = false;
    while (p + 12 <= bytes.length) {
      const n = view.getUint32(p);
      if (n > bytes.length - p - 12) break;
      const type = ascii(p + 4, p + 8);
      p += 12 + n;
      if (type === "IEND") {
        ended = n === 0 && p === bytes.length;
        break;
      }
    }
    if (!ended) throw new ApiError(400, "PNGの構造を確認できません。");
  } else if (
    bytes.length >= 14 &&
    ["GIF87a", "GIF89a"].includes(ascii(0, 6)) &&
    bytes.at(-1) === 0x3b
  ) {
    mime = "image/gif";
    w = view.getUint16(6, true);
    h = view.getUint16(8, true);
  } else if (
    bytes.length >= 30 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WEBP" &&
    view.getUint32(4, true) + 8 === bytes.length
  ) {
    mime = "image/webp";
    const type = ascii(12, 16);
    if (type === "VP8X") {
      w = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      h = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (
      type === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 1 &&
      bytes[25] === 0x2a
    ) {
      w = view.getUint16(26, true) & 16383;
      h = view.getUint16(28, true) & 16383;
    } else if (type === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      w = (bits & 16383) + 1;
      h = ((bits >>> 14) & 16383) + 1;
    }
  }
  if (!mime || !w || !h || w > 4096 || h > 4096 || w * h > 16000000)
    throw new ApiError(
      400,
      "PNG/APNG・GIF・WebP（4096px以下）の画像を選んでください。SVGは利用できません。",
    );
  return { mime, width: w, height: h };
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function tipVisible(p: Record<string, unknown>, env: Env) {
  return (
    env.TIP_LINKS_ENABLED === "true" &&
    !!p.tip_url &&
    !!p.tip_legal_checked &&
    !!p.tip_terms_checked &&
    !!p.tip_privacy_checked
  );
}
