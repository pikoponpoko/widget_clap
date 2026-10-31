import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { download, date } from "./api";
import type { Message } from "./types";
import { type PrintOptions } from "./print-options";
const mm = 72 / 25.4;
const graphemes = (text: string) =>
  Array.from(
    new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text),
    (s) => s.segment,
  );
export function wrapText(
  text: string,
  maxWidth: number,
  width: (s: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const ch of graphemes(paragraph)) {
      if (line && width(line + ch) > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += ch;
    }
    lines.push(line);
  }
  return lines;
}
export function validatePrint(o: PrintOptions) {
  if (
    ![o.marginX, o.marginY, o.gapX, o.gapY, o.offsetX, o.offsetY].every(
      Number.isFinite,
    )
  )
    throw new Error("印刷設定に数値を入力してください。");
  if (
    o.marginX < 0 ||
    o.marginY < 0 ||
    o.gapX < 0 ||
    o.gapY < 0 ||
    Math.abs(o.offsetX) > 10 ||
    Math.abs(o.offsetY) > 10
  )
    throw new Error("余白・間隔は0以上、位置補正は±10mm以内にしてください。");
  if (
    o.layout === "a4" &&
    (o.marginX + o.offsetX < 0 ||
      o.marginY + o.offsetY < 0 ||
      o.marginX + o.offsetX + 182 + o.gapX > 210 ||
      o.marginY + o.offsetY + 275 + 4 * o.gapY > 297)
  )
    throw new Error(
      "91×55mmのカード10枚がA4に収まる余白・間隔にしてください。",
    );
}
export async function makePdf(
  messages: Message[],
  options: PrintOptions,
): Promise<Uint8Array> {
  validatePrint(options);
  if (!messages.length) throw new Error("印刷する感想を選択してください。");
  const res = await fetch("/fonts/NotoSansJP-Regular.ttf");
  if (!res.ok) throw new Error("日本語フォントを読み込めませんでした。");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit); // Full embedding avoids missing Japanese glyphs in fontkit subset output.
  const font = await doc.embedFont(await res.arrayBuffer(), { subset: false });
  doc.setTitle("Hakushu — 私的保存用");
  doc.setCreator("Hakushu");
  const charset = new Set(font.getCharacterSet());
  const printable = (s: string) =>
    Array.from(s, (c) =>
      c === "\n" || c === "\r" || charset.has(c.codePointAt(0)!) ? c : "□",
    ).join("");
  // L判 (89×127mm) prints one message per sheet with larger text.
  const photo = options.layout === "l",
    single = options.layout !== "a4",
    textSize = photo ? 11 : 9,
    lineHeight = photo ? 17 : 13,
    width = (photo ? 89 : 91) * mm,
    height = (photo ? 127 : 55) * mm,
    pad = photo ? 18 : 12,
    perCard = Math.floor((height - 67) / lineHeight) + 1;
  const cards: { m: Message; lines: string[]; part: number; total: number }[] =
    [];
  for (const m of messages) {
    const lines = wrapText(printable(m.body), width - pad * 2, (s) =>
      font.widthOfTextAtSize(s, textSize),
    );
    const total = Math.ceil(lines.length / perCard);
    for (let i = 0; i < total; i++)
      cards.push({
        m,
        lines: lines.slice(i * perCard, (i + 1) * perCard),
        part: i + 1,
        total,
      });
  }
  let page: PDFPage | undefined;
  const fit = (s: string, w: number, size: number) => {
    const chars = graphemes(printable(s));
    while (chars.length && font.widthOfTextAtSize(chars.join(""), size) > w)
      chars.pop();
    return chars.join("");
  };
  cards.forEach((card, index) => {
    if (single || index % 10 === 0)
      page = doc.addPage(single ? [width, height] : [210 * mm, 297 * mm]);
    const col = index % 2,
      row = Math.floor((index % 10) / 2);
    const x = single
      ? 0
      : (options.marginX + options.offsetX + col * (91 + options.gapX)) * mm;
    const y = single
      ? 0
      : 297 * mm -
        (options.marginY + options.offsetY + row * (55 + options.gapY)) * mm -
        height;
    if (options.cropMarks && options.layout === "a4")
      drawMarks(page!, x, y, width, height);
    page!.drawText(
      fit(
        [card.m.sender_name, card.m.page_title || card.m.project_title]
          .filter(Boolean)
          .join(" · "),
        width - 2 * pad,
        8,
      ),
      {
        x: x + pad,
        y: y + height - 20,
        size: 8,
        font,
        color: rgb(0.38, 0.38, 0.38),
      },
    );
    page!.drawLine({
      start: { x: x + pad, y: y + height - 27 },
      end: { x: x + width - pad, y: y + height - 27 },
      thickness: 0.4,
      color: rgb(0.8, 0.8, 0.8),
    });
    card.lines.forEach((line, i) => {
      if (line)
        page!.drawText(line, {
          x: x + pad,
          y: y + height - 43 - i * lineHeight,
          size: textSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
    });
    page!.drawText(
      date(card.m.created_at) +
        "  ·  私的保存用" +
        (card.total > 1 ? `  ${card.part}/${card.total}` : ""),
      { x: x + pad, y: y + 11, size: 7, font, color: rgb(0.45, 0.45, 0.45) },
    );
  });
  return doc.save();
}
function drawMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  for (const xx of [x, x + w])
    for (const yy of [y, y + h]) {
      page.drawLine({
        start: { x: xx - 2, y: yy },
        end: { x: xx + 2, y: yy },
        thickness: 0.3,
        color: rgb(0.6, 0.6, 0.6),
      });
      page.drawLine({
        start: { x: xx, y: yy - 2 },
        end: { x: xx, y: yy + 2 },
        thickness: 0.3,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
}
export async function savePdf(messages: Message[], options: PrintOptions) {
  const bytes = await makePdf(messages, options);
  download(
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
    {
      a4: "hakushu_A4.pdf",
      card: "hakushu_91x55mm.pdf",
      l: "hakushu_L_89x127mm.pdf",
    }[options.layout],
  );
}
