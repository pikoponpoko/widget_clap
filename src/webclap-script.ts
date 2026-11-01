// Run in the browser console on the old service while logged in.
// On the message list it follows the "older month >>" links back to the first
// month and keeps the table rows that hold a time. On the analysis page
// (過去ログ) it follows the "older 旬 >>" links and keeps the past-log box of
// each page. Both are saved as one HTML file that the import panel reads.
// Nothing is sent anywhere else.
export const webclapScript = `(async () => {
  const load = async (url) => {
    const res = await fetch(url, { credentials: "include" });
    const buf = await res.arrayBuffer();
    const cs = (res.headers.get("content-type") || "").match(/charset=([^;]+)/i);
    let html;
    try { html = new TextDecoder(cs ? cs[1].trim() : document.characterSet).decode(buf); }
    catch { html = new TextDecoder(document.characterSet).decode(buf); }
    return new DOMParser().parseFromString(html, "text/html");
  };
  const save = (body, name) => {
    const blob = new Blob(['<meta charset="utf-8">' + body], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };
  if (document.body.textContent.includes("過去ログ")) {
    const pages = [], seen = new Set();
    let url = location.href;
    while (url && !seen.has(url) && pages.length < 1500) {
      seen.add(url);
      const doc = await load(url);
      doc.querySelectorAll("img,script,style,select").forEach((x) => x.remove());
      const box = [...doc.querySelectorAll("table,div,section,td")]
        .filter((x) => x.textContent.includes("過去ログ") && /\\d{1,2}\\/\\d{1,2}/.test(x.textContent))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (box) pages.push('<section data-page="' + url.replace(/"/g, "&quot;") + '">' + box.outerHTML + "</section>");
      document.title = pages.length + "ページ";
      console.log(document.title);
      const next = [...doc.querySelectorAll("a")].map((a) => [a, a.textContent.replace(/\\s+/g, "").match(/^(\\d{4})年\\d{1,2}月[上中下]旬>>$/)]).find((x) => x[1]);
      url = next && +next[1][1] >= 2002 ? new URL(next[0].getAttribute("href"), url).href : null;
      await new Promise((r) => setTimeout(r, 300));
    }
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    save('<div data-hakushu="webclap-claps" data-today="' + today + '">' + pages.join("\\n") + "</div>", "webclap-claps.html");
    console.log("保存しました: " + pages.length + "ページ");
    return;
  }
  const rows = [], seen = new Set();
  let url = location.href, months = 0;
  while (url && !seen.has(url) && months < 400) {
    seen.add(url);
    const doc = await load(url);
    doc.querySelectorAll("tr").forEach((tr) => {
      if (!tr.querySelector("tr") && /\\d{1,2}:\\d{2}/.test(tr.textContent)) rows.push(tr.outerHTML);
    });
    months++;
    document.title = months + "か月 / " + rows.length + "件";
    console.log(document.title);
    const next = [...doc.querySelectorAll("a")].find((a) => {
      const t = a.textContent.replace(/\\s+/g, "");
      return /\\d{4}年\\d{1,2}月>>$/.test(t);
    });
    url = next ? new URL(next.getAttribute("href"), url).href : null;
    await new Promise((r) => setTimeout(r, 300));
  }
  save("<table>" + rows.join("\\n") + "</table>", "webclap-log.html");
  console.log("保存しました: " + months + "か月 / " + rows.length + "件");
})();`;
