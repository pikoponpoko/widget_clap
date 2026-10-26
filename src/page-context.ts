// Set by embed.js on the button and thank-you frames; empty when a page is opened directly.
const query = new URLSearchParams(location.search);
export const pageContext = {
  page_url: query.get("page") || "",
  page_title: query.get("page_title") || "",
};
export const tipRequested = query.get("tip") === "1";
