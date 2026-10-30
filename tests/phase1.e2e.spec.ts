import { test, expect, type APIRequestContext } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";
const origin = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8787";
const slug = "verify-" + Date.now();
let projectId = "";
let replyToken = "";
let messageId = "";
let backup: Record<string, unknown>;
const headers = {
  Origin: origin,
  "CF-Connecting-IP": `2001:db8:${Math.floor(Math.random() * 65535).toString(16)}:${Math.floor(Math.random() * 65535).toString(16)}::1`,
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aT8AAAAASUVORK5CYII=",
  "base64",
);
const body = () => ({
  body: "使いやすい道具をありがとう。制作の励みになっています。",
  request_id: crypto.randomUUID(),
  started_at: Date.now() - 3000,
  publication_consent: false,
});
test.describe.serial("Phase 1 integrated flow", () => {
  test("creates a project; protects mutation and private endpoints", async ({
    request,
  }) => {
    const session = await request.get("/api/owner/session");
    expect(session.ok()).toBeTruthy();
    expect((await session.json()).local).toBe(true);
    expect(
      (
        await request.post("/api/owner/projects", {
          data: { title: "侵入", slug: "no-origin" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/owner/projects", {
          headers: { Origin: "https://evil.example" },
          data: { title: "侵入", slug: "evil" },
        })
      ).status(),
    ).toBe(403);
    const res = await request.post("/api/owner/projects", {
      headers,
      data: {
        title: "検証用ツール",
        slug,
        description: "検証データです。",
        allowed_origins: ["https://kazukisekiguchi.com"],
      },
    });
    expect(res.status()).toBe(201);
    projectId = (await res.json()).id;
    const pub = await request.get("/api/public/projects/" + slug);
    const project = await pub.json();
    expect(project.tip_url).toBeNull();
    expect(project.owner_id).toBeUndefined();
    const page = await request.get("/widget/" + slug);
    expect(page.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'self' https://kazukisekiguchi.com",
    );
    expect(
      (await request.get("/reply")).headers()["content-security-policy"],
    ).toContain("frame-ancestors 'none'");
  });
  test("deduplicates applause and message retries; keeps consent off", async ({
    request,
  }) => {
    const url = "/api/public/projects/" + slug;
    const first = await request.post(url + "/claps", { headers, data: {} });
    expect((await first.json()).counted).toBe(true);
    expect(
      (await (await request.post(url + "/claps", { headers, data: {} })).json())
        .counted,
    ).toBe(false);
    expect(
      (
        await request.post(url + "/messages", {
          headers,
          data: { ...body(), website: "bot.example" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post(url + "/messages", {
          headers,
          data: { ...body(), started_at: Date.now() },
        })
      ).status(),
    ).toBe(400);
    const message = body();
    const result = await request.post(url + "/messages", {
      headers,
      data: message,
    });
    expect(result.status()).toBe(201);
    replyToken = (await result.json()).reply_token;
    expect(replyToken).toHaveLength(64);
    const retry = await request.post(url + "/messages", {
      headers,
      data: message,
    });
    expect((await retry.json()).reply_token).toBe(replyToken);
    const inbox = await (
      await request.get("/api/owner/messages?project=" + projectId)
    ).json();
    expect(inbox.total).toBe(1);
    expect(inbox.items[0].publication_consent).toBe(0);
    expect(inbox.items[0].reply_token_hash).toBeUndefined();
    messageId = inbox.items[0].id;
    expect((await result.headers())["cache-control"]).toBe("no-store");
  });
  test("delivers private replies; revokes and rotates capability URLs", async ({
    request,
  }) => {
    const url = "/api/owner/messages/" + messageId;
    expect(
      (
        await request.put(url + "/reply", {
          headers,
          data: { body: "うれしい感想をありがとうございます。" },
        })
      ).ok(),
    ).toBeTruthy();
    const resolve = () =>
      request.post("/api/public/reply", {
        headers,
        data: { token: replyToken },
      });
    expect((await (await resolve()).json()).reply_body).toBe(
      "うれしい感想をありがとうございます。",
    );
    expect(
      (
        await request.post("/api/public/reply", {
          headers,
          data: { token: "a".repeat(64) },
        })
      ).status(),
    ).toBe(404);
    await request.post(url + "/reply-token", {
      headers,
      data: { action: "revoke" },
    });
    expect((await resolve()).status()).toBe(404);
    const rotate = await request.post(url + "/reply-token", {
      headers,
      data: { action: "rotate" },
    });
    replyToken = (await rotate.json()).token;
    expect((await resolve()).status()).toBe(200);
    await request.patch(url, { headers, data: { blocked: true } });
    expect((await resolve()).status()).toBe(404);
    await request.patch(url, { headers, data: { blocked: false } });
  });
  test("uploads valid images, rejects active/large content and enforces one button", async ({
    request,
  }) => {
    const url = "/api/owner/projects/" + projectId + "/assets?kind=";
    expect(
      (
        await request.post(url + "thanks", {
          headers: { ...headers, "Content-Type": "image/svg+xml" },
          data: '<svg onload="alert(1)"/>',
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post(url + "thanks", {
          headers,
          data: Buffer.alloc(2097153),
        })
      ).status(),
    ).toBe(413);
    const up = await request.post(url + "thanks", { headers, data: png });
    expect(up.status()).toBe(201);
    const aid = (await up.json()).id;
    const img = await request.get("/api/public/assets/" + aid);
    expect(img.headers()["content-type"]).toBe("image/png");
    expect(img.headers()["x-content-type-options"]).toBe("nosniff");
    expect(
      (await request.post(url + "button", { headers, data: png })).status(),
    ).toBe(201);
    expect(
      (await request.post(url + "button", { headers, data: png })).status(),
    ).toBe(400);
  });
  test("one code records the clicked page and shows the GIF button at its own size", async ({
    request,
    page,
  }) => {
    const pagesSlug = slug + "-pages";
    const created = await request.post("/api/owner/projects", {
      headers,
      data: {
        title: "ページ記録の検証",
        slug: pagesSlug,
        allowed_origins: ["https://kazukisekiguchi.com"],
      },
    });
    expect(created.status()).toBe(201);
    const pid = (await created.json()).id;
    const gif = readFileSync("tests/fixtures/push-me.gif");
    expect(
      (
        await request.post(
          "/api/owner/projects/" + pid + "/assets?kind=button",
          { headers, data: gif },
        )
      ).status(),
    ).toBe(201);
    const url = "/api/public/projects/" + pagesSlug;
    for (const [page_url, page_title] of [
      ["https://kazukisekiguchi.com/blog/a#comments", "記事A"],
      ["https://kazukisekiguchi.com/blog/b", "記事B"],
      ["https://evil.example/blog/c", "外部"],
    ])
      expect(
        (
          await request.post(url + "/claps", {
            headers,
            data: { page_url, page_title },
          })
        ).status(),
      ).toBe(200);
    expect(
      (
        await request.post(url + "/messages", {
          headers,
          data: {
            ...body(),
            page_url: "https://kazukisekiguchi.com/blog/b",
            page_title: "記事B",
          },
        })
      ).status(),
    ).toBe(201);
    const stats = await (
      await request.get("/api/owner/stats?project=" + pid, { headers })
    ).json();
    expect(
      stats.pages.map((p: { page_url: string }) => p.page_url).sort(),
    ).toEqual([
      "",
      "https://kazukisekiguchi.com/blog/a",
      "https://kazukisekiguchi.com/blog/b",
    ]);
    const messages = await (
      await request.get("/api/owner/messages?project=" + pid, { headers })
    ).json();
    expect(messages.items[0].page_title).toBe("記事B");
    await page.goto("/button/" + pagesSlug);
    const image = page
      .getByRole("button", { name: "拍手を送る", exact: true })
      .locator("img");
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(180);
    const box = await image.boundingBox();
    expect([box!.width, box!.height]).toEqual([180, 170]);
  });
  test("works when pasted on another site: clap, message and download carry the article", async ({
    request,
    page,
  }) => {
    const siteSlug = slug + "-site";
    const blank = slug + "-blank";
    for (const [s, allowed] of [
      [siteSlug, ["https://blog.example"]],
      [blank, []],
    ] as const)
      expect(
        (
          await request.post("/api/owner/projects", {
            headers,
            data: { title: "設置テスト", slug: s, allowed_origins: allowed },
          })
        ).status(),
      ).toBe(201);
    const projects = await (
      await request.get("/api/owner/projects", { headers })
    ).json();
    const pid = projects.find((p: { slug: string }) => p.slug === siteSlug).id;
    await page.route("https://www.blog.example/**", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><title>記事一覧</title><meta property="og:title" content="記事C"><link rel="canonical" href="/posts/c"><h1>記事C</h1><script src="${origin}/embed.js" data-project="${siteSlug}" defer></script><script src="${origin}/embed.js" data-project="${blank}" defer></script>`,
      }),
    );
    await page.goto("https://www.blog.example/posts/c?utm_source=x#top");
    const hosts = page.locator("span[data-creator-support]");
    await expect(hosts).toHaveCount(2);
    const button = page
      .frameLocator(`span[data-creator-support="${siteSlug}"] iframe`)
      .first()
      .getByRole("button", { name: "拍手を送る", exact: true });
    await button.click();
    const thanks = page.frameLocator(
      `span[data-creator-support="${siteSlug}"] dialog iframe`,
    );
    await thanks.locator("textarea").first().fill("記事Cの感想");
    await page.waitForTimeout(1600);
    await thanks.getByRole("button", { name: "送信" }).click();
    await expect(thanks.getByText("送信しました")).toBeVisible();
    const article = "https://www.blog.example/posts/c";
    const stats = await (
      await request.get("/api/owner/stats?project=" + pid, { headers })
    ).json();
    expect(stats.pages).toEqual([
      { page_url: article, page_title: "記事C", count: 1 },
    ]);
    const csv = await (
      await request.get("/api/owner/export?format=csv&project=" + pid, {
        headers,
      })
    ).text();
    expect(csv).toContain(`"記事C","${article}","","記事Cの感想"`);
    // Without an allowed site the browser refuses to frame the button.
    const blankFrame = page
      .locator(`span[data-creator-support="${blank}"] iframe`)
      .first();
    expect(
      await (await blankFrame.elementHandle())!
        .contentFrame()
        .then((f) => f!.locator("button").count()),
    ).toBe(0);
  });
  test("honors per-placement reply and tip switches", async ({ request }) => {
    const response = await request.post("/api/owner/projects", {
      headers,
      data: {
        title: "返信なし設定の検証",
        slug: slug + "-no-reply",
        reply_enabled: false,
        thanks_enabled: false,
        tip_enabled: true,
        tip_url: "https://example.com",
        tip_legal_checked: true,
        tip_terms_checked: true,
        tip_privacy_checked: true,
      },
    });
    expect(response.status()).toBe(201);
    const config = await (
      await request.get("/api/public/projects/" + slug + "-no-reply")
    ).json();
    expect(config.reply_enabled).toBe(false);
    expect(config.thanks_enabled).toBe(false);
    expect(config.tip_url).toBeNull();
    const message = await request.post(
      "/api/public/projects/" + slug + "-no-reply/messages",
      { headers, data: body() },
    );
    expect(message.status()).toBe(201);
    expect((await message.json()).reply_token).toBeNull();
  });
  test("exports data and restores a full backup with image data and hashed tokens", async ({
    request,
  }) => {
    const res = await request.get("/api/owner/backup");
    expect(res.ok()).toBeTruthy();
    backup = await res.json();
    const messages = backup.messages as {
      id: string;
      reply_token_hash: string;
    }[];
    expect(
      messages.find((m) => m.id === messageId)?.reply_token_hash,
    ).toHaveLength(64);
    expect(messages.find((m) => m.id === messageId)?.reply_token_hash).not.toBe(
      replyToken,
    );
    const exported = await (
      await request.get("/api/owner/export?project=" + projectId)
    ).json();
    expect(exported.messages).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain("reply_token_hash");
    const csv = await request.get(
      "/api/owner/export?format=csv&project=" + projectId,
    );
    expect(await csv.text()).toContain("使いやすい道具をありがとう");
    expect(
      (
        await request.post("/api/owner/restore", {
          headers,
          data: { confirmation: "復元する", backup: { version: 999 } },
        })
      ).status(),
    ).toBe(400);
    const invalid = structuredClone(backup);
    (invalid.projects as { slug: string }[])[1].slug = (
      invalid.projects as { slug: string }[]
    )[0].slug;
    expect(
      (
        await request.post("/api/owner/restore", {
          headers,
          data: { confirmation: "復元する", backup: invalid },
        })
      ).status(),
    ).toBe(400);
    const before = await request.get(
      "/api/owner/messages?project=" + projectId,
    );
    expect((await before.json()).total).toBe(1);
    const restored = await request.post("/api/owner/restore", {
      headers,
      data: { confirmation: "復元する", backup },
    });
    expect(restored.status()).toBe(200);
    expect((await restored.json()).assets).toBeGreaterThanOrEqual(2);
    const assets = await (
      await request.get("/api/owner/projects/" + projectId + "/assets")
    ).json();
    expect(
      (await request.get("/api/public/assets/" + assets[0].id)).ok(),
    ).toBeTruthy();
    expect(
      (
        await request.post("/api/owner/backup-now", { headers, data: {} })
      ).status(),
    ).toBe(200);
    expect(
      (await (await request.get("/api/owner/backup-status")).json()).latest,
    ).toBeTruthy();
  });
  test("uses the widget on mobile, saves a favorite and receives a reply URL", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({
      "CF-Connecting-IP": headers["CF-Connecting-IP"].replace("::1", "::3"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/widget/" + slug);
    await expect(
      page.getByRole("button", { name: "拍手を送る", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
    await page.getByRole("button", { name: "お気に入り", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "お気に入り", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("checkbox", {
        name: "この感想の第三者公開を許可する（任意）",
      }),
    ).not.toBeChecked();
    await page
      .getByRole("textbox", { name: "メッセージ（任意）" })
      .fill("スマートフォンからの便りです。");
    await page.waitForTimeout(1600);
    await page.getByRole("button", { name: "送信" }).click();
    await expect(
      page.getByRole("heading", { name: "送信しました" }),
    ).toBeVisible();
    const url = await page.getByLabel("返信確認URL").inputValue();
    expect(url).toContain("/reply#");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto(url);
    await expect(
      page.getByText("スマートフォンからの便りです。"),
    ).toBeVisible();
    await expect(page.getByText(/返信はまだありません/)).toBeVisible();
  });
  test("generates Japanese PDF with A4 geometry and a 91×55mm card", async ({
    page,
  }) => {
    await page.goto("/admin#print");
    await page
      .getByRole("combobox", { name: "作品で絞り込む" })
      .selectOption(projectId);
    await page.getByRole("checkbox", { name: /すべての感想を選択/ }).check();
    let dlPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "印刷用PDFをダウンロード" }).click();
    let dl = await dlPromise;
    await dl.saveAs("test-results/a4.pdf");
    const fs = await import("node:fs/promises");
    let doc = await PDFDocument.load(await fs.readFile("test-results/a4.pdf"));
    expect(doc.getPage(0).getWidth()).toBeCloseTo((210 * 72) / 25.4, 2);
    expect(doc.getPage(0).getHeight()).toBeCloseTo((297 * 72) / 25.4, 2);
    await page
      .getByRole("combobox", { name: "用紙と面付け" })
      .selectOption("card");
    dlPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "印刷用PDFをダウンロード" }).click();
    dl = await dlPromise;
    await dl.saveAs("test-results/card.pdf");
    doc = await PDFDocument.load(await fs.readFile("test-results/card.pdf"));
    expect(doc.getPage(0).getWidth()).toBeCloseTo((91 * 72) / 25.4, 2);
    expect(doc.getPage(0).getHeight()).toBeCloseTo((55 * 72) / 25.4, 2);
  });
  test("renders Owner inbox and dashboard on desktop and mobile without horizontal overflow", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/admin#overview");
    await expect(
      page.getByRole("heading", { name: "ダッシュボード", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "作品で絞り込む" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: "test-results/dashboard-desktop.png",
      fullPage: true,
    });
    // Widget settings live on their own page, with the preview beside them.
    await page.getByRole("button", { name: "ウィジェット" }).click();
    await page.getByRole("button", { name: "設定・埋め込み" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page
        .frameLocator('iframe[title="ウィジェットのプレビュー"]')
        .getByRole("button", { name: "拍手を送る", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "サイト一覧" }).click();
    await page.getByRole("button", { name: /届いた感想/ }).click();
    await page
      .getByRole("combobox", { name: "作品で絞り込む" })
      .selectOption(projectId);
    await expect(page.locator(".message-row")).toHaveCount(2);
    await page
      .getByRole("button")
      .filter({ hasText: "使いやすい道具をありがとう" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin#overview");
    await page.screenshot({
      path: "test-results/dashboard-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
  test("limits anonymous posts and makes deleted message URLs unavailable", async ({
    request,
  }) => {
    const h = {
      ...headers,
      "CF-Connecting-IP": headers["CF-Connecting-IP"].replace("::1", "::2"),
    };
    const url = "/api/public/projects/" + slug + "/messages";
    for (let i = 0; i < 5; i++)
      expect(
        (await request.post(url, { headers: h, data: body() })).status(),
      ).toBe(201);
    expect(
      (await request.post(url, { headers: h, data: body() })).status(),
    ).toBe(429);
    await request.delete("/api/owner/messages/" + messageId, { headers });
    expect(
      (
        await request.post("/api/public/reply", {
          headers,
          data: { token: replyToken },
        })
      ).status(),
    ).toBe(404);
  });
});
