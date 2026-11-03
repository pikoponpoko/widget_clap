import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
const storeKey = "hakushu-browser-preview-v3";
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
  // The frame follows the 480×412 @3x button, shown at 160×137, plus 4px padding.
  const buttonIframe = page.locator('iframe[title="拍手ボタン"]').first();
  await expect
    .poll(async () => (await buttonIframe.boundingBox())?.width)
    .toBe(168);
  expect((await buttonIframe.boundingBox())?.height).toBe(145);
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
    thanksFrame(page).getByRole("img", { name: "作者からのお礼イラスト" }),
  ).toBeVisible();
  await expect(
    thanksFrame(page).getByAltText("作者からのお礼イラスト"),
  ).toBeVisible();
  await expect(
    thanksFrame(page).getByRole("checkbox", {
      name: "公開を許可",
    }),
  ).not.toBeChecked();
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
      await request.post("/api/public/projects/sample/messages", {
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
    thanksFrame(page).getByRole("img", { name: "作者からのお礼イラスト" }),
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
test("optional message and reply remain browser-local, and another browser cannot read the reply", async ({
  page,
  browser,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  await page.goto("/widget/sample");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "公開を許可",
    }),
  ).not.toBeChecked();
  await page
    .getByRole("textbox", { name: "メッセージ" })
    .fill("体験用の感想です。使いやすい道具をありがとう。");
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "感想を保存して試す" }).click();
  await expect(
    page.getByRole("heading", { name: "送信しました" }),
  ).toBeVisible();
  const url = await page.getByLabel("返信確認URL").inputValue();
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
      `<!doctype html><html><head><meta charset="utf-8"><style>iframe{height:700px!important}button{font-size:90px!important}</style></head><body><p id="before">ホストサイト</p><script src="${service}/embed.js" data-project="sample"></script><p id="after">続きの文章</p></body></html>`,
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
      .toBe(145);
    await page.evaluate((origin) => {
      const frame = document
        .querySelector("[data-creator-support]")!
        .shadowRoot!.querySelector("iframe")!;
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          data: {
            type: "creator-support:open",
            project: "sample",
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
      thanksFrame(page).getByRole("img", { name: "作者からのお礼イラスト" }),
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
test("per-placement switches suppress disabled features, and the tip link shows only on tip pages", async ({
  page,
}) => {
  // With one site, the widget page shows its settings directly.
  await page.goto("/admin#projects");
  await page.getByRole("button", { name: "拍手のみ", exact: true }).click();
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  // The first management card can vary by title; choose the stored preset directly by its flag.
  const slug = await page.evaluate(
    (k) =>
      JSON.parse(localStorage.getItem(k)!).projects.find(
        (p: { message_enabled: boolean }) => !p.message_enabled,
      ).slug,
    storeKey,
  );
  await page.goto("/widget/" + slug);
  await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByAltText("作者からのお礼イラスト")).toBeVisible();
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k)!);
    const p = s.projects[0];
    p.thanks_enabled = false;
    p.message_enabled = true;
    p.reply_enabled = false;
    p.tip_url = "https://example.com";
    localStorage.setItem(k, JSON.stringify(s));
  }, storeKey);
  await page.goto("/widget/sample");
  await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(page.getByAltText("作者からのお礼イラスト")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /任意の支援/ })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "メッセージ" })
    .fill("返信なしの感想");
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "感想を保存して試す" }).click();
  await expect(
    page.getByRole("heading", { name: "送信しました" }),
  ).toBeVisible();
  await expect(page.getByLabel("返信確認URL")).toHaveCount(0);
  await page.goto("/widget/sample?tip=1");
  await page.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(page.getByRole("link", { name: /任意の支援/ })).toHaveAttribute(
    "href",
    "https://example.com",
  );
});

