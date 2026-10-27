import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  ApiError,
  assertOwner,
  assertSameOrigin,
  csvCell,
  hash,
  local,
  messageSchema,
  projectSchema,
  tipVisible,
  validateImage,
  type Env,
  hasNgWord,
  jstDay,
} from "../server/security";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { makePdf, validatePrint, wrapText } from "../src/pdf";
import { defaultPrint } from "../src/print-options";
const env = {} as Env;
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aT8AAAAASUVORK5CYII=",
    "base64",
  ),
);
afterEach(() => vi.unstubAllGlobals());
describe("Owner boundary", () => {
  it("requires production configuration", async () => {
    await expect(
      assertOwner(new Request("https://example.com/api/owner/session"), env),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("never uses local bypass on deployed hosts", async () => {
    await expect(
      assertOwner(new Request("https://widget.example.com"), {
        ...env,
        ENVIRONMENT: "local",
        LOCAL_OWNER_ENABLED: "true",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("requires an explicit local flag", async () => {
    await expect(
      assertOwner(new Request("http://localhost:8787"), {
        ...env,
        ENVIRONMENT: "local",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("allows a flagged loopback development session", async () => {
    await expect(
      assertOwner(new Request("http://127.0.0.1:8787"), {
        ...env,
        ENVIRONMENT: "local",
        LOCAL_OWNER_ENABLED: "true",
      }),
    ).resolves.toBeUndefined();
  });
  it("verifies JWT signature, audience, expiry and owner email", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test";
    jwk.alg = "RS256";
    jwk.use = "sig";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ keys: [jwk] })),
    );
    const e = {
      ...env,
      ACCESS_TEAM_DOMAIN: "unit-test.cloudflareaccess.com",
      ACCESS_AUDIENCE: "owner-aud",
      OWNER_EMAIL: "owner@example.com",
    };
    const signed = (email: string, audience = "owner-aud", expiration = "1h") =>
      new SignJWT({ email })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setSubject("owner-id")
        .setIssuer("https://unit-test.cloudflareaccess.com")
        .setAudience(audience)
        .setExpirationTime(expiration)
        .sign(privateKey);
    const req = (jwt: string) =>
      new Request("https://example.com", {
        headers: { "Cf-Access-Jwt-Assertion": jwt },
      });
    await expect(
      assertOwner(req(await signed("owner@example.com")), e),
    ).resolves.toBeUndefined();
    await expect(
      assertOwner(req(await signed("other@example.com")), e),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertOwner(req(await signed("owner@example.com", "wrong-aud")), e),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertOwner(req(await signed("owner@example.com", "owner-aud", "0s")), e),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertOwner(req("forged.invalid.jwt"), e),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects cross-origin and missing-origin mutations", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://example.com", {
          headers: { Origin: "https://evil.example" },
        }),
      ),
    ).toThrow(ApiError);
    expect(() => assertSameOrigin(new Request("https://example.com"))).toThrow(
      ApiError,
    );
    expect(() =>
      assertSameOrigin(
        new Request("https://example.com", {
          headers: { Origin: "https://example.com" },
        }),
      ),
    ).not.toThrow();
  });
});
describe("untrusted content", () => {
  it("stores permission as opt-in", () => {
    expect(
      messageSchema.parse({
        body: "ありがとう",
        request_id: crypto.randomUUID(),
        started_at: Date.now(),
      }).publication_consent,
    ).toBe(false);
  });
  it("accepts empty optional URLs during a backup round trip", () => {
    expect(
      projectSchema.safeParse({
        title: "作品",
        slug: "work",
        site_url: "",
        tip_url: "",
      }).success,
    ).toBe(true);
    expect(
      projectSchema.safeParse({
        title: "作品",
        slug: "work",
        site_url: "bad url",
      }).success,
    ).toBe(false);
  });
  it("rejects overlong messages and unsafe URLs", () => {
    expect(
      messageSchema.safeParse({
        body: "あ".repeat(2001),
        request_id: crypto.randomUUID(),
        started_at: Date.now(),
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        title: "作品",
        slug: "works",
        tip_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        title: "作品",
        slug: "works",
        allowed_origins: ["https://example.com/path"],
      }).success,
    ).toBe(false);
  });
  it("requires server flag and all payment reviews", () => {
    const p = {
      tip_enabled: 1,
      tip_url: "https://example.com",
      tip_legal_checked: 1,
      tip_terms_checked: 1,
      tip_privacy_checked: 1,
    };
    expect(tipVisible(p, env)).toBe(false);
    expect(tipVisible(p, { ...env, TIP_LINKS_ENABLED: "true" })).toBe(true);
    expect(
      tipVisible(
        { ...p, tip_privacy_checked: 0 },
        { ...env, TIP_LINKS_ENABLED: "true" },
      ),
    ).toBe(false);
  });
  it("escapes spreadsheet formulas and embedded quotes", () => {
    expect(csvCell("=SUM(1,2)")).toBe('"\'=SUM(1,2)"');
    expect(csvCell(" \t+cmd")).toMatch(/^"'/);
    expect(csvCell('a"b\nc')).toBe('"a""b\nc"');
    expect(csvCell("ありがとう")).toBe('"ありがとう"');
  });
  it("validates image type by bytes, rejects SVG and malformed/oversize images", () => {
    expect(validateImage(png)).toEqual({
      mime: "image/png",
      width: 1,
      height: 1,
    });
    for (const value of [
      new TextEncoder().encode('<svg onload="alert(1)"/>'),
      png.slice(0, 40),
      new Uint8Array(2097153),
    ])
      expect(() => validateImage(value)).toThrow(ApiError);
    const giant = png.slice();
    new DataView(giant.buffer).setUint32(16, 9999);
    expect(() => validateImage(giant)).toThrow(ApiError);
  });
  it("reads JPEG size from the SOF segment", () => {
    // SOI, APP0 (2-byte body), SOF0 with height 3 and width 5, EOI.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b,
      0x08, 0x00, 0x03, 0x00, 0x05, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
    ]);
    expect(validateImage(jpeg)).toEqual({
      mime: "image/jpeg",
      width: 5,
      height: 3,
    });
    expect(() => validateImage(jpeg.slice(0, 8))).toThrow(ApiError);
  });
  it("hashes reply tokens without preserving plaintext", async () => {
    const t = "private-reply-token";
    const h = await hash(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(await hash(t)).toBe(h);
  });
});
describe("print geometry and text", () => {
  it("embeds the Japanese font and splits long messages into multiple cards", async () => {
    const font = await readFile(
      new URL("../public/fonts/NotoSansJP-Regular.ttf", import.meta.url),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(font)),
    );
    const bytes = await makePdf(
      [
        {
          id: "long",
          project_id: "work",
          project_title: "作品",
          body: "ありがとう。".repeat(300),
          created_at: new Date().toISOString(),
          read_at: null,
          publication_consent: 0,
          blocked: 0,
          reply_body: null,
          replied_at: null,
        },
      ],
      { ...defaultPrint, layout: "card" },
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(
      pdf.context
        .enumerateIndirectObjects()
        .some(
          ([, o]) => o instanceof PDFDict && o.has(PDFName.of("FontFile2")),
        ),
    ).toBe(true);
  });
  it("prints one message per L-size (89×127mm) sheet", async () => {
    const font = await readFile("public/fonts/NotoSansJP-Regular.ttf");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(font)),
    );
    const message = {
      id: "l",
      project_id: "work",
      project_title: "作品",
      body: "L判の感想です。",
      created_at: new Date().toISOString(),
      read_at: null,
      publication_consent: 0,
      blocked: 0,
      reply_body: null,
      replied_at: null,
    };
    const pdf = await PDFDocument.load(
      await makePdf([message, { ...message, id: "l2" }], {
        ...defaultPrint,
        layout: "l",
      }),
    );
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round((width / 72) * 25.4)).toBe(89);
    expect(Math.round((height / 72) * 25.4)).toBe(127);
  });
  it("fits the default ten cards on A4", () =>
    expect(() => validatePrint(defaultPrint)).not.toThrow());
  it("rejects layouts outside the paper bounds", () => {
    expect(() => validatePrint({ ...defaultPrint, gapY: 10 })).toThrow();
    expect(() => validatePrint({ ...defaultPrint, offsetX: 20 })).toThrow();
  });
  it("splits long text and retains explicit blank lines", () => {
    const lines = wrapText(
      "日本語の感想\n\nありがとう",
      4,
      (s) => Array.from(s).length,
    );
    expect(lines).toEqual(["日本語の", "感想", "", "ありがと", "う"]);
    expect(lines.join("")).toBe("日本語の感想ありがとう");
  });
  it("does not split a combining grapheme", () => {
    expect(
      wrapText(
        "か\u3099か\u3099",
        1,
        (s) =>
          Array.from(
            new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(s),
          ).length,
      ),
    ).toEqual(["か\u3099", "か\u3099"]);
  });
});

describe("integrated widget feature policy", () => {
  it("defaults tips off even when the server and provider checks are ready", () => {
    const p = {
      tip_enabled: 0,
      tip_url: "https://example.com",
      tip_legal_checked: 1,
      tip_terms_checked: 1,
      tip_privacy_checked: 1,
    };
    expect(tipVisible(p, { ...env, TIP_LINKS_ENABLED: "true" })).toBe(false);
  });
  it("keeps thank-you and private reply available while leaving payments opt-in", () => {
    const p = projectSchema.parse({ title: "作品", slug: "work" });
    expect([p.thanks_enabled, p.reply_enabled, p.tip_enabled]).toEqual([
      true,
      true,
      false,
    ]);
  });
});
describe("NG keywords and Japan time", () => {
  it("matches NG words across width and case", () => {
    expect(hasNgWord("ｽﾊﾟﾑです", ["スパム"])).toBe(true);
    expect(hasNgWord("SPAM!", ["spam"])).toBe(true);
    expect(hasNgWord("よかったです", ["スパム"])).toBe(false);
    expect(hasNgWord("よかったです", [])).toBe(false);
  });
  it("uses the Japan date", () => {
    expect(jstDay("2026-10-25T15:30:00.000Z")).toBe("2026-10-26");
    expect(jstDay("2026-10-25T14:59:59.999Z")).toBe("2026-10-25");
  });
});
