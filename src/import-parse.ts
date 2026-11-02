// Turns pasted text or a CSV from another clap service into message rows.
export interface ImportRow {
  created_at: string; // ISO (UTC); "" when the source had no date
  sender_name: string;
  body: string;
  reply_wanted?: boolean | null;
  skip?: boolean;
}

const datePattern =
  /^[\s[【(（]*(\d{4}|\d{2})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})\s*日?\s*(?:[(（][^)）]{1,3}[)）])?\s*(?:(\d{1,2})\s*[:時]\s*(\d{1,2})(?:\s*[:分]\s*(\d{1,2}))?\s*秒?)?[\s\]】)）]*/;
const nameLine =
  /^\s*(?:お?名前|ニックネーム|ハンドル(?:ネーム)?|name|from)\s*[:：]\s*(.*)$/i;
const bodyLine =
  /^\s*(?:コメント|メッセージ|本文|内容|comment|message)\s*[:：]\s*/i;
const ignoredLine =
  /^\s*(?:ip|ホスト|host|ua|user-?agent|ブラウザ|拍手数|拍手回数|回数|リファラ|referr?er|ページ|page|url)\s*[:：]|^\s*[-=_*─━・]{3,}\s*$/i;

function pad(n: string) {
  return n.padStart(2, "0");
}

/** Reads a date at the start of a line. Times are taken as Japan time. */
export function readDate(line: string) {
  const m = line.match(datePattern);
  if (!m) return null;
  const year = m[1].length === 2 ? "20" + m[1] : m[1];
  const [mo, d, h = "0", mi = "0", s = "0"] = m.slice(2).map((x) => x ?? "0");
  if (
    +mo < 1 ||
    +mo > 12 ||
    +d < 1 ||
    +d > 31 ||
    +h > 23 ||
    +mi > 59 ||
    +s > 59
  )
    return null;
  const t = Date.parse(
    `${year}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}+09:00`,
  );
  if (Number.isNaN(t)) return null;
  return { iso: new Date(t).toISOString(), rest: line.slice(m[0].length) };
}

function parseCsv(text: string, sep: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const headerKeys = {
  date: /日時|日付|投稿日|受信日|送信日|date|time/i,
  name: /名前|ニックネーム|ハンドル|name/i,
  body: /メッセージ|コメント|本文|内容|message|comment|body|text/i,
};

function fromTable(text: string): ImportRow[] | null {
  const first = text.split("\n", 1)[0];
  const sep = first.includes("\t") ? "\t" : first.includes(",") ? "," : "";
  if (!sep) return null;
  const rows = parseCsv(text, sep);
  const header = rows[0].map((h) => h.trim());
  const col = (re: RegExp, skip: number[] = []) =>
    header.findIndex((h, i) => !skip.includes(i) && re.test(h));
  const body = col(headerKeys.body);
  if (body < 0) return null;
  const date = col(headerKeys.date, [body]),
    name = col(headerKeys.name, [body, date]);
  return rows
    .slice(1)
    .map((r) => ({
      created_at: date >= 0 ? readDate(r[date] || "")?.iso || "" : "",
      sender_name: name >= 0 ? (r[name] || "").trim() : "",
      body: (r[body] || "").trim(),
    }))
    .filter((r) => r.body);
}

const timeOnly = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/;
const dateOnly = (cell: string) => {
  const d = readDate(cell);
  return d && !d.rest.trim() ? d : null;
};
const dayOf = (iso: string) =>
  new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
function at(day: string, h: string, m: string, s = "0") {
  if (+h > 23 || +m > 59 || +s > 59) return "";
  return new Date(
    Date.parse(`${day}T${pad(h)}:${pad(m)}:${pad(s)}+09:00`),
  ).toISOString();
}

/**
 * Reads table rows copied from a clap service's message list. A row counts
 * when one cell is a time (or date and time); a date cell spanning several
 * rows carries over to the following rows.
 */
export function fromCells(rows: string[][]): ImportRow[] {
  const out: ImportRow[] = [];
  let day = "";
  for (const cells of rows) {
    let created = "",
      used = new Set<number>();
    cells.forEach((c, i) => {
      const d = dateOnly(c.trim());
      if (!d) return;
      used.add(i);
      day = dayOf(d.iso);
      if (/\d{1,2}\s*[:時]\s*\d{1,2}/.test(c)) created = d.iso;
    });
    cells.forEach((c, i) => {
      const t = c.match(timeOnly);
      if (!t || created || !day) return;
      used.add(i);
      created = at(day, t[1], t[2], t[3]);
    });
    if (!created) continue;
    const body = cells
      .filter((c, i) => !used.has(i) && c.trim())
      .sort((a, b) => b.trim().length - a.trim().length)[0];
    let [text, name = ""] = (body || "").split(NAME);
    // A reply mark printed after the name belongs to the message.
    const mark = name.match(/\s*(レス(?:不要|希望|要))\s*$/);
    if (mark) {
      name = name.slice(0, mark.index);
      text += " " + mark[1];
    }
    if (text.trim())
      out.push({
        created_at: created,
        sender_name: name.trim(),
        body: text.trim(),
      });
  }
  return out;
}

/** Reads the message table out of a copied or saved web page. */
const NAME = "\u001f";
export function parseImportHtml(html: string): ImportRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc
    .querySelectorAll("script,style,input,select,button")
    .forEach((x) => x.remove());
  // The old service appends the sender as a trailing bold "by name",
  // optionally followed by a "URL" link to their site and the reply mark.
  doc.querySelectorAll("td > b, td > font, td > span").forEach((el) => {
    const m = (el.textContent || "").trim().match(/^by\s+(.+)$/);
    if (!m) return;
    let site = "";
    const rest: Node[] = [];
    for (let n = el.nextSibling; n; n = n.nextSibling) rest.push(n);
    for (const n of rest) {
      const t = (n.textContent || "").trim();
      if (!t || /^レス(不要|希望|要)$/.test(t)) continue;
      const link =
        n.nodeType === 1
          ? (n as HTMLElement).closest("a") ||
            (n as HTMLElement).querySelector("a")
          : null;
      if (t !== "URL" || !link) return;
      site = link.getAttribute("href") || "";
      n.parentNode?.removeChild(n);
    }
    const name = m[1].trim() + (site ? ` (${site})` : "");
    el.replaceWith(`\n${NAME}${name}`);
  });
  const rows = Array.from(doc.querySelectorAll("tr"))
    .filter((tr) => !tr.querySelector("tr"))
    .map((tr) =>
      Array.from(tr.children, (td) =>
        (td.textContent || "")
          .split("\n")
          .map((l) => l.replace(/[ \t]+/g, " ").trim())
          .join("\n")
          .trim(),
      ),
    );
  return finish(fromCells(rows));
}

