import { describe, expect, it } from "vitest";
import { fromCells, parseImport, readDate } from "../src/import-parse";

describe("parseImport", () => {
  it("reads Japan time dates", () => {
    expect(readDate("2015/03/02 12:34:56")?.iso).toBe(
      "2015-03-02T03:34:56.000Z",
    );
    expect(readDate("2015年3月2日(月) 9時05分")?.iso).toBe(
      "2015-03-02T00:05:00.000Z",
    );
    expect(readDate("15-03-02")?.iso).toBe("2015-03-01T15:00:00.000Z");
    expect(readDate("ありがとう")).toBeNull();
    expect(readDate("2015/13/02")).toBeNull();
  });
  it("splits pasted logs at each date", () => {
    const rows = parseImport(
      [
        "2015/03/02 12:34",
        "名前：みどり",
        "コメント：いつも見ています",
        "次も楽しみ",
        "IP: 1.2.3.4",
        "----------",
        "2015/03/03 08:00 更新ありがとうございます",
      ].join("\r\n"),
    );
    expect(rows).toEqual([
      {
        created_at: "2015-03-02T03:34:00.000Z",
        sender_name: "みどり",
        body: "いつも見ています\n次も楽しみ",
      },
      {
        created_at: "2015-03-02T23:00:00.000Z",
        sender_name: "",
        body: "更新ありがとうございます",
      },
    ]);
  });
  it("splits undated text at blank lines", () => {
    expect(parseImport("ひとつめ\n\n\nふたつめ\nつづき")).toEqual([
      { created_at: "", sender_name: "", body: "ひとつめ" },
      { created_at: "", sender_name: "", body: "ふたつめ\nつづき" },
    ]);
  });
  it("reads CSV with quoted newlines", () => {
    const rows = parseImport(
      '﻿日時,名前,コメント\n2020/1/2 3:04,"A, B","1行目\n2行目"\n2020/1/3,,短い',
    );
    expect(rows).toEqual([
      {
        created_at: "2020-01-01T18:04:00.000Z",
        sender_name: "A, B",
        body: "1行目\n2行目",
      },
      { created_at: "2020-01-02T15:00:00.000Z", sender_name: "", body: "短い" },
    ]);
  });
  it("treats a comma in plain text as text", () => {
    expect(parseImport("こんにちは、またね")[0].body).toBe(
      "こんにちは、またね",
    );
    expect(parseImport("hi, there")[0].body).toBe("hi, there");
  });
  it("reads message-list table rows and skips page chrome", () => {
    expect(
      fromCells([
        ["2026/10/29\nサーバーメンテナンスのお知らせ"],
        ["<< 2026年11月", "2026年10月", "2026年09月 >>"],
        ["2026/10/14", "", "19:48", "めちゃいいですね　この仕組みも最高です"],
        ["", "20:01", "次も\nよろしく"],
        ["2026/10/15 07:02", "", "朝から"],
        ["06/04", "ポーカーの役判定"],
      ]),
    ).toEqual([
      {
        created_at: "2026-10-14T10:48:00.000Z",
        sender_name: "",
        body: "めちゃいいですね　この仕組みも最高です",
      },
      {
        created_at: "2026-10-14T11:01:00.000Z",
        sender_name: "",
        body: "次も\nよろしく",
      },
      {
        created_at: "2026-10-14T22:02:00.000Z",
        sender_name: "",
        body: "朝から",
      },
    ]);
  });
  it("turns the reply mark into a flag", () => {
    expect(
      parseImport(
        "2026/10/14\t\t19:48\tすてき レス不要\n\t20:01\tまた レス希望",
      ),
    ).toEqual([
      {
        created_at: "2026-10-14T10:48:00.000Z",
        sender_name: "",
        body: "すてき",
        reply_wanted: false,
      },
      {
        created_at: "2026-10-14T11:01:00.000Z",
        sender_name: "",
        body: "また",
        reply_wanted: true,
      },
    ]);
  });
});
