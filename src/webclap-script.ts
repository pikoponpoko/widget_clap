// Run in the browser console on the old service's message list while logged in.
// It follows the "older month >>" links from the open month back to the first,
// keeps only the table rows that hold a time, and saves them as one HTML file
// that the import panel reads. Nothing is sent anywhere else.
export const webclapScript = `(async () => {
  const rows = [], seen = new Set();
  let url = location.href, months = 0;
  while (url && !seen.has(url) && months < 400) {
    seen.add(url);
    const res = await fetch(url, { credentials: "include" });
    const buf = await res.arrayBuffer();
    const cs = (res.headers.get("content-type") || "").match(/charset=([^;]+)/i);
    let html;
    try { html = new TextDecoder(cs ? cs[1].trim() : document.characterSet).decode(buf); }
    catch { html = new TextDecoder(document.characterSet).decode(buf); }
    const doc = new DOMParser().parseFromString(html, "text/html");
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
  const blob = new Blob(['<meta charset="utf-8"><table>' + rows.join("\\n") + "</table>"], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "webclap-log.html";
  a.click();
  console.log("保存しました: " + months + "か月 / " + rows.length + "件");
})();`;
