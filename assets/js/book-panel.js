/* =========================================================
   Mobius | موبيوس — book panel
   Tapping a book opens a panel about it: the book, the author,
   why it is on the list, who it is for, and Read / Download.
   The text lives in book-info.js (English, Arabic, Kurdish); each book
   page fetches only its own books' part of it (assets/data/books/).
   Read and Download use the book's href. While the href is "#",
   they show the "link is coming soon" note instead.
   ========================================================= */
(function () {
  "use strict";

  var UI = window.MobiusUI;
  var books = Array.prototype.slice.call(document.querySelectorAll(".shelves .book"));
  if (!books.length || !UI) return;

  var root = document.documentElement;

  /* The text about this page's books is a small file of its own (tools/build.py cuts it
     from book-info.js), fetched after the page is ready instead of slowing down the first
     view; tapping a book before then fetches it at once. If that file cannot be had, the
     whole book-info.js is used instead. */
  var infoReady = !!(window.MOBIUS_PAGE_BOOKS || window.MOBIUS_BOOKS);
  var started = false, waiting = [];
  function partAddress() {
    var pagePath = location.pathname;
    if (UI.siteBase !== "/" && pagePath.indexOf(UI.siteBase) === 0) {
      pagePath = pagePath.slice(UI.siteBase.length - 1);
    }
    var page = pagePath.replace(/\.html$/, "").replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
    return "/assets/data/books/" + page + ".js";
  }
  function ready() {
    infoReady = true;
    var w = waiting;
    waiting = [];
    w.forEach(function (f) { f(); });
  }
  function whole() { UI.loadBookInfo().then(ready); }
  function loadInfo(done) {
    if (done) waiting.push(done);
    if (infoReady) return ready();
    if (started) return;
    started = true;
    var s = document.createElement("script");
    s.src = UI.asset(partAddress());
    s.async = true;
    s.onload = function () { if (window.MOBIUS_PAGE_BOOKS) ready(); else whole(); };
    s.onerror = whole;
    document.head.appendChild(s);
  }
  function whenIdle() {
    if ("requestIdleCallback" in window) requestIdleCallback(function () { loadInfo(); }, { timeout: 4000 });
    else setTimeout(function () { loadInfo(); }, 1500);
  }
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle);
  var panel, current = null, pushed = false, lastBook = null;

  function tr(key) { return UI.t(key); }
  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function keyOf(book) {
    return norm(book.querySelector(".book-title").textContent) + " — " + norm(book.querySelector(".book-author").textContent);
  }
  function textFor(key) {
    var e = (window.MOBIUS_PAGE_BOOKS || {})[key] || (window.MOBIUS_BOOKS || {})[key];
    if (!e) return null;
    var l = UI.lang();
    // Kurdish falls back to Arabic, then English, field by field
    var order = l === "ku" ? ["ku", "ar", "en"] : l === "ar" ? ["ar", "en"] : ["en"];
    var out = {};
    ["about", "author", "why", "who"].forEach(function (f) {
      for (var i = 0; i < order.length; i++) {
        var d = e[order[i]];
        if (d && d[f]) { out[f] = d[f]; return; }
      }
    });
    out.kind = e.kind || "book";
    return out;
  }

  var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var READ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 5.5c3-1.2 6.3-1 9.5 1 3.2-2 6.5-2.2 9.5-1v13c-3-1.2-6.3-1-9.5 1-3.2-2-6.5-2.2-9.5-1z"/><path d="M12 6.5v13"/></svg>';
  var DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v12M6.5 10l5.5 5.5 5.5-5.5M4 20.5h16"/></svg>';
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';

  function build() {
    panel = document.createElement("dialog");
    panel.className = "book-panel";
    panel.setAttribute("aria-labelledby", "bp-title");
    panel.innerHTML =
      '<button type="button" class="bp-close">' + CLOSE + "</button>" +
      '<div class="bp-scroll">' +
        '<div class="bp-head">' +
          '<div class="bp-cover"></div>' +
          '<div class="bp-meta">' +
            '<p class="bp-level"><span class="planet" aria-hidden="true"></span><span class="bp-level-name"></span><span class="bp-subject"></span></p>' +
            '<h2 id="bp-title" class="bp-title"></h2>' +
            '<p class="bp-author"></p>' +
            '<p class="bp-note"></p>' +
          "</div>" +
        "</div>" +
        '<div class="bp-actions">' +
          '<a class="bp-btn bp-read" target="_blank" rel="noopener"></a>' +
          '<a class="bp-btn bp-down" rel="noopener"></a>' +
        "</div>" +
        '<div class="bp-rate"></div>' +
        '<div class="bp-body"></div>' +
      "</div>";
    document.body.appendChild(panel);
    panel.querySelector(".bp-close").addEventListener("click", close);
    panel.addEventListener("click", function (e) { if (e.target === panel) close(); });
    panel.addEventListener("cancel", function (e) { e.preventDefault(); close(); });
    panel.querySelector(".bp-read").addEventListener("click", linkClick);
    panel.querySelector(".bp-down").addEventListener("click", linkClick);
  }

  /* Star ratings (rating.js) are fetched the first time a panel opens, with the averages of
     every book on the page in one request. */
  var ratingReady = null;
  function withRating(done) {
    if (!ratingReady) {
      ratingReady = new Promise(function (resolve) {
        if (window.MobiusRating) return resolve(window.MobiusRating);
        var s = document.createElement("script");
        s.src = UI.asset("/assets/js/rating.js");
        s.async = true;
        s.onload = s.onerror = function () { resolve(window.MobiusRating || null); };
        document.head.appendChild(s);
      }).then(function (R) {
        if (R) R.load(books.map(function (b) { return R.bookId(norm(b.querySelector(".book-title").textContent), norm(b.querySelector(".book-author").textContent)); }));
        return R;
      });
    }
    ratingReady.then(function (R) { if (R) done(R); });
  }

  function linkClick(e) {
    var href = current && current.getAttribute("href");
    if (!href || href === "#") {
      e.preventDefault();
      UI.soon();
    }
  }

  function fill(book) {
    var key = keyOf(book);
    var info = textFor(key) || {};
    var shelf = book.closest(".shelf");
    var level = shelf ? shelf.getAttribute("data-level") : "";
    var subject = document.querySelector(".subject-head h1");
    var href = book.getAttribute("href") || "#";

    panel.className = "book-panel" + (level ? " lv-" + level : "");
    panel.querySelector(".bp-level-name").textContent = level ? tr(level.charAt(0).toUpperCase() + level.slice(1)) : "";
    panel.querySelector(".bp-subject").textContent = subject ? subject.textContent : "";
    var title = norm(book.querySelector(".book-title").textContent);
    var author = norm(book.querySelector(".book-author").textContent);
    panel.querySelector(".bp-title").textContent = title;
    panel.querySelector(".bp-author").textContent = author;
    var rateBox = panel.querySelector(".bp-rate");
    rateBox.innerHTML = "";
    withRating(function (R) { if (current === book) R.mount(rateBox, R.bookId(title, author), "book"); });
    var note = book.querySelector(".book-note");
    var noteEl = panel.querySelector(".bp-note");
    noteEl.textContent = note ? note.textContent : "";
    noteEl.hidden = !note;

    // cover: reuse the shelf's picture once it has loaded, or the drawn cover
    var coverBox = panel.querySelector(".bp-cover");
    coverBox.innerHTML = "";
    var img = book.querySelector(".cover img");
    var shelfCover = book.querySelector(".cover");
    if (img && img.getAttribute("src") && img.complete && img.naturalWidth !== 0 && !(shelfCover && shelfCover.classList.contains("is-blank"))) {
      var c = document.createElement("img");
      c.src = img.src;
      c.alt = "";
      coverBox.appendChild(c);
    } else if (window.MobiusCover) {
      coverBox.appendChild(window.MobiusCover.make(
        book.querySelector(".book-title").textContent,
        book.querySelector(".book-author").textContent,
        level));
    } else {
      var blank = document.createElement("span");
      blank.className = "cover-blank";
      blank.textContent = norm(book.querySelector(".book-title").textContent);
      coverBox.appendChild(blank);
    }

    // buttons
    var read = panel.querySelector(".bp-read"), down = panel.querySelector(".bp-down");
    var video = info.kind === "video";
    read.innerHTML = (video ? PLAY : READ) + "<span></span>";
    read.querySelector("span").textContent = tr(video ? "Watch" : "Read online");
    down.innerHTML = DOWN + "<span></span>";
    down.querySelector("span").textContent = tr("Download PDF");
    down.hidden = video || info.kind === "article-web";
    read.href = href;
    down.href = href;
    if (href !== "#") down.setAttribute("download", ""); else down.removeAttribute("download");

    // sections
    var body = panel.querySelector(".bp-body");
    body.innerHTML = "";
    if (!infoReady) {
      // text not here yet: show the panel now, fill it the moment the text arrives
      body.setAttribute("aria-busy", "true");
      loadInfo(function () { if (current === book) fill(book); });
      return;
    }
    body.removeAttribute("aria-busy");
    var parts = [
      ["about", video ? "About" : info.kind === "article" ? "About the article" : "About the book"],
      ["author", video ? "About the creator" : "About the author"],
      ["why", "Why we recommend it"],
      ["who", "Who it's for"]
    ];
    var any = false;
    parts.forEach(function (p) {
      if (!info[p[0]]) return;
      any = true;
      var sec = document.createElement("section");
      var h = document.createElement("h3");
      h.textContent = tr(p[1]);
      var para = document.createElement("p");
      para.textContent = info[p[0]];
      sec.appendChild(h);
      sec.appendChild(para);
      body.appendChild(sec);
    });
    if (!any) {
      var p = document.createElement("p");
      p.className = "bp-empty";
      p.textContent = tr("A description of this book is coming soon.");
      body.appendChild(p);
    }
    panel.querySelector(".bp-close").setAttribute("aria-label", tr("Close"));
  }

  function open(book) {
    if (!panel) build();
    current = book;
    lastBook = book;
    fill(book);
    panel.querySelector(".bp-scroll").scrollTop = 0;
    var reopening = panel.open && panel.classList.contains("is-closing");
    if (reopening) panel.classList.remove("is-closing"); // tapped again while it was leaving
    if (!panel.open || reopening) {
      if (!panel.open) panel.showModal();
      root.classList.add("book-open");
      // the phone's back button closes the panel instead of leaving the page
      try { history.pushState({ mobiusBook: true }, ""); pushed = true; } catch (e) { pushed = false; }
    }
    panel.querySelector(".bp-close").focus();
  }

  function close() {
    if (!panel || !panel.open || panel.classList.contains("is-closing")) return;
    if (pushed) { pushed = false; history.back(); return; } // popstate finishes the close
    finishClose();
  }
  function finishClose() {
    function after() {
      root.classList.remove("book-open");
      current = null;
      if (lastBook) lastBook.focus({ preventScroll: true });
    }
    if (!panel || !panel.open) { after(); return; }
    // the panel slides away first (ui.css), then closes
    if (UI.closeDialog) UI.closeDialog(panel, after);
    else { panel.close(); after(); }
  }
  window.addEventListener("popstate", function () {
    if (panel && panel.open) { pushed = false; finishClose(); }
  });

  books.forEach(function (book) {
    // a finger on a book is a strong hint: start fetching the text straight away
    book.setAttribute("aria-haspopup", "dialog");
    book.addEventListener("pointerdown", function () { loadInfo(); }, { passive: true });
    book.addEventListener("click", function (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
        if (book.getAttribute("href") !== "#") return; // let people open a real link in a new tab
      }
      e.preventDefault();
      open(book);
    });
  });

  // keep the open panel in the chosen language
  document.addEventListener("mobius:lang", function () {
    if (panel && panel.open && current) fill(current);
  });
})();
