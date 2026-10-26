const attr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
export function embedCode(
  origin: string,
  slug: string,
  tip = false,
  tipLabel = "",
) {
  const base = new URL(origin).origin;
  const label = tip && tipLabel ? ` data-tip-label="${attr(tipLabel)}"` : "";
  return `<script src="${attr(base)}/embed.js" data-project="${attr(slug)}"${tip ? ' data-tip="on"' : ""}${label} defer></script>`;
}
