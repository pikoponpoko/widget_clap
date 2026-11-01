// Turns pasted text or a CSV from another clap service into message rows.
export interface ImportRow {
  created_at: string; // ISO (UTC); "" when the source had no date
  sender_name: string;
  body: string;
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
  for (const line of lines) {
    const d = dated ? readDate(line) : null;
    if (d) {
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
  const rows = fromTable(clean) ?? fromText(clean);
  return rows.map((r) => ({
    created_at: r.created_at,
    sender_name: r.sender_name.slice(0, 50),
    body: r.body.slice(0, 2000),
  }));
}
