const attr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
export function embedCode(origin: string, slug: string, tip = false) {
  const base = new URL(origin).origin;
  return `<script src="${attr(base)}/embed.js" data-project="${attr(slug)}"${tip ? ' data-tip="on"' : ""} defer></script>`;
}