test("closes the thank-you modal and shows the error if applause cannot be saved", async ({
  page,
}) => {
  await page.goto("/demo");
  const frame = buttonFrame(page);
  await expect(
    frame.getByRole("button", { name: "拍手を送る", exact: true }),
  ).toBeVisible();
  // Every embedded copy loads the same button page; make storage fail in all of them.
  for (const serviceFrame of page
    .frames()
    .filter((f) => f.url().includes("/button/sample")))
    await serviceFrame.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("full", "QuotaExceededError");
      };
    });
  await frame.getByRole("button", { name: "拍手を送る", exact: true }).click();
  await expect(frame.getByRole("alert")).toContainText("保存容量");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("the embedded button shows the @3x button image at a third of its size and records the clicked page", async ({
  page,
}) => {
  await page.goto("/demo");
  const frame = buttonFrame(page);
  const button = frame.getByRole("button", { name: "拍手を送る", exact: true });
  const image = button.locator("img");
  await expect(image).toHaveAttribute("src", "/buttons/push-me@3x.webp");
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(480);
  expect(
    await image.evaluate((img: HTMLImageElement) => img.naturalHeight),
  ).toBe(412);
  await expect.poll(async () => (await image.boundingBox())?.width).toBe(160);
  expect((await image.boundingBox())!.height).toBe(137);
  await image.click();
  await expect(
    thanksFrame(page).getByRole("img", { name: "作者からのお礼イラスト" }),
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
  ).toEqual([["/tools/sample-tool", "サンプルツール"]]);
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
      thanksFrame(page).getByRole("img", { name: "作者からのお礼イラスト" }),
    ).toBeVisible();
    if (n === 2) {
      await thanksFrame(page)
        .getByRole("textbox", { name: "メッセージ" })
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
  await expect(
    pages.getByRole("link", { name: "サンプルツール" }),
  ).toBeVisible();
  await expect(pages.getByRole("link", { name: "ブログ記事" })).toBeVisible();
  await expect(
    page.locator(".project-tag", { hasText: "ブログ記事" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Hakushu" })).toBeVisible();
  // Pages, who clapped and reactions share one card, switched by tabs.
  const card = page.locator(".panel", {
    has: page.getByRole("tab", { name: "拍手した人" }),
  });
  if (process.env.SHOTS)
    await card.screenshot({ path: process.env.SHOTS + "/pc.png" });
  await page.getByRole("tab", { name: "拍手した人" }).click();
  await expect(page.locator(".page-stats")).toHaveCount(0);
  await expect(page.locator(".attr-block").first()).toBeVisible();
  if (process.env.SHOTS)
    await card.screenshot({ path: process.env.SHOTS + "/pc-people.png" });
  await page.getByRole("tab", { name: "リアクション" }).click();
  await expect(card.getByRole("tab", { name: "日別" })).toBeVisible();
  if (process.env.SHOTS)
    await card.screenshot({ path: process.env.SHOTS + "/pc-reactions.png" });
  await page.getByRole("tab", { name: "ページ別の拍手" }).click();
  await expect(pages.getByRole("link", { name: "ブログ記事" })).toBeVisible();
  if (process.env.SHOTS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await card.screenshot({ path: process.env.SHOTS + "/sp.png" });
    await page.getByRole("tab", { name: "拍手した人" }).click();
    await card.screenshot({ path: process.env.SHOTS + "/sp-people.png" });
    await page.getByRole("tab", { name: "リアクション" }).click();
    await card.screenshot({ path: process.env.SHOTS + "/sp-reactions.png" });
  }
});
test("the tip-enabled demo page shows the unconnected tip placeholder only there", async ({
  page,
}) => {
  await page.goto("/demo");
  const frames = page.frameLocator('iframe[title="拍手ボタン"]');
  await frames
    .nth(3)
    .getByRole("button", { name: "拍手を送る", exact: true })
    .click();
  await expect(thanksFrame(page).getByText("投げ銭リンク未設定")).toBeVisible();
  await expect(
    thanksFrame(page).getByRole("link", { name: /任意の支援/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "お礼画面を閉じる" }).click();
  await frames
    .nth(0)
    .getByRole("button", { name: "拍手を送る", exact: true })
    .click();
  await expect(
    thanksFrame(page).getByRole("img", { name: "作者からのお礼イラスト" }),
  ).toBeVisible();
  await expect(thanksFrame(page).getByText("投げ銭リンク未設定")).toHaveCount(
    0,
  );
});
test("analytics by hour and page, NG keywords, month filter and bulk actions", async ({
  page,
}) => {
  await page.goto("/admin#projects");
  await page.getByRole("textbox", { name: "NGキーワード" }).fill("スパム");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await page.goto("/demo");
  const frames = page.frameLocator('iframe[title="拍手ボタン"]');
  for (const [n, body] of [
    [0, "よかったです"],
    [2, "ｽﾊﾟﾑです"],
  ] as const) {
    await frames
      .nth(n)
      .getByRole("button", { name: "拍手を送る", exact: true })
      .click();
    await thanksFrame(page)
      .getByRole("textbox", { name: "メッセージ" })
      .fill(body);
    await page.waitForTimeout(1600);
    await thanksFrame(page)
      .getByRole("button", { name: "感想を保存して試す" })
      .click();
    await expect(
      thanksFrame(page).getByRole("heading", { name: "送信しました" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "お礼画面を閉じる" }).click();
  }
  await page.goto("/admin");
  // The top card shows today's claps, not the running total.
  await expect(
    page.locator(".stat-card", { hasText: "受け取った拍手" }),
  ).toContainText("今日");
  const total = page.locator(".hour-total");
  await expect(total).toContainText("人数 1");
  await expect(total).toContainText("拍手 2");
  // Only the clean message counts; the NG one was hidden on arrival.
  await expect(total).toContainText("感想 1");
  // The chart opens on hours; tapping a day switches it to that day's hours.
  await expect(page.locator(".activity-bars .chart-column")).toHaveCount(24);
  const today = await page.evaluate(() =>
    new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
  );
  // Each clap of the day is listed with its minute in Japan time.
  const times = page.locator(".clap-times li");
  await expect(times).toHaveCount(2);
  await expect(times.first().locator("time")).toHaveText(
    new RegExp(`^${today.replaceAll("-", "/")} \\d{2}:\\d{2}$`),
  );
  await expect(times.first().locator("a.page-link")).toHaveAttribute(
    "target",
    "_blank",
  );
  await page.getByRole("tab", { name: "日別" }).first().click();
  await page
    .locator(".activity-bars")
    .getByRole("button", { name: today.replaceAll("-", "/") + " " })
    .click();
  await expect(page.getByRole("tab", { name: "時間別" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".activity-bars .chart-column")).toHaveCount(24);
  await expect(total).toContainText("拍手 2");
  await page
    .locator(".page-stats")
    .getByRole("button", { name: "ブログ記事" })
    .click();
  await expect(total).toContainText("拍手 1");
  await expect(total).toContainText("感想 0");

  await page.goto("/admin#inbox");
  await expect(page.locator(".message-row")).toHaveCount(1);
  const month = await page.evaluate(() =>
    new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7),
  );
  await page
    .getByRole("combobox", { name: "月で絞り込む" })
    .selectOption(month);
  await expect(page.locator(".message-row")).toHaveCount(1);
  await page
    .getByRole("checkbox", { name: "表示中の感想をすべて選択" })
    .check();
  await page.getByRole("button", { name: "既読にする" }).click();
  await expect(page.locator(".message-row.unread")).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "表示中の感想をすべて選択" })
    .check();
  await page
    .locator(".bulk-actions")
    .getByRole("button", { name: "非表示" })
    .click();
  await expect(page.locator(".message-row")).toHaveCount(0);
  await page
    .locator(".inbox-tabs")
    .getByRole("button", { name: "非表示" })
    .click();
  await expect(page.locator(".message-row")).toHaveCount(2);
  await expect(
    page.locator(".message-row", { hasText: "ｽﾊﾟﾑです" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "この感想を選択" }).first().check();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.locator(".message-row")).toHaveCount(1);
});
test("the tip link waits for the thank-you screen, not next to the button", async ({
  page,
}) => {
  await page.goto("/demo");
  const frames = page.frameLocator('iframe[title="拍手ボタン"]');
  await expect(
    frames.nth(3).getByRole("button", { name: "拍手を送る", exact: true }),
  ).toBeVisible();
  await expect(frames.nth(3).getByText("コーヒーをおごる")).toHaveCount(0);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("the demo code generator adds an escaped custom tip label", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("checkbox", { name: "このページで投げ銭を表示" })
    .check();
  await page
    .getByRole("textbox", { name: "投げ銭の文言" })
    .fill('コーヒー"<b>');
  await expect(
    page.getByRole("textbox", { name: "小型ボタンの埋め込みコード" }),
  ).toHaveValue(/data-tip="on" data-tip-label="コーヒー&quot;b" defer/);
});
test("old messages can be pasted in and are kept apart from Hakushu messages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/admin#data");
  await page
    .getByRole("textbox", { name: "取り込むメッセージ" })
    .fill(
      "2015/03/02 12:34\n名前：みどり\nいつも見ています\n\n2015/03/03 08:00 更新ありがとう",
    );
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "メッセージ" })).toHaveCount(
    2,
  );
  await expect(page.getByRole("textbox", { name: "名前" }).first()).toHaveValue(
    "みどり",
  );
  await page.screenshot({
    path: "test-results/import-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "2 件を取り込む" }).click();
  await expect(page.getByText("2 件を取り込みました")).toBeVisible();
  // Importing the same text again adds nothing.
  await page
    .getByRole("textbox", { name: "取り込むメッセージ" })
    .fill("2015/03/03 08:00 更新ありがとう");
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await page.getByRole("button", { name: "1 件を取り込む" }).click();
  await expect(
    page.getByText("0 件を取り込みました（1 件は取り込み済み）"),
  ).toBeVisible();
  await page.goto("/admin#inbox");
  await page.getByRole("button", { name: "取り込み", exact: true }).click();
  await expect(page.locator(".message-item")).toHaveCount(2);
  await page.getByText("いつも見ています").click();
  await expect(page.getByRole("textbox", { name: "返信内容" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/import-detail.png" });
});
test("the export script walks every month of the old service and the file imports", async ({
  page,
}) => {
  const month = (ym: string, older: string | null, rows: string) =>
    `<html><head><meta charset="utf-8"></head><body>
<table><tr><td>2026/10/29<br>サーバーメンテナンスのお知らせ</td></tr></table>
<table><tr><td><table>
<tr><td>${older ? "" : ""}<a href="?ym=next">&lt;&lt; 2026年11月</a></td><td>${ym}</td><td>${older ? `<a href="?ym=${older}">${older.slice(0, 4)}年${older.slice(4)}月 &gt;&gt;</a>` : ""}</td></tr>
</table><table>${rows}</table></td></tr></table></body></html>`;
  const pages: Record<string, string> = {
    "202610": month(
      "2026年10月",
      "202609",
      `<tr><td rowspan="2">2026/10/14</td><td><input type="checkbox"></td><td>19:48</td><td>めちゃいいですね <font color="red">レス不要</font></td></tr>
<tr><td><input type="checkbox"></td><td>20:01</td><td>次も<br>よろしく</td></tr>`,
    ),
    "202609": month(
      "2026年09月",
      null,
      `<tr><td>2026/09/01</td><td><input type="checkbox"></td><td>08:00</td><td>はじめまして <b style="color:#006600;">by のりこ</b> <i><a href="example.org">URL</a></i> <span style="color:#ff0000;">レス不要</span></td></tr>`,
    ),
  };
  await page.route("https://clap.test/**", (route) => {
    const ym = new URL(route.request().url()).searchParams.get("ym") || "";
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: pages[ym] || "<html></html>",
    });
  });
  await page.goto("https://clap.test/message_list.html?ym=202610");
  const { webclapScript } = await import("../src/webclap-script");
  const download = page.waitForEvent("download");
  await page.evaluate(webclapScript);
  const file = await (await download).path();
  await page.goto("/admin#data");
  await page.getByLabel("取り込むファイル").setInputFiles(file!);
  await expect(page.getByRole("textbox", { name: "メッセージ" })).toHaveCount(
    3,
  );
  await expect(
    page.getByRole("textbox", { name: "メッセージ" }).nth(1),
  ).toHaveValue("次も\nよろしく");
  await expect(
    page.getByRole("textbox", { name: "メッセージ" }).nth(2),
  ).toHaveValue("はじめまして");
  await expect(page.getByRole("textbox", { name: "名前" }).nth(2)).toHaveValue(
    "のりこ (example.org)",
  );
  await page.getByRole("button", { name: "3 件を取り込む" }).click();
  await expect(page.getByText("3 件を取り込みました")).toBeVisible();
  await page.goto("/admin#inbox");
  await page.getByRole("button", { name: "取り込み", exact: true }).click();
  await expect(page.locator(".message-item")).toHaveCount(3);
  await expect(page.getByText("返事不要")).toHaveCount(2);
});
test("the export script walks the old clap log and the days add to the stats", async ({
  page,
}) => {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const [y, m] = [+today.slice(0, 4), +today.slice(5, 7)];
  const prev = m === 1 ? [y - 1, 12] : [y, m - 1];
  const md = (d: string) => d.slice(5).replace("-", "/");
  const before = (n: number) =>
    new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);
  const log = (
    days: [string, number, number][],
    newer: string,
    older: string | null,
  ) => `<html><head><meta charset="utf-8"></head><body>
<table><tr><td>2026/10/29<br>サーバーメンテナンスのお知らせ</td></tr></table>
<table><tr><td>時間</td><td>人数</td><td>拍手</td></tr><tr><td>0時</td><td>0</td><td>0</td></tr></table>
<table><tr><th colspan="${days.length}">過去ログ</th></tr>
<tr>${days.map(() => '<td><img src="u.gif"></td>').join("")}</tr>
<tr>${days.map(([, c, v]) => `<td><img src="h.gif">${c}<br><img src="p.gif">${v}</td>`).join("")}</tr>
<tr>${days.map(([d]) => `<td>${md(d)}<br><a href="analysis.html?day=1">解析</a></td>`).join("")}</tr>
<tr><td colspan="${days.length}"><a href="?p=new">&lt;&lt; ${newer}</a> 最新14日間へ ${older ? `<a href="?p=old">${older} &gt;&gt;</a>` : ""}
<select><option>${y}年${m}月下旬</option></select></td></tr></table></body></html>`;
  const pages: Record<string, string> = {
    "": log(
      [
        [today, 9, 9],
        [before(1), 3, 2],
      ],
      `${y}年${m}月上旬`,
      `${prev[0]}年${prev[1]}月下旬`,
    ),
    old: log(
      [
        [before(1), 3, 2],
        [before(2), 4, 4],
      ],
      `${y}年${m}月上旬`,
      null,
    ),
  };
  await page.route("https://clap.test/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body:
        pages[new URL(route.request().url()).searchParams.get("p") || ""] ||
        "<html></html>",
    }),
  );
  await page.goto("https://clap.test/analysis.html");
  const { webclapScript } = await import("../src/webclap-script");
  const download = page.waitForEvent("download");
  await page.evaluate(webclapScript);
  const file = await (await download).path();
  await page.goto("/admin#data");
  await page.getByLabel("取り込むファイル").setInputFiles(file!);
  await expect(page.locator(".import-summary")).toContainText("16");
  await page.getByRole("button", { name: "3 日分を取り込む" }).click();
  await expect(page.getByText("3 日分の拍手数を取り込みました")).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("tab", { name: "日別" }).first().click();
  await expect(page.locator(".hour-total")).toContainText("拍手 16");
  await expect(page.locator(".hour-total")).toContainText("人数 15");
  // Imported days add up into weeks, months and years too.
  await page.getByRole("tab", { name: "年別" }).click();
  await expect(page.locator(".hour-total")).toContainText("拍手 16");
  await expect(page.locator(".hour-total")).toContainText("人数 15");
  await page.getByRole("tab", { name: "月別" }).click();
  await expect(page.locator(".activity-bars .chart-column")).toHaveCount(12);
  await expect(page.locator(".hour-total")).toContainText("拍手 16");
});
test("messages with links start excluded and can be put back", async ({
  page,
}) => {
  await page.goto("/admin#data");
  await page
    .getByRole("textbox", { name: "取り込むメッセージ" })
    .fill(
      "2015/03/02 12:34 いつも見ています\n2015/03/03 08:00 激安 https://spam.example\n2015/03/04 09:00 応援してます",
    );
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2 件を取り込む" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "除外（1）" }).click();
  await expect(page.getByRole("textbox", { name: "メッセージ" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("textbox", { name: "メッセージ" })).toHaveValue(
    "激安 https://spam.example",
  );
  await page.getByRole("checkbox", { name: "取り込む" }).click();
  await expect(
    page.getByRole("button", { name: "3 件を取り込む" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "すべて（3）" }).click();
  await page.getByRole("checkbox", { name: "取り込む" }).nth(1).uncheck();
  await page.getByRole("button", { name: "2 件を取り込む" }).click();
  await expect(page.getByText("2 件を取り込みました")).toBeVisible();
});
test("reaction buttons on the thank-you screen are counted per day and page", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .frameLocator('iframe[title="拍手ボタン"]')
    .first()
    .getByRole("button", { name: "拍手を送る", exact: true })
    .click();
  const heart = thanksFrame(page).getByRole("button", { name: "ハート" });
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await thanksFrame(page).getByRole("button", { name: "100点" }).click();
  await expect(
    thanksFrame(page).getByRole("button", { name: "泣ける" }),
  ).toHaveCount(0);
  if (process.env.SHOTS)
    await page.screenshot({ path: process.env.SHOTS + "/thanks.png" });
  await page.getByRole("button", { name: "お礼画面を閉じる" }).click();
  await page.goto("/admin");
  await page.getByRole("tab", { name: "リアクション" }).click();
  const panel = page.locator(".panel", {
    has: page.getByRole("tab", { name: "リアクション" }),
  });
  await expect(panel.locator(".reaction-total")).toContainText("❤️1");
  await expect(panel.locator(".reaction-total")).toContainText("💯1");
  // The activity chart marks the hour with its reaction and totals them.
  await expect(page.locator(".chart-reaction")).toHaveText(["❤️"]);
  await expect(page.locator(".hour-reactions")).toContainText("❤️ 1");
  await expect(page.locator(".hour-reactions")).toContainText("💯 1");
  await page.getByRole("tab", { name: "月別" }).click();
  await expect(page.locator(".hour-reactions")).toContainText("❤️ 1");
  if (process.env.SHOTS)
    await panel.screenshot({ path: process.env.SHOTS + "/admin-days.png" });
  await panel.getByRole("tab", { name: "ページ別", exact: true }).click();
  await expect(panel.locator(".page-filter")).toHaveCount(1);
  if (process.env.SHOTS)
    await panel.screenshot({ path: process.env.SHOTS + "/admin-pages.png" });
});
