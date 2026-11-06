/* =========================================================
   Mobius | موبيوس — star ratings of books and courses
   Five stars to rate a book (in its panel) or a course (on its
   page). The average and the number of ratings come from the
   assistant's Worker (GET /ratings, POST /rate); the visitor's own
   stars are also kept on this device, so they stay lit even when
   the Worker cannot be reached. A browser rates with a random code
   it makes for itself; nothing about the visitor is sent.
   ========================================================= */
(function () {
  "use strict";

  var UI = window.MobiusUI;
  if (!UI || window.MobiusRating) return;

  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.9l2.79 5.86 6.43.82-4.73 4.43 1.22 6.37L12 17.27l-5.71 3.11 1.22-6.37-4.73-4.43 6.43-.82z"/></svg>';
  var known = {}; // id -> {avg, count}, as the Worker last said
  var memory = {}; // the visitor's own stars when this browser keeps nothing

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function myStars() {
    try { return JSON.parse(store("mobius-rated") || "{}") || {}; } catch (e) { return {}; }
  }
  function mine(id) { return myStars()[id] || memory[id] || 0; }
  function keepMine(id, stars) {
    memory[id] = stars;
    var all = myStars();
    all[id] = stars;
    store("mobius-rated", JSON.stringify(all));
  }
  // the browser's own random code: one rating per book or course from this browser
  var voter = null;
  function voterCode() {
    if (voter) return voter;
    var saved = store("mobius-voter");
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return (voter = saved);
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    voter = Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    store("mobius-voter", voter);
    return voter;
  }

  function slug(text) {
    return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  }
  function bookId(title, author) { return "b:" + slug(title + " " + author); }

  function call(path, init) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    init = init || {};
    init.credentials = "omit";
    if (ctrl) init.signal = ctrl.signal;
    return fetch(UI.api + path, init).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error("ratings " + r.status);
      return r.json();
    });
  }

  // the averages of several books or courses in one request
  var asked = {};
  function load(ids) {
    var need = ids.filter(function (id) { return !asked[id]; });
    if (!need.length) return Promise.resolve();
    need.forEach(function (id) { asked[id] = true; });
    return call("/ratings?ids=" + encodeURIComponent(need.slice(0, 60).join(","))).then(function (d) {
      Object.keys(d.ratings || {}).forEach(function (id) { known[id] = d.ratings[id]; });
    }, function () {
      need.forEach(function (id) { asked[id] = false; }); // try again next time
    });
  }

  function words(r) {
    if (!r || !r.count) return UI.t("No ratings yet. Be the first.");
    var key = r.count === 1 ? "{avg} out of 5 (1 rating)" : "{avg} out of 5 ({n} ratings)";
    return UI.t(key).replace("{avg}", r.avg.toFixed(1)).replace("{n}", r.count);
  }

  /* One rating box: a label, five stars (a radio group: arrows move, Enter/Space or a tap
     rates) and a line with the average. */
  function mount(box, id, kind) {
    box.innerHTML = "";
    box.classList.add("rate");
    box.setAttribute("data-rate", id);
    var labelText = UI.t(kind === "course" ? "Rate this course" : "Rate this book");
    var label = document.createElement("p");
    label.className = "rate-label";
    label.textContent = labelText;
    var stars = document.createElement("div");
    stars.className = "rate-stars";
    stars.setAttribute("role", "radiogroup");
    stars.setAttribute("aria-label", labelText);
    var buttons = [];
    for (var v = 1; v <= 5; v++) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "rate-star";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", UI.t(v + " out of 5"));
      b.setAttribute("data-v", v);
      b.innerHTML = STAR;
      stars.appendChild(b);
      buttons.push(b);
    }
    var line = document.createElement("p");
    line.className = "rate-sum";
    var note = document.createElement("p");
    note.className = "rate-note";
    note.setAttribute("role", "status");
    box.appendChild(label);
    box.appendChild(stars);
    box.appendChild(line);
    box.appendChild(note);

    function paint(preview) {
      var chosen = mine(id), lit = preview || chosen;
      buttons.forEach(function (b, i) {
        b.classList.toggle("is-on", i < lit);
        b.setAttribute("aria-checked", String(i + 1 === chosen));
        b.tabIndex = (chosen ? i + 1 === chosen : i === 0) ? 0 : -1;
      });
      line.textContent = words(known[id]);
    }

    function rate(stars) {
      keepMine(id, stars);
      paint();
      note.textContent = "";
      call("/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, stars: stars, voter: voterCode() })
      }).then(function (d) {
        if (d.rating) known[id] = d.rating;
        paint();
        note.textContent = UI.t("Thank you for rating.");
      }, function () {
        note.textContent = UI.t("Saved on this device.");
      });
    }

    buttons.forEach(function (b) {
      b.addEventListener("click", function () { rate(+b.getAttribute("data-v")); });
    });
    // arrows move along the stars and rate, as in any radio group (mirrored right to left)
    stars.addEventListener("keydown", function (e) {
      var rtl = getComputedStyle(stars).direction === "rtl";
      var step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: 1, ArrowDown: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      var next = Math.min(5, Math.max(1, (mine(id) || 0) + step));
      rate(next);
      buttons[next - 1].focus();
    });
    // a pointer that can hover shows what a click would give
    if (window.matchMedia("(hover: hover)").matches) {
      buttons.forEach(function (b) {
        b.addEventListener("mouseenter", function () { paint(+b.getAttribute("data-v")); });
      });
      stars.addEventListener("mouseleave", function () { paint(); });
    }

    paint();
    load([id]).then(function () { paint(); });
  }

  // course pages: every box marked data-rate
  var boxes = document.querySelectorAll("[data-rate]");
  if (boxes.length) {
    var ids = Array.prototype.map.call(boxes, function (b) { return b.getAttribute("data-rate"); });
    load(ids);
    Array.prototype.forEach.call(boxes, function (b) { mount(b, b.getAttribute("data-rate"), b.getAttribute("data-kind")); });
  }

  window.MobiusRating = { mount: mount, load: load, bookId: bookId };
})();
