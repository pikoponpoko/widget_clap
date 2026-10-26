/* Small inline button + isolated modal. No host-page styles or content are changed. */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute("data-project");
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) return;
  var origin = new URL(script.src, document.baseURI).origin;
  var instance = crypto.randomUUID();
  var host = document.createElement("span");
  host.setAttribute("data-creator-support", slug);
  host.style.display = "inline-block";
  host.style.verticalAlign = "middle";
  host.style.maxWidth = "100%";
  var shadow = host.attachShadow({ mode: "open" });
  var style = document.createElement("style");
  if (script.nonce) style.nonce = script.nonce;
  style.textContent =
    ":host{display:inline-block;vertical-align:middle;max-width:100%}iframe{border:0;display:block;background:transparent}dialog{box-sizing:border-box;width:440px;max-width:calc(100vw - 24px);height:86vh;height:86dvh;max-height:900px;padding:0;border:1px solid #ddd;border-radius:12px;background:white;color:#292929;box-shadow:0 15px 60px #0003}dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:#0006}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding:9px 14px;font:12px/1.5 system-ui,sans-serif}header button{width:34px;height:34px;border:0;border-radius:6px;background:#f5f5f5;color:#333;font-size:23px;cursor:pointer}header button:focus-visible{outline:2px solid #444}dialog iframe{width:100%;flex:1;min-height:0}";
  var frame = document.createElement("iframe");
  frame.width = "128";
  frame.height = "52";
  frame.title = "拍手ボタン";
  frame.loading = "lazy";
  frame.referrerPolicy = "no-referrer";
  frame.style.maxWidth = "100%";
  var buttonUrl = new URL("/button/" + encodeURIComponent(slug), origin);
  buttonUrl.searchParams.set("instance", instance);
  buttonUrl.searchParams.set("parent_origin", location.origin);
  frame.src = buttonUrl.href;
  var dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "拍手のお礼と任意の感想");
  var header = document.createElement("header");
  var title = document.createElement("span");
  title.textContent = "Web拍手";
  var close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "お礼画面を閉じる");
  header.append(title, close);
  var content = document.createElement("iframe");
  content.title = "拍手のお礼と任意のメッセージ";
  content.referrerPolicy = "no-referrer";
  content.setAttribute("allow", "clipboard-write");
  dialog.append(header, content);
  shadow.append(style, frame, dialog);
  script.insertAdjacentElement("afterend", host);
  function closeDialog() {
    dialog.close();
    frame.focus({ preventScroll: true });
    content.removeAttribute("src");
  }
  close.addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", function (e) {
    e.preventDefault();
    closeDialog();
  });
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) {
      var r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        closeDialog();
    }
  });
  function receive(event) {
    if (
      !host.isConnected ||
      event.origin !== origin ||
      event.source !== frame.contentWindow
    )
      return;
    var data = event.data;
    if (
      !data ||
      data.type !== "creator-support:open" ||
      data.instance !== instance ||
      data.project !== slug ||
      !["clap", "message", "favorite"].includes(data.reason)
    )
      return;
    var url = new URL("/widget/" + encodeURIComponent(slug), origin);
    url.searchParams.set("after", data.reason);
    if (typeof dialog.showModal !== "function") {
      var link = document.createElement("a");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "お礼画面を開く";
      shadow.append(link);
      return;
    }
    content.src = url.href;
    if (!dialog.open) dialog.showModal();
    close.focus();
  }
  window.addEventListener("message", receive);
})();