function fromText(text: string): ImportRow[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const dated = lines.some((l) => readDate(l));
  const out: ImportRow[] = [];
  let cur: ImportRow | null = null,
    body: string[] = [];
  const flush = () => {
    if (cur) {
      cur.body = body.join("\n").trim();
      if (cur.body) out.push(cur);
    }
    cur = null;
    body = [];
  };
  let day = "";
  for (const line of lines) {
    const d = dated ? readDate(line) : null;
    // A row copied from a table whose date cell covers several rows.
    const t = !d && day ? line.match(/^\s*(\d{1,2}):(\d{2})\s+(\S.*)$/) : null;
    if (t) {
      flush();
      cur = { created_at: at(day, t[1], t[2]), sender_name: "", body: "" };
      body.push(t[3]);
      continue;
    }
    if (d) {
      day = dayOf(d.iso);
      flush();
      cur = { created_at: d.iso, sender_name: "", body: "" };
      const rest = d.rest.trim();
      const n = rest.match(nameLine);
      if (n) cur.sender_name = n[1].trim();
      else if (rest) body.push(rest.replace(bodyLine, ""));
      continue;
    }
    if (!dated && !line.trim()) {
      flush();
      continue;
    }
    if (!cur) cur = { created_at: "", sender_name: "", body: "" };
    const n = line.match(nameLine);
    if (n && !cur.sender_name && !body.join("").trim()) {
      cur.sender_name = n[1].trim();
      continue;
    }
    if (ignoredLine.test(line)) continue;
    body.push(line.replace(bodyLine, ""));
  }
  flush();
  return out;
}

export function parseImport(text: string): ImportRow[] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  return finish(fromTable(clean) ?? fromText(clean));
}

const replyMark = /\s*(レス不要|レス希望|レス要)\s*$/;
function finish(rows: ImportRow[]): ImportRow[] {
  return rows.map((r) => {
    const mark = r.body.match(replyMark);
    return {
      created_at: r.created_at,
      sender_name: r.sender_name.slice(0, 50),
      body: r.body.replace(replyMark, "").slice(0, 2000),
      ...(mark ? { reply_wanted: mark[1] !== "レス不要" } : {}),
    };
  });
}
