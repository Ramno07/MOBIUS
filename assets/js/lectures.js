/* =========================================================
   Mobius | موبيوس — lectures
   1. A subject's Lectures page: show courses by level and by approach.
   2. A course page: pick a video from the list and watch it here.

   Privacy: nothing is fetched from YouTube while a page opens. The player
   (YouTube's privacy-enhanced youtube-nocookie.com) is created only when the
   visitor presses play. Without JavaScript every video is a plain link to YouTube.
   ========================================================= */
(function () {
  "use strict";

  var UI = window.MobiusUI || { t: function (k) { return k; } };
  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  var LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

  /* ---------- 1. filters on a subject's Lectures page ---------- */
  var filters = document.querySelector(".filters");
  if (filters) {
    var items = Array.prototype.slice.call(document.querySelectorAll(".course-item"));
    var shelves = Array.prototype.slice.call(document.querySelectorAll(".lecture-shelf"));
    var empty = document.querySelector(".filter-empty");
    var level = "", cat = "";

    var apply = function () {
      var shown = 0;
      items.forEach(function (it) {
        var ok = (!level || it.getAttribute("data-level") === level) && (!cat || it.getAttribute("data-cat") === cat);
        it.hidden = !ok;
        if (ok) shown++;
      });
      var n = 0;
      shelves.forEach(function (sh) {
        var any = sh.querySelector(".course-item:not([hidden])");
        sh.hidden = !any;
        if (any && !REDUCE) {
          sh.classList.remove("is-entering");
          void sh.offsetWidth;
          sh.style.setProperty("--i", n++);
          sh.classList.add("is-entering");
        }
      });
      if (empty) empty.hidden = shown > 0;
      // the counts on the level buttons follow the chosen approach, and the other way round
      filters.querySelectorAll(".pill").forEach(function (b) {
        var lv = b.getAttribute("data-level");
        var c = items.filter(function (it) {
          return (!lv || it.getAttribute("data-level") === lv) && (!cat || it.getAttribute("data-cat") === cat);
        }).length;
        b.querySelector(".n").textContent = String(c);
      });
      filters.querySelectorAll(".seg-btn .n").forEach(function (el) {
        var c0 = el.parentNode.getAttribute("data-cat");
        el.textContent = String(items.filter(function (it) {
          return it.getAttribute("data-cat") === c0 && (!level || it.getAttribute("data-level") === level);
        }).length);
      });
    };

    shelves.forEach(function (sh) {
      sh.addEventListener("animationend", function (e) { if (e.target === sh) sh.classList.remove("is-entering"); });
    });
    var press = function (group, btn) {
      group.forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
    };
    var pills = Array.prototype.slice.call(filters.querySelectorAll(".pill"));
    var segs = Array.prototype.slice.call(filters.querySelectorAll(".seg-btn"));
    pills.forEach(function (b) {
      b.addEventListener("click", function () { level = b.getAttribute("data-level") || ""; press(pills, b); apply(); });
    });
    segs.forEach(function (b) {
      b.addEventListener("click", function () { cat = b.getAttribute("data-cat") || ""; press(segs, b); apply(); });
    });
  }

  /* ---------- 2. a course page: the video list and the player ---------- */
  var viewer = document.querySelector(".viewer");
  if (!viewer) return;

  var listId = viewer.getAttribute("data-list");
  var playerOrigin = viewer.getAttribute("data-player");
  if (!LIST_ID.test(listId || "") || playerOrigin !== "https://www.youtube-nocookie.com") return;

  var links = Array.prototype.slice.call(viewer.querySelectorAll(".vlist .v")).filter(function (a) {
    return VIDEO_ID.test(a.getAttribute("data-id") || "");
  });
  if (!links.length) return;

  var player = viewer.querySelector(".player");
  var facade = viewer.querySelector(".player-facade");
  var facadeTitle = viewer.querySelector(".facade-title");
  var nowI = viewer.querySelector(".now-i");
  var nowTitle = viewer.querySelector(".now-title");
  var prev = viewer.querySelector(".now-prev");
  var next = viewer.querySelector(".now-next");
  var ytLink = viewer.querySelector(".now-yt");
  var blocked = viewer.querySelector(".now-blocked");
  var list = viewer.querySelector(".vlist");
  var frame = null;
  var current = 0;

  function watchUrl(id) {
    var u = new URL("https://www.youtube.com/watch");
    u.searchParams.set("v", id);
    u.searchParams.set("list", listId);
    return u.href;
  }
  function embedUrl(id) {
    var u = new URL(playerOrigin + "/embed/" + encodeURIComponent(id));
    u.searchParams.set("autoplay", "1");
    u.searchParams.set("rel", "0");
    u.searchParams.set("playsinline", "1");
    return u.href;
  }
  function titleOf(a) {
    var t = a.querySelector(".v-t");
    return t ? t.textContent : "";
  }

  // keeps the chosen video in view inside the list, without moving the page
  function reveal(a) {
    var top = a.offsetTop - list.offsetTop, h = a.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 6;
    else if (top + h > list.scrollTop + list.clientHeight) list.scrollTop = top + h - list.clientHeight + 6;
  }

  function show(i, remember) {
    current = Math.max(0, Math.min(links.length - 1, i));
    var a = links[current], id = a.getAttribute("data-id"), title = titleOf(a);
    links.forEach(function (l, k) {
      if (k === current) l.setAttribute("aria-current", "true");
      else l.removeAttribute("aria-current");
    });
    nowI.textContent = String(current + 1);
    nowTitle.textContent = title;
    if (facadeTitle) facadeTitle.textContent = title;
    ytLink.href = watchUrl(id);
    if (facade) facade.href = watchUrl(id);
    prev.disabled = current === 0;
    next.disabled = current === links.length - 1;
    blocked.hidden = a.getAttribute("data-embed") !== "0";
    reveal(a);
    if (!remember) return;
    try {
      var u = new URL(location.href);
      u.searchParams.set("v", id);
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  function play() {
    var a = links[current], id = a.getAttribute("data-id");
    if (a.getAttribute("data-embed") === "0" || !VIDEO_ID.test(id)) {
      // the owner turned embedding off: the facade stays, as a link to YouTube
      blocked.hidden = false;
      if (frame) { frame.remove(); frame = null; if (facade) facade.hidden = false; }
      return;
    }
    if (!frame) {
      frame = document.createElement("iframe");
      frame.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
      frame.setAttribute("allowfullscreen", "");
      frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      player.appendChild(frame);
      if (facade) facade.hidden = true;
    }
    frame.title = UI.t("YouTube video player") + ": " + titleOf(a);
    frame.src = embedUrl(id);
  }

  function choose(i, andPlay) {
    show(i, true);
    if (andPlay || frame) play();
  }

  function isPlainClick(e) {
    return !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1);
  }

  links.forEach(function (a, i) {
    a.removeAttribute("target");
    a.addEventListener("click", function (e) {
      if (!isPlainClick(e)) return; // a new tab still opens YouTube
      e.preventDefault();
      choose(i, true);
      if (window.matchMedia("(max-width: 999px)").matches) {
        player.scrollIntoView({ block: "start", behavior: REDUCE ? "auto" : "smooth" });
      }
    });
  });
  if (facade) {
    facade.setAttribute("role", "button");
    facade.setAttribute("aria-label", UI.t("Play video"));
    facade.removeAttribute("target");
    facade.addEventListener("click", function (e) {
      if (!isPlainClick(e)) return;
      e.preventDefault();
      play();
    });
    facade.addEventListener("keydown", function (e) {
      if (e.key === " ") { e.preventDefault(); play(); }
    });
  }
  prev.addEventListener("click", function () { choose(current - 1, false); });
  next.addEventListener("click", function () { choose(current + 1, false); });

  // a shared link can name the video: /lectures/<course>?v=<video id>
  var start = 0;
  try {
    var wanted = new URL(location.href).searchParams.get("v");
    if (wanted && VIDEO_ID.test(wanted)) {
      links.forEach(function (a, i) { if (a.getAttribute("data-id") === wanted) start = i; });
    }
  } catch (e) {}
  show(start, false);
})();
