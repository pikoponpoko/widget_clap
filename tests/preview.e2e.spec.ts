import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
const storeKey = "hakushu-browser-preview-v2";
const buttonFrame = (page: import("@playwright/test").Page) =>
  page.frameLocator('iframe[title="拍手ボタン"]').first();
const thanksFrame = (page: import("@playwright/test").Page) =>
  page.frameLocator("dialog[open] iframe");
test("only the tiny button is embedded; click saves applause before optional feedback, without shifting content", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "埋め込みデモ" }),
  ).toBeVisible();
  const frame = buttonFrame(page);
  await expect(
    frame.getByRole("button", { name: "拍手を送る", exact: true }),
  ).toBeVisible();
  await expect(frame.getByRole("textbox")).toHaveCount(0);
  // The frame follows the 180×170 GIF button plus 4px padding.
  const buttonIframe = page.locator('iframe[title="拍手ボタン"]').first();
  await expect
    .poll(async () => (await buttonIframe.boundingBox())?.width)
    .toBe(188);
  expect((await buttonIframe.boundingBox())?.height).toBe(178);
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k) || '{"claps":[]}').claps.length,
      storeKey,
    ),
  ).toBe(0);
  const before = await page.locator(".demo-following-content").boundingBox();
  await frame.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    thanksFrame(page).getByRole("heading", { name: "拍手しました" }),
  ).toBeVisible();
  await expect(
    thanksFrame(page).getByAltText("作者からのお礼イラスト"),
  ).toBeVisible();
  await expect(thanksFrame(page).getByRole("checkbox")).not.toBeChecked();
  const after = await page.locator(".demo-following-content").boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k)!);
      return [s.claps.length, s.messages.length];
    }, storeKey),
  ).toEqual([1, 0]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).claps.length,
      storeKey,
    ),
  ).toBe(1);
  await page.screenshot({
    path: "test-results/embed-desktop.png",
    fullPage: true,
  });
  expect(
    (
      await request.post("/api/public/projects/kazuki/messages", {
        data: { body: "no server storage" },
      })
    ).status(),
  ).toBe(503);
  expect(errors).toEqual([]);
});
test("mobile demo retains layout and allows closing the thank-you without a message", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await buttonFrame(page)
    .getByRole("button", { name: "拍手を送る", exact: true })
    .click();
  await expect(
    thanksFrame(page).getByRole("heading", { name: "拍手しました" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/embed-mobile-thanks.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "お礼画面を閉じる" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/embed-mobile.png",
    fullPage: true,
  });
});
test("optional message and reply remain browser-local, favorites persist, and another browser cannot read the reply", async ({
  page,
  browser,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  await page.goto("/widget/kazuki");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await page.getByRole("button", { name: "お気に入り", exact: true }).click();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page
    .getByRole("textbox", { name: "メッセージ（任意）" })
    .fill("体験用の感想です。使いやすい道具をありがとう。");
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "感想を保存して試す" }).click();
  await expect(
    page.getByRole("heading", { name: "送信しました" }),
  ).toBeVisible();
  const url = await page.getByLabel("返信確認URL").inputValue();
  await page.goto("/widget/kazuki");
  await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "お気に入り", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/admin#inbox");
  await page
    .getByRole("button")
    .filter({ hasText: "体験用の感想です。" })
    .click();
  await page
    .getByRole("textbox", { name: "返信内容" })
    .fill("体験用のお返事です。");
  await page.getByRole("button", { name: "返信を保存", exact: true }).click();
  await page.goto(url);
  await expect(page.getByText("体験用のお返事です。")).toBeVisible();
  const isolated = await browser.newContext();
  const other = await isolated.newPage();
  await other.goto(url);
  await expect(other.getByRole("alert")).toContainText(
    "このブラウザに返信が見つかりません",
  );
  await isolated.close();
  expect(apiRequests).toEqual([]);
});
test("cross-origin embedding works and ignores forged host messages", async ({
  page,
}) => {
  const service = "http://127.0.0.1:8787";
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      `<!doctype html><html><head><meta charset="utf-8"><style>iframe{height:700px!important}button{font-size:90px!important}</style></head><body><p id="before">ホストサイト</p><script src="${service}/embed.js" data-project="kazuki"></script><p id="after">続きの文章</p></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto(
      "http://127.0.0.1:" + (server.address() as AddressInfo).port,
    );
    const frame = buttonFrame(page);
    await expect(
      frame.getByRole("button", { name: "拍手を送る", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await page.locator('iframe[title="拍手ボタン"]').boundingBox())
            ?.height,
      )
      .toBe(178);
    await page.evaluate((origin) => {
      const frame = document
        .querySelector("[data-creator-support]")!
        .shadowRoot!.querySelector("iframe")!;
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          data: {
            type: "creator-support:open",
            project: "kazuki",
            instance: "forged",
            reason: "clap",
          },
          source: frame.contentWindow,
        }),
      );
    }, service);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const before = await page.locator("#after").boundingBox();
    await frame
      .getByRole("button", { name: "拍手を送る", exact: true })
      .click();
    await expect(
      thanksFrame(page).getByRole("heading", { name: "拍手しました" }),
    ).toBeVisible();
    expect((await page.locator("#after").boundingBox())?.y).toBe(before?.y);
    await page.getByRole("button", { name: "お礼画面を閉じる" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test("per-placement switches suppress disabled features, and unconnected tips never render", async ({
  page,
}) => {
  await page.goto("/admin#projects");
  // Persist the initial preview settings through the existing management form.
  await page.getByRole("button", { name: "設定・埋め込み" }).first().click();
  await page.getByRole("button", { name: "拍手のみ", exact: true }).click();
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  // The first management card can vary by title; choose the stored preset directly by its flag.
  const slug = await page.evaluate(
    (k) =>
      JSON.parse(localStorage.getItem(k)!).projects.find(
        (p: { message_enabled: boolean; favorite_enabled: boolean }) =>
          !p.message_enabled && !p.favorite_enabled,
      ).slug,
    storeKey,
  );
  await page.goto("/widget/" + slug);
  await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "お気に入り", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByAltText("作者からのお礼イラスト")).toBeVisible();
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k)!);
    const p = s.projects[0];
    p.thanks_enabled = false;
    p.message_enabled = true;
    p.reply_enabled = false;
    p.tip_enabled = true;
    p.tip_url = "https://example.com";
    p.tip_legal_checked = true;
    p.tip_terms_checked = true;
    p.tip_privacy_checked = true;
    localStorage.setItem(k, JSON.stringify(s));
  }, storeKey);
  await page.goto("/widget/kazuki");
  await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(page.getByAltText("作者からのお礼イラスト")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /任意の支援/ })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "メッセージ（任意）" })
    .fill("返信なしの感想");
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "感想を保存して試す" }).click();
  await expect(
    page.getByRole("heading", { name: "送信しました" }),
  ).toBeVisible();
  await expect(page.getByLabel("返信確認URL")).toHaveCount(0);
});

test("does not open the thank-you modal or claim success if applause cannot be saved", async ({
  page,
}) => {
  await page.goto("/demo");
  const frame = buttonFrame(page);
  await expect(
    frame.getByRole("button", { name: "拍手を送る", exact: true }),
  ).toBeVisible();
  const serviceFrame = page
    .frames()
    .find((f) => f.url().includes("/button/kazuki"))!;
  await serviceFrame.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await frame.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(frame.getByRole("alert")).toContainText("保存容量");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("the embedded button shows the GIF button image at its own size and records the clicked page", async ({
  page,
}) => {
  await page.goto("/demo");
  const frame = buttonFrame(page);
  const button = frame.getByRole("button", { name: "拍手を送る", exact: true });
  const image = button.locator("img");
  await expect(image).toHaveAttribute("src", "/buttons/push-me.gif");
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(180);
  expect(
    await image.evaluate((img: HTMLImageElement) => img.naturalHeight),
  ).toBe(170);
  const box = await image.boundingBox();
  expect(box!.width).toBe(180);
  expect(box!.height).toBe(170);
  await image.click();
  await expect(
    thanksFrame(page).getByRole("heading", { name: "拍手しました" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (k) =>
        JSON.parse(localStorage.getItem(k)!).claps.map(
          (c: { page_url: string; page_title: string }) => [
            new URL(c.page_url).pathname,
            c.page_title,
          ],
        ),
      storeKey,
    ),
  ).toEqual([["/tools/prepro", "プリプロ名人"]]);
});
test("one code serves many pages: claps and messages are listed per page in the dashboard", async ({
  page,
}) => {
  await page.goto("/demo");
  const frames = page.frameLocator('iframe[title="拍手ボタン"]');
  for (const n of [0, 2]) {
    await frames
      .nth(n)
      .getByRole("button", { name: "拍手を送る", exact: true })
      .click();
    await expect(
      thanksFrame(page).getByRole("heading", { name: "拍手しました" }),
    ).toBeVisible();
    if (n === 2) {
      await thanksFrame(page)
        .getByRole("textbox", { name: "メッセージ（任意）" })
        .fill("ブログへの感想です。");
      await page.waitForTimeout(1600);
      await thanksFrame(page)
        .getByRole("button", { name: "感想を保存して試す" })
        .click();
      await expect(
        thanksFrame(page).getByRole("heading", { name: "送信しました" }),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "お礼画面を閉じる" }).click();
  }
  await page.goto("/admin");
  const pages = page.locator(".page-stats");
  await expect(pages.getByRole("link", { name: "プリプロ名人" })).toBeVisible();
  await expect(pages.getByRole("link", { name: "ブログ記事" })).toBeVisible();
  await expect(
    page.locator(".project-tag", { hasText: "ブログ記事" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Hakushu" })).toBeVisible();
});
