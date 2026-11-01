// Set by embed.js on the button and thank-you frames; empty when a page is opened directly.
const query = new URLSearchParams(location.search);
export const pageContext = {
  page_url: query.get("page") || "",
  page_title: query.get("page_title") || "",
};
import { browserAttrs } from "./attributes";
// Sent with a clap only: language, screen and the host of the page the visitor came from.
export const clapContext = {
  ...pageContext,
  ...browserAttrs((query.get("ref") || "").slice(0, 253)),
};
export const tipRequested = query.get("tip") === "1";
export const defaultTipLabel = "任意の支援をする";
// Label chosen by the site owner with data-tip-label; React renders it as plain text.
export function cleanTipLabel(s: string | null | undefined) {
  return Array.from((s || "").replace(/[\u0000-\u001F\u007F<>]/g, "").trim())
    .slice(0, 30)
    .join("");
}
export const tipLabel =
  cleanTipLabel(query.get("tip_label")) || defaultTipLabel;
