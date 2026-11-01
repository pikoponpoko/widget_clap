import { describe, expect, it } from "vitest";
import {
  buildAttrs,
  cleanLang,
  parseAgent,
  readAttrs,
  tallyAttrs,
} from "../src/attributes";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const win =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const tab =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
describe("clap attributes", () => {
  it("reads device, OS and browser from the user agent", () => {
    expect(parseAgent(iphone)).toEqual({
      os: "iOS",
      browser: "Safari",
      device: "phone",
    });
    expect(parseAgent(win)).toEqual({
      os: "Windows",
      browser: "Edge",
      device: "pc",
    });
    expect(parseAgent(tab).device).toBe("tablet");
    expect(parseAgent("")).toEqual({ os: "", browser: "", device: "" });
  });
  it("keeps only the language part", () => {
    expect(cleanLang("ja-JP")).toBe("ja");
    expect(cleanLang("en-US,en;q=0.9")).toBe("en");
    expect(cleanLang("<script>")).toBe("");
  });
  it("names Japanese prefectures, marks the same site and drops bad values", () => {
    const a = buildAttrs({
      country: "JP",
      region: "Tokyo",
      regionCode: "13",
      city: "Shibuya",
      lang: "ja-JP",
      userAgent: iphone,
      referrer: "www.example.com",
      screen: "390x844",
      pageUrl: "https://example.com/a",
      repeat: false,
    });
    expect(a).toMatchObject({
      country: "JP",
      region: "東京都",
      city: "Shibuya",
      lang: "ja",
      device: "phone",
      referrer: "self",
      screen: "390x844",
      repeat: false,
    });
    const b = buildAttrs({
      country: "<x>",
      region: "California",
      referrer: "https://google.com/search?q=secret",
      screen: "huge",
      acceptLanguage: "en-US,en;q=0.9",
      pageUrl: "",
      repeat: true,
    });
    expect(b).toMatchObject({
      country: "",
      region: "California",
      lang: "en",
      referrer: "",
      screen: "",
      repeat: true,
    });
    expect(
      buildAttrs({
        referrer: "t.co",
        pageUrl: "https://example.com",
        repeat: false,
      }).referrer,
    ).toBe("t.co");
  });
  it("counts each attribute and skips claps recorded before", () => {
    const a = buildAttrs({
      country: "JP",
      regionCode: "27",
      userAgent: win,
      pageUrl: "",
      repeat: false,
    });
    const s = tallyAttrs([
      a,
      { ...a, repeat: true },
      readAttrs(""),
      readAttrs("{bad"),
      readAttrs(JSON.stringify(a)),
    ]);
    expect(s.total).toBe(3);
    expect(s.lists.region).toEqual([{ v: "JP|大阪府", n: 3 }]);
    expect(s.lists.repeat).toEqual([
      { v: "first", n: 2 },
      { v: "repeat", n: 1 },
    ]);
    expect(s.lists.browser).toEqual([{ v: "Edge", n: 3 }]);
  });
});
