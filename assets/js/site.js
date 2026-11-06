/* =========================================================
   Mobius | موبيوس — what every page shares
   Light/dark, English / Arabic / Kurdish (Badini), search,
   the drawn book covers, the level buttons on subject pages
   and the "link is coming soon" note.
   Needs i18n.js and search-index.js loaded before it.
   ========================================================= */
(function () {
  "use strict";

  var I18N = window.MOBIUS_I18N || { langs: [{ code: "en", name: "English", short: "EN", dir: "ltr" }] };
  var INDEX = window.MOBIUS_INDEX || { subjects: [], books: [] };
  INDEX.playlists = INDEX.playlists || [];
  var root = document.documentElement;
  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // every asset carries the same ?v= stamp (tools/build.py); files loaded later reuse it
  var me = document.currentScript;
  var VERSION = ((me && me.src.match(/[?&]v=([\w-]+)/)) || [])[1] || "";
  var SITE_BASE = "/";
  if (me && me.src) {
    var scriptPath = new URL(me.src, location.href).pathname;
    var scriptSuffix = "/assets/js/site.js";
    if (scriptPath.slice(-scriptSuffix.length) === scriptSuffix) {
      SITE_BASE = scriptPath.slice(0, -scriptSuffix.length) + "/";
    }
  }

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  // Site data uses root-based addresses, while GitHub project sites have a base path.
  function url(path) {
    var value = String(path || "/");
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) {
      return new URL(value, location.href).href;
    }
    var parts = value.match(/^([^?#]*)([?#].*)?$/);
    var pathname = parts[1] || "/";
    var suffix = parts[2] || "";
    if (pathname === "/") {
      pathname = "index.html";
    } else {
      pathname = pathname.replace(/^\/+|\/+$/g, "");
      var lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
      if (lastSegment && !/\.[^./]+$/.test(lastSegment)) pathname += ".html";
    }
    return new URL(SITE_BASE + pathname + suffix, location.origin).href;
  }
  function asset(path) {
    return url(path) + (VERSION ? "?v=" + VERSION : "");
  }
  // "/physics/optics", "/physics/optics.html" and "/physics/optics/" are the same page
  function samePath(a, b) {
    function norm(p) { return p.replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "").replace(/(.)\/$/, "$1"); }
    return norm(a) === norm(b);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* Closes a <dialog> after its leaving animation (see .is-closing in style.css).
     If the dialog is opened again meanwhile, the close is called off. */
  function closeDialog(d, done) {
    if (!d || !d.open) { if (done) done(); return; }
    if (d.classList.contains("is-closing")) return;
    if (REDUCE) { d.close(); if (done) done(); return; }
    d.classList.add("is-closing");
    var over = false;
    function end() {
      if (over) return;
      over = true;
      d.removeEventListener("animationend", onEnd);
      if (!d.classList.contains("is-closing")) return; // opened again
      d.classList.remove("is-closing");
      d.close();
      if (done) done();
    }
    function onEnd(e) { if (e.target === d) end(); }
    d.addEventListener("animationend", onEnd);
    setTimeout(end, 400);
  }

  /* ---------- the book text (book-info.js) ----------
     About half a megabyte, so it is fetched only when a book panel or the
     assistant needs it, and only once for both. */
  var infoPromise = null;
  function loadBookInfo() {
    if (window.MOBIUS_BOOKS) return Promise.resolve(window.MOBIUS_BOOKS);
    if (!infoPromise) {
      infoPromise = new Promise(function (resolve) {
        var s = document.createElement("script");
        s.src = asset("/assets/data/book-info.js");
        s.async = true;
        s.onload = s.onerror = function () { resolve(window.MOBIUS_BOOKS || null); };
        document.head.appendChild(s);
      });
    }
    return infoPromise;
  }

  /* ---------- language ---------- */
  var lang = root.getAttribute("data-lang") || store("mobius-lang") || "en";
  if (lang !== "en" && !I18N[lang]) lang = "en";

  function t(key) {
    var d = I18N[lang];
    return (d && d[key]) || key;
  }
  function tIn(code, key) {
    var d = I18N[code];
    return (d && d[key]) || key;
  }
  function norm(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  // elements whose whole text is one translatable sentence
  var LEAF = [
    ".nav a", ".footer-links a", ".crumbs a", ".crumbs [aria-current]", ".jump a",
    ".hero-line", ".door h2", ".door p", ".section-title", ".section-sub",
    ".level-list strong", ".level-list li > span:last-child",
    ".page-title", ".page-sub", ".field-title small", ".tile-name", ".tile-cap",
    ".subject-head h1", ".figure-cap", ".shelf-head h2", ".book-note", ".banner-hint", ".banner-hint-text", ".cb-kind",
    ".footer-grid h2", ".credits dt", ".footer-base p:last-child",
    ".footer-legal a", ".skip-link", "[data-i18n]"
  ].join(",");

  function swapText(node) {
    if (node.__en === undefined) {
      if (node.children.length) return; // only plain-text elements; equations keep their markup
      node.__en = norm(node.textContent);
    }
    var next = lang === "en" ? node.__en : t(node.__en);
    if (node.textContent !== next) node.textContent = next;
  }

  // elements that mix a text node with child elements
  function swapFirstText(node) {
    var text = null;
    for (var i = 0; i < node.childNodes.length; i++) {
      var n = node.childNodes[i];
      if (n.nodeType === 3 && norm(n.nodeValue)) { text = n; break; }
    }
    if (!text) return;
    if (text.__en === undefined) text.__en = norm(text.nodeValue);
    var lead = /^\s/.test(text.nodeValue) ? " " : "";
    text.nodeValue = lead + (lang === "en" ? text.__en : t(text.__en)) + " ";
  }

  function translatePage() {
    document.querySelectorAll(LEAF).forEach(swapText);
    document.querySelectorAll(".field-title, .footer-about").forEach(swapFirstText);

    // a figure caption that mixes a formula with a few words: the words change, the formula stays
    document.querySelectorAll(".figure-cap").forEach(function (cap) {
      if (!cap.children.length) return;
      cap.childNodes.forEach(function (n) {
        if (n.nodeType !== 3) return;
        if (n.__en === undefined) n.__en = n.nodeValue;
        var key = norm(n.__en), d = I18N[lang];
        n.nodeValue = lang !== "en" && d && d[key] ? n.__en.replace(key, d[key]) : n.__en;
      });
    });

    document.querySelectorAll("[aria-label]").forEach(function (c) {
      if (c.closest(".tools, .search")) return;
      if (c.__en === undefined) c.__en = c.getAttribute("aria-label");
      c.setAttribute("aria-label", lang === "en" ? c.__en : t(c.__en));
    });

    document.querySelectorAll(".pill").forEach(function (p) {
      var label = p.querySelector(".label");
      if (!label) return;
      var m = p.className.match(/lv-(\w+)/);
      var key = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : "All";
      label.textContent = lang === "en" ? key : t(key);
    });

    // tab title: "Classical Mechanics | Mobius", "Calculus | Lectures | Mobius": every part but the name
    if (root.__title === undefined) root.__title = document.title;
    var parts = root.__title.split(" | ");
    document.title = lang === "en" || parts.length < 2 ? root.__title
      : parts.map(function (p, i) { return i < parts.length - 1 ? t(p) : p; }).join(" | ");

    refreshToolLabels();
    if (dialog && dialog.open) renderResults();
  }

  function setLang(code) {
    var info = I18N.langs.filter(function (l) { return l.code === code; })[0] || I18N.langs[0];
    lang = info.code;
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);
    root.setAttribute("dir", info.dir);
    store("mobius-lang", lang);
    translatePage();
    try { document.dispatchEvent(new CustomEvent("mobius:lang", { detail: lang })); } catch (e) {}
  }

  /* ---------- theme ----------
     A choice made with the switch is saved; until then the page follows the device. */
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  function savedTheme() {
    var v = store("mobius-mode");
    return v === "dark" || v === "light" ? v : null;
  }
  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function setTheme(theme, save) {
    root.setAttribute("data-theme", theme);
    if (save) store("mobius-mode", theme);
    paintThemeColor();
    refreshToolLabels();
  }
  if (!root.hasAttribute("data-theme")) root.setAttribute("data-theme", savedTheme() || (darkQuery.matches ? "dark" : "light"));
  function followDevice(e) { if (!savedTheme()) setTheme(e.matches ? "dark" : "light"); }
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", followDevice);
  else if (darkQuery.addListener) darkQuery.addListener(followDevice);

  // the phone's browser bar takes the colour of what is under it: the night sky
  // at the top of the home page, otherwise the page itself
  var isHome = document.body.classList.contains("page-home");
  var overSky = isHome; // a page opens at its top; the first frame below checks
  function paintThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    // the phone's browser bar takes the header's colour: the sky over the home page's hero,
    // else the header's gold
    meta.setAttribute("content", overSky ? "#100d2c" : "#d5b06a");
  }

  /* ---------- home page: the header floats over the sky until you scroll ---------- */
  var floatHeader = isHome ? document.querySelector(".site-header") : null;
  if (floatHeader) {
    var onScroll = function () {
      var top = window.scrollY <= 40;
      if (top === overSky) return;
      overSky = top;
      floatHeader.classList.toggle("is-solid", !top);
      paintThemeColor();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // read the position only once the page is built (reading it earlier forces an extra layout)
    requestAnimationFrame(onScroll);
  }

  // iPhones only show the pressed (:active) look when the page listens for touches
  document.addEventListener("touchstart", function () {}, { passive: true });

  /* ---------- header tools ---------- */
  var ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    sun: '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>',
    moon: '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  var tools, searchBtn, themeBtn, langBtn, langMenu;

  function buildTools() {
    var inner = document.querySelector(".header-inner");
    if (!inner) return;
    tools = el("div", "tools");
    tools.innerHTML =
      '<button type="button" class="tool tool-search">' + ICON.search +
      '<span class="tool-label"></span><kbd class="tool-kbd">/</kbd></button>' +
      '<button type="button" class="tool tool-theme">' + ICON.sun + ICON.moon + "</button>" +
      '<div class="lang"><button type="button" class="tool tool-lang" aria-haspopup="true" aria-expanded="false">' +
      ICON.globe + '<span class="tool-code"></span></button><ul class="lang-menu" role="menu" hidden></ul></div>';
    inner.appendChild(tools);

    searchBtn = tools.querySelector(".tool-search");
    themeBtn = tools.querySelector(".tool-theme");
    langBtn = tools.querySelector(".tool-lang");
    langMenu = tools.querySelector(".lang-menu");

    I18N.langs.forEach(function (l) {
      var li = el("li");
      li.setAttribute("role", "none");
      var b = el("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("data-code", l.code);
      b.setAttribute("lang", l.code);
      b.setAttribute("dir", l.dir);
      b.appendChild(el("span", "lang-short", l.short));
      b.appendChild(el("span", "lang-name", l.name));
      b.addEventListener("click", function () {
        setLang(l.code);
        closeLangMenu(true);
      });
      li.appendChild(b);
      langMenu.appendChild(li);
    });

    searchBtn.addEventListener("click", openSearch);
    themeBtn.addEventListener("click", switchTheme);
    langBtn.addEventListener("click", function () {
      if (langMenu.hidden) openLangMenu(); else closeLangMenu(true);
    });
    document.addEventListener("click", function (e) {
      if (!langMenu.hidden && !e.target.closest(".lang")) closeLangMenu(false);
    });
    tools.querySelector(".lang").addEventListener("focusout", function (e) {
      if (!langMenu.hidden && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) closeLangMenu(false);
    });
    langMenu.addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call(langMenu.querySelectorAll("button"));
      var i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === "Escape") closeLangMenu(true);
    });
  }

  // where supported, the new theme spreads out from the button in a circle
  function switchTheme() {
    var next = currentTheme() === "light" ? "dark" : "light";
    if (REDUCE || !document.startViewTransition) { setTheme(next, true); return; }
    var r = themeBtn.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var far = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.classList.add("vt-theme");
    var vt;
    try { vt = document.startViewTransition(function () { setTheme(next, true); }); }
    catch (e) { root.classList.remove("vt-theme"); setTheme(next, true); return; }
    vt.ready.then(function () {
      root.animate(
        { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + far + "px at " + x + "px " + y + "px)"] },
        { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(function () {});
    var clear = function () { root.classList.remove("vt-theme"); };
    vt.finished.then(clear, clear);
  }

  function openLangMenu() {
    langMenu.hidden = false;
    langBtn.setAttribute("aria-expanded", "true");
    var on = langMenu.querySelector('[aria-checked="true"]') || langMenu.querySelector("button");
    if (on) on.focus();
  }
  function closeLangMenu(refocus) {
    langMenu.hidden = true;
    langBtn.setAttribute("aria-expanded", "false");
    if (refocus) langBtn.focus();
  }

  function refreshToolLabels() {
    if (!tools) return;
    searchBtn.setAttribute("aria-label", t("Search"));
    searchBtn.querySelector(".tool-label").textContent = t("Search");
    var toLight = currentTheme() !== "light";
    themeBtn.setAttribute("aria-label", t(toLight ? "Switch to light mode" : "Switch to dark mode"));
    themeBtn.title = themeBtn.getAttribute("aria-label");
    var info = I18N.langs.filter(function (l) { return l.code === lang; })[0] || I18N.langs[0];
    langBtn.querySelector(".tool-code").textContent = info.short;
    langBtn.setAttribute("aria-label", t("Language") + ": " + info.name);
    langMenu.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-code") === lang ? "true" : "false");
    });
    if (input) {
      input.placeholder = t("Search books and lectures");
      input.setAttribute("aria-label", t("Search"));
      closeBtn.setAttribute("aria-label", t("Close"));
    }
  }

  /* ---------- search ---------- */
  var dialog, input, list, closeBtn, active = -1, rows = [];

  function fold(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[ً-ٰٟـ]/g, "")      // Arabic marks and tatweel
      .replace(/[أإآٱ]/g, "ا").replace(/ى|ي/g, "ی").replace(/ك/g, "ک")
      .replace(/ة/g, "ه").replace(/ە/g, "ه").replace(/ؤ/g, "و")
      .replace(/[—–\-&,.:;'’"()|]/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function subjectNames(name) {
    return [name, tIn("ar", name), tIn("ku", name)].join(" ");
  }

  var LEVEL_ORDER = ["beginner", "easy", "medium", "hard", "extreme"];
  function levelName(lv) {
    return t(lv.charAt(0).toUpperCase() + lv.slice(1));
  }

  INDEX.subjects.forEach(function (s) { s._hay = fold(subjectNames(s.name) + " " + t(s.section)); });
  INDEX.books.forEach(function (b) {
    var s = INDEX.subjects[b.s];
    b._hay = fold(b.title + " " + b.author + " " + (b.note || "") + " " + (s ? subjectNames(s.name) : ""));
    b._title = fold(b.title);
  });
  function subjectHay(list) {
    return list.map(function (i) { var s = INDEX.subjects[i]; return s ? subjectNames(s.name) : ""; }).join(" ");
  }
  INDEX.playlists.forEach(function (p) {
    p._hay = fold(p.title + " " + p.by + " " + p.channel + " " + t("Lectures") + " lectures course " + subjectHay(p.s));
    p._title = fold(p.title);
  });
  // a subject's own page: its hub (Books, Lectures) when it has one
  function subjectHref(s) { return url(s.hub || s.href); }

  function score(hay, title, words) {
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i], at = hay.indexOf(w);
      if (at < 0) return -1;
      total += at === 0 || hay.charAt(at - 1) === " " ? 2 : 1;
      if (title && title.indexOf(w) === 0) total += 2;
    }
    return total;
  }

  function buildDialog() {
    dialog = el("dialog", "search");
    dialog.innerHTML =
      '<div class="search-box">' + ICON.search +
      '<input type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" maxlength="120"' +
      ' role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="search-results" />' +
      '<button type="button" class="search-close">' + ICON.close + "</button></div>" +
      '<div class="search-results" id="search-results" role="listbox"></div>';
    document.body.appendChild(dialog);
    input = dialog.querySelector("input");
    list = dialog.querySelector(".search-results");
    closeBtn = dialog.querySelector(".search-close");
    input.addEventListener("input", function () { active = -1; renderResults(); });
    closeBtn.addEventListener("click", function () { closeDialog(dialog); });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) closeDialog(dialog); });
    dialog.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener("close", function () {
      root.classList.remove("search-open");
      if (searchBtn) searchBtn.focus();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!rows.length) return;
        active = e.key === "ArrowDown" ? (active + 1) % rows.length : (active - 1 + rows.length) % rows.length;
        highlight();
      } else if (e.key === "Enter") {
        var target = rows[active >= 0 ? active : 0];
        if (target) { e.preventDefault(); location.href = target.href; }
      } else if (e.key === "Escape") {
        // one press closes (a search field would otherwise only clear itself first)
        e.preventDefault();
        closeDialog(dialog);
      }
    });
    refreshToolLabels();
  }

  function highlight() {
    rows.forEach(function (r, i) {
      if (!r.id) r.id = "search-opt-" + i;
      r.setAttribute("aria-selected", i === active ? "true" : "false");
      if (i === active) r.scrollIntoView({ block: "nearest" });
    });
    if (active >= 0 && rows[active]) input.setAttribute("aria-activedescendant", rows[active].id);
    else input.removeAttribute("aria-activedescendant");
  }

  function renderResults() {
    var q = fold(input.value);
    list.innerHTML = "";
    rows = [];
    var words = q ? q.split(" ") : [];

    if (!words.length) {
      list.appendChild(el("p", "search-hint", t("Try a book, a course or a subject.")));
      var chips = el("div", "search-chips");
      INDEX.subjects.forEach(function (s) {
        var a = el("a", "search-chip", lang === "en" ? s.name : t(s.name));
        a.href = subjectHref(s);
        chips.appendChild(a);
      });
      list.appendChild(chips);
      return;
    }

    var subjects = [], books = [], courses = [];
    INDEX.subjects.forEach(function (s) {
      var sc = score(s._hay, "", words);
      if (sc >= 0) subjects.push([sc, s]);
    });
    INDEX.books.forEach(function (b) {
      var sc = score(b._hay, b._title, words);
      if (sc >= 0) books.push([sc, b]);
    });
    INDEX.playlists.forEach(function (p) {
      var sc = score(p._hay, p._title, words);
      if (sc >= 0) courses.push([sc, p]);
    });
    var byLevel = function (a, b) {
      return b[0] - a[0] || LEVEL_ORDER.indexOf(a[1].level) - LEVEL_ORDER.indexOf(b[1].level);
    };
    courses.sort(byLevel);
    subjects.sort(function (a, b) { return b[0] - a[0]; });
    books.sort(function (a, b) {
      return b[0] - a[0] || LEVEL_ORDER.indexOf(a[1].level) - LEVEL_ORDER.indexOf(b[1].level);
    });

    if (!subjects.length && !books.length && !courses.length) {
      var none = el("p", "search-empty");
      none.appendChild(document.createTextNode(t("No results for") + " "));
      none.appendChild(el("strong", "", input.value.trim()));
      list.appendChild(none);
      list.appendChild(el("p", "search-hint", t("Try a book, a course or a subject.")));
      return;
    }

    if (subjects.length) {
      list.appendChild(el("h3", "search-group", t("Subjects")));
      subjects.slice(0, 6).forEach(function (pair) {
        var s = pair[1];
        var a = el("a", "result result-subject");
        a.href = subjectHref(s);
        a.setAttribute("role", "option");
        var ic = el("span", "result-orb");
        ic.setAttribute("aria-hidden", "true");
        var txt = el("span", "result-text");
        txt.appendChild(el("span", "result-title", lang === "en" ? s.name : t(s.name)));
        var meta = t(s.section) + " · " + s.count + " " + t("books");
        if (s.hub) meta += " · " + s.lectures + " " + t("courses");
        txt.appendChild(el("span", "result-meta", meta));
        a.appendChild(ic);
        a.appendChild(txt);
        list.appendChild(a);
        rows.push(a);
      });
    }

    if (books.length) {
      var head = el("h3", "search-group", t("Books"));
      head.appendChild(el("span", "search-count", String(books.length)));
      list.appendChild(head);
      books.slice(0, 40).forEach(function (pair) {
        var b = pair[1], s = INDEX.subjects[b.s];
        var a = el("a", "result result-book lv-" + b.level);
        a.href = url(s.href) + "#book-" + b.i;
        a.setAttribute("role", "option");
        var cover = el("span", "result-cover");
        if (b.cover) {
          var img = el("img");
          img.src = url(b.cover);
          img.alt = "";
          img.loading = "lazy";
          img.decoding = "async";
          img.addEventListener("error", function () { img.remove(); });
          cover.appendChild(img);
        }
        var txt = el("span", "result-text");
        var title = el("span", "result-title", b.title);
        title.dir = "ltr";
        var author = el("span", "result-author", b.author);
        author.dir = "ltr";
        var meta = el("span", "result-meta");
        meta.appendChild(el("span", "result-level", levelName(b.level)));
        meta.appendChild(document.createTextNode(" · " + (lang === "en" ? s.name : t(s.name))));
        txt.appendChild(title);
        txt.appendChild(author);
        txt.appendChild(meta);
        a.appendChild(cover);
        a.appendChild(txt);
        list.appendChild(a);
        rows.push(a);
      });
    }

    // lecture courses: title, who teaches it (or its subject), level
    function group(label, found, kind) {
      if (!found.length) return;
      var head = el("h3", "search-group", t(label));
      head.appendChild(el("span", "search-count", String(found.length)));
      list.appendChild(head);
      found.slice(0, 12).forEach(function (pair) {
        var x = pair[1], s = INDEX.subjects[x.s[0]];
        var a = el("a", "result result-" + kind + " lv-" + x.level);
        a.href = url(x.href);
        a.setAttribute("role", "option");
        var ic = el("span", "result-orb result-orb-" + kind);
        ic.setAttribute("aria-hidden", "true");
        var txt = el("span", "result-text");
        var title = el("span", "result-title", x.title);
        title.dir = "ltr";
        txt.appendChild(title);
        if (x.by) {
          var by = el("span", "result-author", x.by);
          by.dir = "ltr";
          txt.appendChild(by);
        }
        var meta = el("span", "result-meta");
        meta.appendChild(el("span", "result-level", levelName(x.level)));
        if (s) meta.appendChild(document.createTextNode(" · " + (lang === "en" ? s.name : t(s.name))));
        txt.appendChild(meta);
        a.appendChild(ic);
        a.appendChild(txt);
        list.appendChild(a);
        rows.push(a);
      });
    }
    group("Lectures", courses, "course");
    highlight();
  }

  // keyed: opened from the keyboard (/ or Ctrl+K), which is done often and quickly, so it
  // opens at once; a tap on the search button lets it drop in
  function openSearch(keyed) {
    if (!dialog) buildDialog();
    if (dialog.open) { dialog.classList.remove("is-closing"); input.focus(); return; }
    if (!langMenu.hidden) closeLangMenu(false);
    root.classList.add("search-open");
    dialog.classList.toggle("is-keyed", keyed === true);
    dialog.showModal();
    renderResults();
    input.focus();
    input.select();
  }

  document.addEventListener("keydown", function (e) {
    var key = e.key || ""; // some events (e.g. browser autofill) have no key
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable);
    if (document.querySelector("dialog[open]")) return; // a panel or the search is already open
    if ((key === "/" && !typing) || (key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      openSearch(true);
    }
  });

  /* ---------- drawn book covers ----------
     Every book gets a cover drawn in its level's colours: the title, the author,
     and the level's orbits (one ring for Beginner up to five for Extreme, like the
     home page). A real cover picture sits on top and fades in once it has loaded;
     with no picture, or one that fails to load, the drawn cover stays. */
  var LEVEL_RING = { beginner: 1, easy: 2, medium: 3, hard: 4, extreme: 5 };
  function hash(str) {
    var hv = 2166136261;
    for (var i = 0; i < str.length; i++) { hv ^= str.charCodeAt(i); hv = Math.imul(hv, 16777619); }
    return hv >>> 0;
  }
  function makeCover(title, author, level) {
    title = norm(title);
    author = norm(author);
    var box = el("span", "cover-blank");
    box.setAttribute("aria-hidden", "true");
    box.dir = "ltr";
    // "Cosmos (TV series)" -> title + kind; "Mechanics: The Theoretical Minimum" -> title + subtitle
    var kind = "", sub = "", m = title.match(/^(.*?)\s*\(([^)]+)\)$/);
    if (m && m[1]) { title = m[1]; kind = m[2]; }
    m = title.match(/^([^:]{3,}):\s+(.+)$/);
    if (m) { title = m[1]; sub = m[2]; }
    var len = title.length + sub.length * 0.6;
    box.setAttribute("data-len", len > 44 ? "l" : len > 26 ? "m" : "s");

    // the orbits sit in one corner; the corner and angle vary a little from book to book
    var hv = hash(title + author), ring = LEVEL_RING[level] || 3;
    var left = hv & 1, cx = left ? 0 : 100, cy = 150;
    var th = (204 + ((hv >>> 1) % 40)) * Math.PI / 180;
    if (left) th = 3 * Math.PI - th;
    var R = 15 + ring * 13, px = cx + R * Math.cos(th), py = cy + R * Math.sin(th);
    var art = '<svg class="cb-art" viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice" focusable="false">' +
      '<circle class="cb-sun" cx="' + cx + '" cy="' + cy + '" r="9"/>';
    for (var i = 1; i <= 5; i++) {
      art += '<circle class="cb-ring' + (i === ring ? " is-on" : i > ring ? " is-out" : "") +
        '" cx="' + cx + '" cy="' + cy + '" r="' + (15 + i * 13) + '"/>';
    }
    art += '<circle class="cb-planet" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4.6"/>' +
      '<circle class="cb-shine" cx="' + (px - 1.5).toFixed(1) + '" cy="' + (py - 1.6).toFixed(1) + '" r="1.3"/></svg>';
    box.innerHTML = art;
    box.style.setProperty("--cb-angle", (158 + (hv % 24)) + "deg");

    box.appendChild(el("span", "cb-title", title));
    if (sub) box.appendChild(el("span", "cb-sub", sub));
    if (kind) {
      // a word such as "Documentary" follows the language; a name such as "Einstein" stays
      var label = el("span", "cb-kind", kind.charAt(0).toUpperCase() + kind.slice(1));
      label.__en = label.textContent;
      label.textContent = lang === "en" ? label.__en : t(label.__en);
      box.appendChild(label);
    }
    box.appendChild(el("span", "cb-rule"));
    box.appendChild(el("span", "cb-author", author));
    return box;
  }

  var bookEls = Array.prototype.slice.call(document.querySelectorAll(".shelves .book"));
  root.classList.add("cover-fx");
  bookEls.forEach(function (book) {
    var cover = book.querySelector(".cover");
    if (!cover) return;
    var title = book.querySelector(".book-title"), author = book.querySelector(".book-author");
    var shelf = book.closest(".shelf");
    cover.insertBefore(makeCover(title ? title.textContent : "", author ? author.textContent : "",
      shelf ? shelf.getAttribute("data-level") : ""), cover.firstChild);
    var img = cover.querySelector("img");
    function blank() { cover.classList.add("is-blank"); cover.classList.remove("is-loaded"); }
    function loaded() { if (img.naturalWidth) cover.classList.add("is-loaded"); else blank(); }
    if (!img || !img.getAttribute("src")) { blank(); return; }
    img.addEventListener("error", blank);
    if (img.complete) loaded();
    else img.addEventListener("load", loaded);
  });

  // covers lean toward the pointer (one style update per frame at most)
  if (!REDUCE && window.matchMedia("(hover: hover)").matches) {
    bookEls.forEach(function (book) {
      var cover = book.querySelector(".cover");
      if (!cover) return;
      var queued = false, px = 0.5, py = 0.5;
      function paint() {
        queued = false;
        cover.style.setProperty("--ry", ((px - 0.5) * 18).toFixed(2) + "deg");
        cover.style.setProperty("--rx", ((0.5 - py) * 14).toFixed(2) + "deg");
        cover.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
        cover.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
      }
      book.addEventListener("pointermove", function (e) {
        var r = cover.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width;
        py = (e.clientY - r.top) / r.height;
        if (!queued) { queued = true; requestAnimationFrame(paint); }
      });
      book.addEventListener("pointerleave", function () {
        px = py = 0.5;
        if (!queued) { queued = true; requestAnimationFrame(paint); }
      });
    });
  }

  /* ---------- level buttons on subject pages ---------- */
  var shelves = Array.prototype.slice.call(document.querySelectorAll(".shelf[data-level]"));
  var pillBox = document.querySelector(".pills");
  if (shelves.length && pillBox) {
    // tools/build.py writes the buttons into the page so nothing moves when they appear;
    // they are made again here with their counts and wired up
    pillBox.textContent = "";
    var counts = {}, total = 0, pills = [];
    shelves.forEach(function (sh) {
      var n = sh.querySelectorAll(".book").length;
      counts[sh.getAttribute("data-level")] = n;
      total += n;
      sh.hidden = n === 0;
      sh.addEventListener("animationend", function (e) { if (e.target === sh) sh.classList.remove("is-entering"); });
    });
    var makePill = function (level, label, n) {
      var b = el("button", "pill" + (level ? " lv-" + level : " pill-all"));
      b.type = "button";
      b.setAttribute("aria-pressed", level ? "false" : "true");
      b.disabled = n === 0;
      var dot = el("span", "planet");
      dot.setAttribute("aria-hidden", "true");
      b.appendChild(dot);
      b.appendChild(el("span", "label", label));
      b.appendChild(el("span", "n", String(n)));
      b.addEventListener("click", function () {
        pills.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        var shown = 0;
        shelves.forEach(function (sh) {
          var lv = sh.getAttribute("data-level");
          sh.hidden = counts[lv] === 0 || (level && lv !== level);
          // the shelves that remain settle into place one after another
          if (!sh.hidden && !REDUCE) {
            sh.classList.remove("is-entering");
            void sh.offsetWidth;
            sh.style.setProperty("--i", shown++);
            sh.classList.add("is-entering");
          }
        });
      });
      pills.push(b);
      pillBox.appendChild(b);
    };
    makePill("", "All", total);
    shelves.forEach(function (sh) {
      var lv = sh.getAttribute("data-level");
      var h2 = sh.querySelector("h2");
      if (counts[lv] > 0) makePill(lv, h2 ? h2.textContent : lv, counts[lv]);
    });
  }

  /* ---------- a newly opened page starts at its top ----------
     Inside a frame (a preview, or iPhones that stretch frames to full height) the
     outer page can keep the scroll position of the previous page. On a fresh visit
     (not Back/Forward or reload, and not a #book link) the page is brought to its
     top, once now and once after it has loaded, unless the visitor already scrolled. */
  function startAtTop() {
    if (location.hash) return;
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (nav && nav.type !== "navigate") return;
    var moved = false;
    var stop = function () { moved = true; };
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (ev) {
      window.addEventListener(ev, stop, { once: true, passive: true });
    });
    var top = function () {
      if (moved) return;
      window.scrollTo(0, 0);
      if (window.top !== window.self) {
        try { root.scrollIntoView({ block: "start" }); } catch (e) {}
      }
    };
    top();
    if (document.readyState === "complete") return;
    window.addEventListener("load", function () { setTimeout(top, 0); }, { once: true });
  }

  /* ---------- arriving from a search result: show the book ---------- */
  function revealBook() {
    var m = location.hash.match(/^#book-(\d+)$/);
    if (!m) return;
    var book = bookEls[+m[1]];
    if (!book) return;
    var shelf = book.closest(".shelf");
    if (shelf && shelf.hidden) {
      var all = document.querySelector(".pill-all");
      if (all) all.click();
    }
    setTimeout(function () {
      book.scrollIntoView({ block: "center", behavior: REDUCE ? "auto" : "smooth" });
      book.classList.add("is-found");
      setTimeout(function () { book.classList.remove("is-found"); }, 2600);
    }, 60);
  }

  /* ---------- "link is coming soon" note ----------
     Shown when someone tries to read or download a book whose href is still "#".
     Tapping a book opens its panel (book-panel.js); the panel calls this note. */
  var SOON = "This book's link is coming soon.";
  var soonToast = null;
  function isSoon(a) { return a && a.classList.contains("book") && a.getAttribute("href") === "#"; }
  function showSoon() {
    if (!soonToast) {
      soonToast = el("div", "soon-toast");
      soonToast.setAttribute("role", "status");
      soonToast.setAttribute("aria-live", "polite");
    }
    // inside an open panel the note must live in the panel, or it would sit behind it
    var host = document.querySelector("dialog[open]") || document.body;
    if (soonToast.parentNode !== host) host.appendChild(soonToast);
    soonToast.textContent = t(SOON);
    soonToast.classList.add("is-on");
    clearTimeout(soonToast._t);
    soonToast._t = setTimeout(function () { soonToast.classList.remove("is-on"); }, 2400);
  }
  document.querySelectorAll('.book[href="#"]').forEach(function (a) {
    a.removeAttribute("target");
    a.classList.add("is-soon");
  });
  // fallback for any book the panel doesn't handle
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!isSoon(a) || e.defaultPrevented) return;
    e.preventDefault();
    showSoon();
  });

  // shared with book-panel.js, chat.js and scenes.js
  window.MobiusCover = { make: makeCover };
  window.MobiusUI = {
    // the assistant's Worker, which also keeps the star ratings
    api: "https://mobius-ai.ts7h2rbpnb.workers.dev",
    lang: function () { return lang; },
    t: function (key) { return lang === "en" ? key : t(key); },
    url: url,
    asset: asset,
    siteBase: SITE_BASE,
    samePath: samePath,
    loadBookInfo: loadBookInfo,
    soon: showSoon,
    closeDialog: closeDialog
  };

  /* ---------- the assistant ----------
     "Ask Mobius" (chat.css, chat.js) is not needed to read a page, so it is fetched once
     the page has finished loading and the browser has a quiet moment: opening a page on
     a phone no longer waits for it. */
  function loadAssistant() {
    if (document.querySelector("script[data-chat]")) return;
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = asset("/assets/css/chat.css");
    css.onload = css.onerror = function () {
      var js = document.createElement("script");
      js.src = asset("/assets/js/chat.js");
      js.async = true;
      js.setAttribute("data-chat", "");
      document.head.appendChild(js);
    };
    document.head.appendChild(css);
  }
  function assistantLater() {
    if ("requestIdleCallback" in window) window.requestIdleCallback(loadAssistant, { timeout: 2500 });
    else setTimeout(loadAssistant, 1200);
  }
  if (document.readyState === "complete") assistantLater();
  else window.addEventListener("load", assistantLater, { once: true });

  /* ---------- start ---------- */
  buildTools();
  setTheme(currentTheme());
  setLang(lang);
  root.classList.remove("i18n-wait");
  startAtTop();
  revealBook();
  window.addEventListener("hashchange", revealBook);
})();
