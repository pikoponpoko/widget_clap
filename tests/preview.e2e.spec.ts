import { test, expect } from "@playwright/test";
test("preview serves assets, accepts no server posts and works on desktop/mobile", async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  const apiRequests: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /つくる人へ、\s*小さな応援を。/ }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "入力内容はこのブラウザだけに保存され、作者には届きません。",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /プリプロ名人へ/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "尺取名人", exact: true }).click();
  await expect(page.getByRole("heading", { name: /尺取名人へ/ })).toBeVisible();
  await page.getByRole("button", { name: "プリプロ名人", exact: true }).click();
  await page.screenshot({
    path: "test-results/preview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/preview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await request.post("/api/public/projects/prepro/messages", {
        data: { body: "server must not accept" },
      })
    ).status(),
  ).toBe(503);
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
test("saves only browser-local messages, displays thanks and verifies the reply flow", async ({
  page,
  browser,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  await page.goto("/widget/prepro");
  await page.getByRole("button", { name: "お気に入り", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "お気に入り", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page
    .getByRole("textbox", { name: "ひとこと、添える" })
    .fill("体験用の感想です。使いやすい道具をありがとう。");
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "感想を保存して試す" }).click();
  await expect(
    page.getByRole("heading", { name: "言葉を、ありがとう。" }),
  ).toBeVisible();
  await expect(page.getByAltText("作者からのお礼イラスト")).toBeVisible();
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
