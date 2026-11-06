/* =========================================================
   Mobius | موبيوس — the feedback page
   The visitor's message is written into an email in their own
   email app, addressed to Mobius; they send it from there.
   Nothing is sent or kept by the site itself. The address is
   put together here, so it is not written whole in the page.
   ========================================================= */
(function () {
  "use strict";

  var UI = window.MobiusUI;
  var form = document.querySelector("form.feedback");
  if (!form || !UI) return;

  var mail = form.querySelector(".fb-mail");
  var address = mail.getAttribute("data-u") + "@" + mail.getAttribute("data-d");
  mail.href = "mailto:" + address;
  mail.textContent = address;
  mail.dir = "ltr";

  var msg = form.querySelector("#fb-msg");
  var nameInput = form.querySelector("#fb-name");
  var error = form.querySelector(".fb-error");
  var copyBtn = form.querySelector(".fb-copy");
  var copied = form.querySelector(".fb-copied");

  // the page the visitor came from, when it is on this site: it helps to read the message
  var from = "";
  try {
    var ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === location.origin && ref.pathname !== location.pathname) from = ref.pathname;
  } catch (e) {}

  msg.addEventListener("input", function () { if (msg.value.trim()) error.hidden = true; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = msg.value.trim();
    if (!text) {
      error.hidden = false;
      msg.focus();
      return;
    }
    var picked = form.querySelector("input[name=topic]:checked");
    var topic = picked ? picked.parentNode.querySelector("span").textContent.trim() : "";
    var name = nameInput.value.trim();
    var body = text + "\n\n" + (name ? "— " + name + "\n" : "") + (from ? "(" + location.origin + from + ")" : "");
    var href = "mailto:" + address +
      "?subject=" + encodeURIComponent("Mobius: " + topic) +
      "&body=" + encodeURIComponent(body.trim());
    form.setAttribute("data-sent", href); // what was handed to the email app (the tests read it)
    location.href = href;
  });

  // copying the address, for anyone whose email is not set up in an app on this device
  if (navigator.clipboard && window.isSecureContext) {
    copyBtn.hidden = false;
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(address).then(function () {
        copied.textContent = UI.t("Copied");
        setTimeout(function () { copied.textContent = ""; }, 2500);
      }, function () {});
    });
  }
})();
