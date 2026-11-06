/* =========================================================
   Mobius | موبيوس — the moving figures
   Every <canvas data-anim="name"> draws one small physics or
   maths scene that reacts to the pointer (mouse or finger).
   On a subject page the big figure also answers a tap or a
   click (each scene's .tap), and a small button under the
   header names what it does (its .hint, translated in i18n.js).
   ========================================================= */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia("(pointer: coarse)").matches;
  // the scroll position, kept from scroll events: reading window.scrollY while drawing
  // would make the browser lay the page out again in the middle of a frame
  var scrollTop = 0;
  window.addEventListener("scroll", function () { scrollTop = window.scrollY; }, { passive: true });
  var root = getComputedStyle(document.documentElement);
  function tok(name, fallback) {
    var v = root.getPropertyValue(name).trim();
    return v || fallback;
  }
  var COL = {
    star: tok("--star", "#f6f1e7"),
    dust: tok("--dust", "#a7a1c8"),
    brass: tok("--brass", "#f2b544"),
    rose: tok("--rose", "#ff7a93"),
    ice: tok("--ice", "#8fd3ff"),
    tile: tok("--panel", "#131034"),
    b: tok("--lv-beginner", "#6fe3b4"),
    e: tok("--lv-easy", "#77c6ff"),
    m: tok("--lv-medium", "#f2b544"),
    h: tok("--lv-hard", "#ff7a6b"),
    x: tok("--lv-extreme", "#c39bff")
  };

  /* ---------- small helpers ---------- */
  var TAU = Math.PI * 2;
  function hexRgb(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var rgbCache = {};
  function rgba(hex, a) {
    var c = rgbCache[hex] || (rgbCache[hex] = hexRgb(hex));
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }
  function mix(h1, h2, t) {
    var a = rgbCache[h1] || (rgbCache[h1] = hexRgb(h1));
    var b = rgbCache[h2] || (rgbCache[h2] = hexRgb(h2));
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function glow(c, x, y, r, col, a) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  function dot(c, x, y, r, col) {
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  function line(c, x1, y1, x2, y2) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  function arrow(c, x1, y1, x2, y2, col, wdt) {
    var a = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(5, wdt * 3.2);
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = wdt;
    line(c, x1, y1, x2 - Math.cos(a) * hl * 0.6, y2 - Math.sin(a) * hl * 0.6);
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - hl * Math.cos(a - 0.45), y2 - hl * Math.sin(a - 0.45));
    c.lineTo(x2 - hl * Math.cos(a + 0.45), y2 - hl * Math.sin(a + 0.45));
    c.closePath();
    c.fill();
  }
  function stepTime(s, t) {
    var dt = s.lt === undefined ? 1 / 60 : t - s.lt;
    s.lt = t;
    return clamp(dt, 0, 0.05);
  }
  // pointer in canvas pixels, or a slow wandering point when the pointer is away
  function pointer(p, w, h, t, rx, ry) {
    var wx = w * (0.5 + (rx || 0.28) * Math.cos(t * 0.37)),
        wy = h * (0.5 + (ry || 0.25) * Math.sin(t * 0.53));
    return [lerp(wx, p.x * w, p.a), lerp(wy, p.y * h, p.a)];
  }

  /* A ringed planet lit from the upper left. Its cloud bands curve along the
     ring plane (we see it from a little above), the far side falls into night,
     a thin rim of atmosphere catches the light, and the ring throws a shadow.
     It is costly, so callers paint it once into a layer and reuse that. */
  var RING_BANDS = [
    // [size, width, strength, star-coloured?]
    [0.6, 0.05, 0.2, 0],
    [0.68, 0.08, 0.34, 1],
    [0.77, 0.1, 0.46, 0],
    [0.845, 0.03, 0.12, 1],
    [0.9, 0.07, 0.36, 1],
    [0.97, 0.05, 0.22, 0],
    [1.02, 0.015, 0.14, 1]
  ];
  var ELEV = 0.25; // how far above the ring plane we look from (radians)

  function drawRingedPlanet(c, x, y, r, tilt, t, colA, colB) {
    var rx = r * 2.05, ry = rx * Math.sin(ELEV);
    var night = "#05040f";
    function rings(front) {
      c.save();
      c.translate(x, y);
      c.rotate(tilt);
      c.beginPath();
      if (front) c.rect(-rx * 1.3, 0, rx * 2.6, ry * 2.6);
      else c.rect(-rx * 1.3, -ry * 2.6, rx * 2.6, ry * 2.6);
      c.clip();
      for (var i = 0; i < RING_BANDS.length; i++) {
        var B = RING_BANDS[i];
        c.strokeStyle = rgba(B[3] ? COL.star : colA, B[2] * (front ? 1 : 0.7));
        c.lineWidth = r * B[1];
        c.beginPath();
        c.ellipse(0, 0, rx * B[0], ry * B[0], 0, 0, TAU);
        c.stroke();
      }
      c.restore();
    }
    // the front half of a line of latitude, as seen from just above the rings
    function lat(phi, back) {
      var cy = -r * Math.sin(phi) * Math.cos(ELEV), a = r * Math.cos(phi), b = a * Math.sin(ELEV);
      if (back) c.ellipse(0, cy, a, b, 0, Math.PI, 0, true);
      else c.ellipse(0, cy, a, b, 0, 0, Math.PI, false);
    }
    function band(p1, p2, col, alpha) {
      // three widening passes give the band soft edges
      for (var k = 0; k < 3; k++) {
        var d = k * 0.025;
        c.fillStyle = rgba(col, alpha / 3);
        c.beginPath();
        lat(p1 + d, false);
        lat(p2 - d, true);
        c.closePath();
        c.fill();
      }
    }

    rings(false);

    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.clip();
    var lx = x - r * 0.42, ly = y - r * 0.48;
    var g = c.createRadialGradient(lx, ly, r * 0.04, x - r * 0.1, y - r * 0.12, r * 1.2);
    g.addColorStop(0, mix(colA, "#ffffff", 0.42));
    g.addColorStop(0.38, colA);
    g.addColorStop(1, mix(colB, night, 0.3));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);

    c.save();
    c.translate(x, y);
    c.rotate(tilt);
    band(0.62, 0.42, colB, 0.22);
    band(0.34, 0.2, COL.star, 0.16);
    band(0.12, -0.04, colB, 0.2);
    band(-0.14, -0.3, COL.star, 0.12);
    band(-0.4, -0.62, colB, 0.18);
    // the ring's shadow on the clouds, just below the ring in front
    c.strokeStyle = rgba(night, 0.26);
    c.lineWidth = r * 0.2;
    c.beginPath();
    c.ellipse(r * 0.05, r * 0.09, rx * 0.74, ry * 0.74, 0, 0, Math.PI);
    c.stroke();
    c.restore();

    // night side
    var n = c.createRadialGradient(lx, ly, r * 0.1, lx, ly, r * 1.75);
    n.addColorStop(0, rgba(night, 0));
    n.addColorStop(0.5, rgba(night, 0));
    n.addColorStop(0.78, rgba(night, 0.42));
    n.addColorStop(1, rgba(night, 0.82));
    c.fillStyle = n;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();

    // a thin rim of lit atmosphere on the sunny side
    var rim = c.createLinearGradient(x - r, y - r, x + r * 0.4, y + r * 0.4);
    rim.addColorStop(0, "rgba(255,255,255,0.55)");
    rim.addColorStop(0.55, "rgba(255,255,255,0)");
    c.strokeStyle = rim;
    c.lineWidth = Math.max(1, r * 0.03);
    c.beginPath();
    c.arc(x, y, r - c.lineWidth / 2, 0, TAU);
    c.stroke();

    rings(true);
  }

  // a small moon with its own day and night sides
  function drawMoon(c, x, y, r, lightLeft) {
    var lx = x + (lightLeft ? -0.45 : 0.45) * r, ly = y - 0.45 * r;
    var g = c.createRadialGradient(lx, ly, r * 0.08, x, y, r * 1.15);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, mix(COL.ice, "#ffffff", 0.35));
    g.addColorStop(1, mix(COL.ice, "#141a36", 0.72));
    dot(c, x, y, r, g);
  }

  /* Light from a star passing a point mass: the star shows up twice, once pushed
     out past the Einstein ring (radius rE) and once, fainter, on the far side inside
     it, each image stretched along the ring and brightened by the lens. */
  function lensedStar(c, qx, qy, dx, dy, rE2, size, alpha) {
    var r = Math.sqrt(dx * dx + dy * dy) || 0.01, ux = dx / r, uy = dy / r;
    var root2 = Math.sqrt(r * r + 4 * rE2);
    var u2 = (r * r) / rE2, mu = (u2 + 2) / (2 * Math.sqrt(u2 * (u2 + 4)));
    var ang = Math.atan2(uy, ux) + Math.PI / 2;
    var rp = (r + root2) / 2, mp = Math.min(mu + 0.5, 6);
    c.globalAlpha = Math.min(1, alpha * (0.6 + 0.4 * mp));
    c.beginPath();
    c.ellipse(qx + ux * rp, qy + uy * rp, size * Math.min(mp, 4.5), size * 0.9, ang, 0, TAU);
    c.fill();
    var mm = mu - 0.5;
    if (mm > 0.08) {
      var rm = (r - root2) / 2; // negative: the image on the far side of the lens
      c.globalAlpha = Math.min(1, alpha * mm * 0.9);
      c.beginPath();
      c.ellipse(qx + ux * rm, qy + uy * rm, size * Math.min(mm, 3) * 0.8, size * 0.6, ang, 0, TAU);
      c.fill();
    }
  }

  // the lens itself: a faint band of piled-up starlight at the Einstein ring, warm gas
  // just outside the shadow, the shadow, and its photon ring, brighter on the side turning toward us
  function blackHole(c, x, y, rE, a) {
    var rs = rE * 0.4;
    var band = c.createRadialGradient(x, y, rE * 0.7, x, y, rE * 1.3);
    band.addColorStop(0, rgba(COL.star, 0));
    band.addColorStop(0.5, rgba(COL.star, 0.06 * a));
    band.addColorStop(1, rgba(COL.star, 0));
    c.fillStyle = band;
    c.beginPath();
    c.arc(x, y, rE * 1.3, 0, TAU);
    c.fill();
    var gas = c.createRadialGradient(x, y, rs, x, y, rs * 2.2);
    gas.addColorStop(0, rgba(COL.brass, 0.2 * a));
    gas.addColorStop(1, rgba(COL.brass, 0));
    c.fillStyle = gas;
    c.beginPath();
    c.arc(x, y, rs * 2.2, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(3,2,10," + (0.97 * a).toFixed(3) + ")";
    c.beginPath();
    c.arc(x, y, rs, 0, TAU);
    c.fill();
    var ring = c.createLinearGradient(x - rs, y, x + rs, y);
    ring.addColorStop(0, rgba("#fff1cf", 0.9 * a));
    ring.addColorStop(1, rgba(COL.brass, 0.22 * a));
    c.strokeStyle = ring;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x, y, rs, 0, TAU);
    c.stroke();
  }

  // canvas text for the few numbers some figures show (angles, n, det)
  function label(c, text, x, y, col, align) {
    c.font = "600 12px Onest, system-ui, sans-serif";
    c.direction = "ltr"; // numbers read left to right on Arabic and Kurdish pages too
    c.textAlign = align || "left";
    c.textBaseline = "alphabetic";
    c.fillStyle = col;
    c.fillText(text, x, y);
  }

  /* ---------- the scenes ---------- */
  var A = {};

  // Hero: a star chart you can move through. Everything that does not change
  // (nebulae, chart grid, distant stars, the planet) is painted once into
  // offscreen layers; each frame only moves those layers and draws the near stars.
  function layer(w, h, scale) {
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * scale));
    cv.height = Math.max(1, Math.round(h * scale));
    var cx = cv.getContext("2d");
    cx.setTransform(scale, 0, 0, scale, 0, 0);
    return { cv: cv, c: cx };
  }

  A.cosmos = function (c, w, h, t, p, s) {
    var M = 70; // room for parallax around the edges
    if (!s.far) {
      var scale = c.canvas.width / w;
      var big0 = Math.min(w, h), area = (w * h) / 12000;
      // far layer: nebulae, chart grid, ecliptic, faint stars
      var F = layer(w + 2 * M, h + 2 * M, scale), f = F.c;
      f.translate(M, M);
      glow(f, w * 0.72, h * 0.3, big0 * 0.7, COL.x, 0.09);
      glow(f, w * 0.92, h * 0.85, big0 * 0.55, COL.rose, 0.07);
      var gx0 = w * 0.18, gy0 = h * 2.4, R0 = h * 1.55, step = h * 0.22;
      f.lineWidth = 1;
      for (var k = 0; k < 7; k++) {
        var rr = R0 + k * step;
        f.strokeStyle = rgba(COL.star, 0.05);
        f.beginPath();
        f.arc(gx0, gy0, rr, Math.PI * 1.05, Math.PI * 1.95);
        f.stroke();
      }
      f.strokeStyle = rgba(COL.star, 0.04);
      for (var m = -6; m <= 6; m++) {
        var ang = -Math.PI / 2 + m * 0.11;
        line(f, gx0 + Math.cos(ang) * R0, gy0 + Math.sin(ang) * R0,
          gx0 + Math.cos(ang) * (R0 + 7 * step), gy0 + Math.sin(ang) * (R0 + 7 * step));
      }
      f.strokeStyle = rgba(COL.brass, 0.14);
      f.setLineDash([2, 6]);
      f.beginPath();
      for (var ex = -M; ex <= w + M; ex += 12) {
        var ey = h * 0.62 - Math.sin((ex / w) * Math.PI) * h * 0.28;
        if (ex === -M) f.moveTo(ex, ey); else f.lineTo(ex, ey);
      }
      f.stroke();
      f.setLineDash([]);
      var nFar = Math.round(area * 3.4);
      for (var i = 0; i < nFar; i++) {
        f.globalAlpha = rand(0.25, 0.8);
        dot(f, rand(-M, w + M), rand(-M, h + M), rand(0.3, 0.75), Math.random() < 0.1 ? COL.ice : COL.star);
      }
      f.globalAlpha = 1;
      // middle layer: brighter stars on their own sheet
      var Mid = layer(w + 2 * M, h + 2 * M, scale), md = Mid.c;
      md.translate(M, M);
      var nMid = Math.round(area * 1.6);
      for (i = 0; i < nMid; i++) {
        md.globalAlpha = rand(0.45, 0.95);
        dot(md, rand(-M, w + M), rand(-M, h + M), rand(0.5, 1.1), Math.random() < 0.12 ? COL.brass : COL.star);
      }
      md.globalAlpha = 1;
      // the planet, painted once
      // phones, tablets and wide screens each place the planet where it leaves the words alone
      var narrow = w < 700, tablet = !narrow && w < 1000, pr = big0 * (narrow ? 0.2 : 0.21);
      if (tablet) pr = Math.min(pr, w * 0.165);
      var PW = pr * 5.2, PH = pr * 3;
      var P = layer(PW, PH, scale);
      glow(P.c, PW / 2, PH / 2, pr * 1.45, COL.rose, 0.1);
      drawRingedPlanet(P.c, PW / 2, PH / 2, pr, -0.38, 0, COL.rose, COL.x);
      // near stars stay live, so they can twinkle and join up around the pointer
      var near = [];
      var nNear = Math.round(area * 1.1);
      for (i = 0; i < nNear; i++) near.push({ x: Math.random(), y: Math.random(), r: rand(0.7, 1.6), tw: rand(0, TAU), c: Math.random() < 0.12 ? COL.brass : Math.random() < 0.12 ? COL.ice : COL.star });
      s.far = F.cv; s.mid = Mid.cv; s.planet = P.cv; s.pw = PW; s.ph = PH; s.pr = pr; s.narrow = narrow; s.tablet = tablet;
      s.near = near; s.shoot = null; s.next = t + 2; s.mass = 0;
    }
    var ox = (p.x - 0.5) * p.a, oy = (p.y - 0.5) * p.a;
    var big = Math.min(w, h);
    // scrolling down, the sky slides a little and the planet sinks toward the horizon
    var sink = clamp(scrollTop / h, 0, 1);
    c.clearRect(0, 0, w, h);
    c.drawImage(s.far, -M - ox * 18, -M - oy * 12 + sink * 10, w + 2 * M, h + 2 * M);
    c.drawImage(s.mid, -M - ox * 38, -M - oy * 26 + sink * 22, w + 2 * M, h + 2 * M);
    // a small black hole sits under the pointer and bends the light of the near stars;
    // holding the button (or a finger) down feeds it, letting go lets it shrink back
    s.mass += ((p.down ? 1 : 0) - s.mass) * (p.down ? 0.035 : 0.06);
    var lens = p.a > 0.01, qx = p.x * w, qy = p.y * h;
    var rE = big * 0.05 * p.a * (1 + 1.2 * s.mass), rE2 = rE * rE;
    var drift = t * 0.004;
    for (var j = 0; j < s.near.length; j++) {
      var st = s.near[j];
      var x = (((st.x + drift) % 1) * (w + 40)) - 20 - ox * 60, y = st.y * h - oy * 40 + sink * 34;
      var tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.4 + st.tw));
      c.fillStyle = st.c;
      if (lens) {
        lensedStar(c, qx, qy, x - qx, y - qy, rE2, st.r, tw);
      } else {
        c.globalAlpha = tw;
        c.beginPath();
        c.arc(x, y, st.r, 0, TAU);
        c.fill();
      }
    }
    c.globalAlpha = 1;
    if (lens) blackHole(c, qx, qy, rE, p.a);
    // planet and moon; in Arabic and Kurdish the words sit on the right, so the planet moves left
    var rtl = document.documentElement.getAttribute("dir") === "rtl";
    var pr2 = s.pr;
    var px0 = s.tablet ? 0.8 : 0.76;
    var cx = w * (rtl ? 1 - px0 : px0) - ox * 34, cy = h * (s.narrow ? 0.74 : s.tablet ? 0.6 : 0.5) - oy * 26 + sink * h * 0.16;
    var ma = t * 0.35;
    var mx = cx + Math.cos(ma) * pr2 * 2.25, my = cy + Math.sin(ma) * pr2 * 0.6 - pr2 * 0.2;
    var mr = pr2 * 0.13;
    if (Math.sin(ma) < 0) drawMoon(c, mx, my, mr, !rtl);
    if (rtl) {
      c.save();
      c.translate(cx, 0);
      c.scale(-1, 1);
      c.drawImage(s.planet, -s.pw / 2, cy - s.ph / 2, s.pw, s.ph);
      c.restore();
    } else {
      c.drawImage(s.planet, cx - s.pw / 2, cy - s.ph / 2, s.pw, s.ph);
    }
    if (Math.sin(ma) >= 0) drawMoon(c, mx, my, mr, !rtl);
    // shooting star
    if (!s.shoot && t > s.next) {
      s.shoot = { x: rand(0.1, 0.7) * w, y: rand(0.05, 0.35) * h, t0: t };
      s.next = t + rand(4, 9);
    }
    if (s.shoot) {
      var kk = (t - s.shoot.t0) / 0.9;
      if (kk >= 1 || kk < 0) s.shoot = null;
      else {
        var sx = s.shoot.x + kk * w * 0.35, sy = s.shoot.y + kk * h * 0.18;
        var gr = c.createLinearGradient(sx, sy, sx - 90, sy - 46);
        gr.addColorStop(0, rgba(COL.star, 0.9 * (1 - kk)));
        gr.addColorStop(1, rgba(COL.star, 0));
        c.strokeStyle = gr;
        c.lineWidth = 1.6;
        line(c, sx, sy, sx - 90, sy - 46);
      }
    }
  };

  // Introduction to Physics: a projectile; the pointer sets the launch angle, a tap fires another ball.
  function cannonAt(w, h) {
    return [w * 0.12, h * 0.8];
  }
  A.projectile = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var G = cannonAt(w, h), gx = G[0], gy = G[1];
    c.strokeStyle = rgba(COL.dust, 0.35);
    c.lineWidth = 1;
    line(c, 0, gy, w, gy);
    var ang = lerp(0.85 + 0.25 * Math.sin(t * 0.5), clamp(Math.atan2(gy - p.y * h, p.x * w - gx), 0.2, 1.45), p.a);
    var v2 = Math.min(w * 0.76, gy * 2.4), v = Math.sqrt(v2), T = 2 * v * Math.sin(ang);
    function pos(tt) { return [gx + v * Math.cos(ang) * tt, gy - (v * Math.sin(ang) * tt - 0.5 * tt * tt)]; }
    // balls fired by a tap fly on their own, each with its own angle
    if (s.shots) {
      s.shots = s.shots.filter(function (sh) {
        var Ts = 2 * v * Math.sin(sh.a), tt = (t - sh.t0) * 0.45 * Ts;
        var at = function (u) { return [gx + v * Math.cos(sh.a) * u, gy - (v * Math.sin(sh.a) * u - 0.5 * u * u)]; };
        c.setLineDash([2, 5]);
        c.strokeStyle = rgba(COL.ice, 0.25);
        c.beginPath();
        for (var i2 = 0; i2 <= 32; i2++) {
          var q2 = at((Math.min(tt, Ts) * i2) / 32);
          if (i2 === 0) c.moveTo(q2[0], q2[1]); else c.lineTo(q2[0], q2[1]);
        }
        c.stroke();
        c.setLineDash([]);
        if (tt < Ts) {
          var b2 = at(tt);
          glow(c, b2[0], b2[1], 14, COL.ice, 0.4);
          dot(c, b2[0], b2[1], 4, COL.ice);
          return true;
        }
        // where it landed: a small puff that fades
        var since = (tt - Ts) / (0.45 * Ts);
        if (since > 1.2) return false;
        var land = at(Ts);
        c.strokeStyle = rgba(COL.ice, 0.5 * (1 - since / 1.2));
        c.beginPath();
        c.ellipse(land[0], gy, 4 + since * 16, 1.5 + since * 4, 0, 0, TAU);
        c.stroke();
        return true;
      });
    }
    c.setLineDash([3, 6]);
    c.strokeStyle = rgba(COL.star, 0.45);
    c.beginPath();
    for (var i = 0; i <= 48; i++) {
      var q = pos((T * i) / 48);
      if (i === 0) c.moveTo(q[0], q[1]); else c.lineTo(q[0], q[1]);
    }
    c.stroke();
    c.setLineDash([]);
    var ph = (t * 0.45) % 1.25;
    if (ph < 1) {
      var tt = T * ph, b = pos(tt);
      for (var k = 1; k < 8; k++) {
        var tr = pos(Math.max(0, tt - k * T * 0.02));
        dot(c, tr[0], tr[1], 3.2 - k * 0.3, rgba(COL.brass, 0.5 - k * 0.06));
      }
      glow(c, b[0], b[1], 18, COL.brass, 0.45);
      dot(c, b[0], b[1], 5, COL.brass);
      var vx = v * Math.cos(ang), vy = -(v * Math.sin(ang) - tt);
      arrow(c, b[0], b[1], b[0] + vx * 1.6, b[1] + vy * 1.6, rgba(COL.rose, 0.9), 1.6);
    }
    // the cannon: a tapered barrel with a muzzle ring, on a spoked wheel; it kicks back as it fires
    var kick = ph < 0.1 ? (1 - ph / 0.1) * 3.5 : 0;
    c.save();
    c.translate(gx, gy - 2);
    c.rotate(-ang);
    c.translate(-kick, 0);
    var bg = c.createLinearGradient(0, -6, 0, 6);
    bg.addColorStop(0, mix(COL.dust, "#ffffff", 0.55));
    bg.addColorStop(0.45, COL.dust);
    bg.addColorStop(1, mix(COL.dust, "#05040f", 0.5));
    c.fillStyle = bg;
    c.beginPath();
    c.moveTo(-7, -6.5);
    c.lineTo(29, -4.4);
    c.lineTo(29, 4.4);
    c.lineTo(-7, 6.5);
    c.closePath();
    c.fill();
    c.fillRect(27.5, -5.6, 4.5, 11.2);
    c.restore();
    var wr = 8.5, spin = 0.3;
    dot(c, gx, gy, wr, mix(COL.dust, "#05040f", 0.55));
    c.strokeStyle = rgba(COL.star, 0.75);
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(gx, gy, wr, 0, TAU);
    for (var sp = 0; sp < 6; sp++) {
      var sa = spin + (sp * Math.PI) / 3;
      c.moveTo(gx, gy);
      c.lineTo(gx + Math.cos(sa) * wr, gy + Math.sin(sa) * wr);
    }
    c.stroke();
    dot(c, gx, gy, 2.2, COL.star);
  };
  A.projectile.hint = "Launch a ball";
  A.projectile.tap = function (s, x, y, w, h, t) {
    var G = cannonAt(w, h);
    var a = x === null ? rand(0.5, 1.3) : clamp(Math.atan2(G[1] - y, x - G[0]), 0.2, 1.45);
    (s.shots = s.shots || []).push({ a: a, t0: t });
    if (s.shots.length > 6) s.shots.shift();
  };

  // Classical Mechanics: a real pendulum simulation; the pointer pulls the bob.
  // A tap hangs a second pendulum from the first: the double pendulum, the classic chaotic system.
  function doublePendulum(st, g) {
    var t1 = st[0], t2 = st[1], w1 = st[2], w2 = st[3], d = t1 - t2, den = 3 - Math.cos(2 * d);
    return [
      w1,
      w2,
      (-3 * g * Math.sin(t1) - g * Math.sin(t1 - 2 * t2) - 2 * Math.sin(d) * (w2 * w2 + w1 * w1 * Math.cos(d))) / den,
      (2 * Math.sin(d) * (2 * w1 * w1 + 2 * g * Math.cos(t1) + w2 * w2 * Math.cos(d))) / den
    ];
  }
  function rk4(f, st, dt, g) {
    var k1 = f(st, g);
    var k2 = f(st.map(function (v, i) { return v + (dt / 2) * k1[i]; }), g);
    var k3 = f(st.map(function (v, i) { return v + (dt / 2) * k2[i]; }), g);
    var k4 = f(st.map(function (v, i) { return v + dt * k3[i]; }), g);
    return st.map(function (v, i) { return v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
  }
  function drawBob(c, x, y, r, col) {
    glow(c, x, y, r * 2.6, col, 0.35);
    var g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, "#fff3d0");
    g.addColorStop(1, col);
    dot(c, x, y, r, g);
  }
  A.pendulum = function (c, w, h, t, p, s) {
    var dt = stepTime(s, t);
    if (s.th === undefined) { s.th = 0.9; s.om = 0; s.trail = []; }
    var px = w / 2, py = h * 0.1, L = h * 0.64;
    if (s.dp) {
      for (var n = 0; n < 8; n++) s.dp = rk4(doublePendulum, s.dp, dt / 8, 9);
      var l = L / 2;
      var x1 = px + Math.sin(s.dp[0]) * l, y1 = py + Math.cos(s.dp[0]) * l;
      var x2 = x1 + Math.sin(s.dp[1]) * l, y2 = y1 + Math.cos(s.dp[1]) * l;
      s.trail2.push([x2, y2]);
      if (s.trail2.length > 140) s.trail2.shift();
      c.clearRect(0, 0, w, h);
      c.lineWidth = 1.4;
      for (var seg = 0; seg < s.trail2.length - 1; seg += 20) {
        c.strokeStyle = rgba(COL.rose, 0.05 + 0.5 * (seg / s.trail2.length));
        c.beginPath();
        c.moveTo(s.trail2[seg][0], s.trail2[seg][1]);
        for (var q = seg + 1; q <= Math.min(s.trail2.length - 1, seg + 20); q++) c.lineTo(s.trail2[q][0], s.trail2[q][1]);
        c.stroke();
      }
      c.strokeStyle = rgba(COL.star, 0.85);
      c.lineWidth = 1.5;
      line(c, px, py, x1, y1);
      line(c, x1, y1, x2, y2);
      c.fillStyle = COL.dust;
      c.fillRect(px - 26, py - 3, 52, 3);
      var rb = Math.min(w, h) * 0.06;
      drawBob(c, x1, y1, rb * 0.8, COL.brass);
      drawBob(c, x2, y2, rb, COL.rose);
      return;
    }
    var target = Math.atan2(p.x * w - px, Math.max(10, p.y * h - py));
    for (var k = 0; k < 4; k++) {
      var d = dt / 4;
      var acc = -6.2 * Math.sin(s.th) + p.a * (9 * (target - s.th) - 2.4 * s.om);
      s.om += acc * d;
      s.th += s.om * d;
    }
    var bx = px + Math.sin(s.th) * L, by = py + Math.cos(s.th) * L;
    s.trail.push([bx, by]);
    if (s.trail.length > 26) s.trail.shift();
    c.clearRect(0, 0, w, h);
    c.strokeStyle = rgba(COL.dust, 0.18);
    c.setLineDash([2, 5]);
    c.beginPath();
    c.arc(px, py, L, Math.PI / 2 - 1.2, Math.PI / 2 + 1.2);
    c.stroke();
    c.setLineDash([]);
    s.trail.forEach(function (q, i) {
      dot(c, q[0], q[1], 1 + i * 0.22, rgba(COL.brass, (i / s.trail.length) * 0.35));
    });
    c.strokeStyle = rgba(COL.star, 0.85);
    c.lineWidth = 1.5;
    line(c, px, py, bx, by);
    c.fillStyle = COL.dust;
    c.fillRect(px - 26, py - 3, 52, 3);
    drawBob(c, bx, by, Math.min(w, h) * 0.075, COL.brass);
  };
  A.pendulum.hint = "One or two pendulums";
  A.pendulum.tap = function (s) {
    if (s.th === undefined) return;
    if (s.dp) {
      s.th = s.dp[0]; s.om = s.dp[2]; s.trail = []; s.dp = null;
    } else {
      s.dp = [1.9 + rand(-0.2, 0.2), 2.9 + rand(-0.3, 0.3), 0, 0];
      s.trail2 = [];
    }
  };

  // Electromagnetism: field lines between a fixed + charge and a − charge you move.
  // Taps drop more charges (+, −, + ...); tapping one of them takes it away again.
  A.field = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var q2 = pointer(p, w, h, t, 0.18, 0.22);
    q2[0] = Math.max(q2[0], w * 0.45);
    var Q = [[w * 0.3, h * 0.5, 1], [q2[0], q2[1], -1]];
    (s.extra || []).forEach(function (e) { Q.push([e.x * w, e.y * h, e.q]); });
    function E(x, y) {
      var ex = 0, ey = 0;
      for (var j = 0; j < Q.length; j++) {
        var dx = x - Q[j][0], dy = y - Q[j][1];
        var r3 = Math.pow(dx * dx + dy * dy, 1.5) + 1e-6;
        ex += (Q[j][2] * dx) / r3;
        ey += (Q[j][2] * dy) / r3;
      }
      return [ex, ey];
    }
    function sink(x, y) {
      for (var j = 0; j < Q.length; j++) {
        if (Q[j][2] < 0 && Math.abs(x - Q[j][0]) < 7 && Math.abs(y - Q[j][1]) < 7) return true;
      }
      return false;
    }
    c.lineWidth = 1.2;
    Q.forEach(function (src, si) {
      if (src[2] < 0) return;
      var n = si === 0 ? 16 : 12, steps = si === 0 ? 220 : 160;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * TAU + t * 0.05;
        var x = src[0] + Math.cos(a) * 8, y = src[1] + Math.sin(a) * 8;
        c.strokeStyle = rgba(i % 2 ? COL.ice : COL.star, 0.5);
        c.beginPath();
        c.moveTo(x, y);
        for (var k = 0; k < steps; k++) {
          var e = E(x, y), m = Math.hypot(e[0], e[1]) || 1;
          x += (e[0] / m) * 4;
          y += (e[1] / m) * 4;
          c.lineTo(x, y);
          if (sink(x, y) || x < -20 || y < -20 || x > w + 20 || y > h + 20) break;
        }
        c.stroke();
      }
    });
    Q.forEach(function (q, j) {
      var col = q[2] > 0 ? COL.h : COL.e, r = j < 2 ? 11 : 9;
      glow(c, q[0], q[1], r * 3.1, col, 0.45);
      dot(c, q[0], q[1], r, col);
      c.fillStyle = "#1a0f20";
      c.fillRect(q[0] - r * 0.45, q[1] - 1.2, r * 0.9, 2.4);
      if (q[2] > 0) c.fillRect(q[0] - 1.2, q[1] - r * 0.45, 2.4, r * 0.9);
    });
  };
  A.field.hint = "Add a charge";
  A.field.tap = function (s, x, y, w, h) {
    s.extra = s.extra || [];
    if (x === null) { x = rand(0.5, 0.9) * w; y = rand(0.2, 0.8) * h; }
    for (var i = 0; i < s.extra.length; i++) {
      if (Math.hypot(s.extra[i].x * w - x, s.extra[i].y * h - y) < 18) { s.extra.splice(i, 1); return; }
    }
    s.sign = s.sign === 1 ? -1 : 1;
    s.extra.push({ x: x / w, y: y / h, q: s.sign });
    if (s.extra.length > 4) s.extra.shift();
  };

  // Thermodynamics: a gas in a box; hover heats it up. A tap lets in a puff of hot
  // molecules, and collisions share their energy out until the gas evens out again.
  A.gas = function (c, w, h, t, p, s) {
    var dt = stepTime(s, t);
    var x0 = 14, y0 = 14, x1 = w - 40, y1 = h - 14;
    if (!s.ps) {
      s.ps = [];
      for (var i = 0; i < 44; i++) s.ps.push({ x: rand(x0, x1), y: rand(y0, y1), a: rand(0, TAU), v: rand(0.7, 1.3) });
    }
    if (s.hot) {
      // collisions: two molecules that meet share their energy at random
      for (var a1 = 0; a1 < s.ps.length; a1++) {
        var A1 = s.ps[a1];
        for (var b1 = a1 + 1; b1 < s.ps.length; b1++) {
          var B1 = s.ps[b1];
          if (Math.abs(A1.x - B1.x) > 7 || Math.abs(A1.y - B1.y) > 7 || t < A1.cd || t < B1.cd) continue;
          var e2 = A1.v * A1.v + B1.v * B1.v, f = rand(0.25, 0.75);
          A1.v = Math.sqrt(f * e2); B1.v = Math.sqrt((1 - f) * e2);
          A1.a = rand(0, TAU); B1.a = rand(0, TAU);
          A1.cd = B1.cd = t + 0.12;
        }
        // the walls slowly take the extra heat away
        A1.v += (1 - A1.v) * dt * 0.04;
      }
    }
    var mean = 0;
    s.ps.forEach(function (q) { mean += q.v * q.v; });
    mean /= s.ps.length;
    var heat = clamp(0.25 + 0.75 * p.a + (mean - 1) * 0.35, 0, 1);
    var speed = 35 + 190 * p.a;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = rgba(COL.dust, 0.35);
    c.lineWidth = 1.5;
    c.strokeRect(x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12);
    var col = mix(COL.e, COL.h, clamp((heat - 0.25) / 0.75, 0, 1));
    // each molecule is coloured by its own speed: slow ones blue, fast ones red
    if (!s.pal) { s.pal = []; for (var pk = 0; pk <= 8; pk++) s.pal.push(mix(COL.e, COL.h, pk / 8)); }
    c.strokeStyle = rgba(COL.star, 0.18);
    c.lineWidth = 1;
    s.ps.forEach(function (q) {
      var vx = Math.cos(q.a) * speed * q.v, vy = Math.sin(q.a) * speed * q.v;
      q.x += vx * dt;
      q.y += vy * dt;
      if (q.x < x0) { q.x = x0; q.a = Math.PI - q.a; }
      if (q.x > x1) { q.x = x1; q.a = Math.PI - q.a; }
      if (q.y < y0) { q.y = y0; q.a = -q.a; }
      if (q.y > y1) { q.y = y1; q.a = -q.a; }
      line(c, q.x, q.y, q.x - vx * 0.05, q.y - vy * 0.05);
      var hot = clamp(0.15 + p.a * 0.7 + (q.v - 1) * 1.1, 0, 1);
      dot(c, q.x, q.y, 3.4, s.pal[Math.round(hot * 8)]);
    });
    // thermometer
    var tx = w - 20, top = y0 + 6, bot = y1 - 8;
    c.fillStyle = rgba(COL.star, 0.12);
    c.fillRect(tx - 3, top, 6, bot - top);
    var lvl = bot - (bot - top) * heat;
    c.fillStyle = col;
    c.fillRect(tx - 3, lvl, 6, bot - lvl);
    dot(c, tx, bot + 4, 7, col);
  };
  A.gas.hint = "Add hot molecules";
  A.gas.tap = function (s, x, y, w, h) {
    if (!s.ps) return;
    var x0 = 14, y0 = 14, x1 = w - 40, y1 = h - 14;
    if (x === null) { x = rand(x0, x1); y = rand(y0, y1); }
    x = clamp(x, x0, x1);
    y = clamp(y, y0, y1);
    for (var i = 0; i < 12; i++) s.ps.push({ x: x, y: y, a: rand(0, TAU), v: rand(2.2, 2.8), cd: 0 });
    while (s.ps.length > 110) s.ps.shift();
    s.hot = true;
  };

  // Quantum Mechanics: probability density of a superposition in a box.
  // A tap measures where the particle is: the state collapses to a narrow packet at a
  // place drawn from |ψ|², which then spreads, bounces off the walls and interferes
  // (worked out exactly from the box's own states, E_n = n²·E_1), before settling back.
  var QN = 36, QSIN = null, QE1 = 1.1;
  function quantumTable() {
    if (!QSIN) {
      QSIN = [];
      for (var n = 1; n <= QN; n++) {
        var row = [];
        for (var i = 0; i <= 120; i++) row.push(Math.sin((n * Math.PI * i) / 120));
        QSIN.push(row);
      }
    }
    return QSIN;
  }
  function twoState(u, t, m) {
    var c1 = Math.cos(m), c2 = Math.sin(m), s1 = Math.sin(Math.PI * u), s2 = Math.sin(2 * Math.PI * u);
    return [
      c1 * s1 * Math.cos(QE1 * t) + c2 * s2 * Math.cos(4 * QE1 * t),
      -(c1 * s1 * Math.sin(QE1 * t) + c2 * s2 * Math.sin(4 * QE1 * t))
    ];
  }
  function mixOf(p) { return 0.78 + (p.x - 0.5) * 1.1 * p.a; }
  A.quantum = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var x0 = w * 0.1, x1 = w * 0.9, base = h * 0.84, H = h * 0.36;
    var m = mixOf(p);
    var meas = s.meas, k = 0, age = 0, cs = null, sn = null;
    if (meas) {
      age = t - meas.t0;
      if (age > 11 || age < 0) s.meas = meas = null;
      else {
        k = age > 9.5 ? 1 - (age - 9.5) / 1.5 : 1;
        var tau = age * 0.05;
        cs = []; sn = [];
        for (var n = 0; n < QN; n++) {
          var ph = QE1 * (n + 1) * (n + 1) * tau;
          cs.push(meas.c[n] * Math.cos(ph));
          sn.push(meas.c[n] * Math.sin(ph));
        }
      }
    }
    var S = meas ? quantumTable() : null;
    var pts = [];
    for (var i = 0; i <= 120; i++) {
      var u = i / 120;
      var z = twoState(u, t, m), re = z[0], im = z[1];
      var yd = base - (re * re + im * im) * H, yr = base - h * 0.06 - re * H * 0.25;
      if (meas) {
        var mr = 0, mi = 0;
        for (var q = 0; q < QN; q++) { mr += cs[q] * S[q][i]; mi -= sn[q] * S[q][i]; }
        yd = lerp(yd, base - ((mr * mr + mi * mi) / meas.peak) * H * 1.9, k);
        yr = lerp(yr, base - h * 0.06 - (mr / Math.sqrt(meas.peak)) * H * 0.5, k);
      }
      pts.push([lerp(x0, x1, u), yd, yr]);
    }
    var g = c.createLinearGradient(0, base - H * 2, 0, base);
    g.addColorStop(0, rgba(COL.x, 0.75));
    g.addColorStop(1, rgba(COL.rose, 0.08));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0, base);
    pts.forEach(function (q) { c.lineTo(q[0], q[1]); });
    c.lineTo(x1, base);
    c.closePath();
    c.fill();
    c.strokeStyle = COL.star;
    c.lineWidth = 1.6;
    c.beginPath();
    pts.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
    c.stroke();
    // the wave itself (its real part), swaying under the probability
    c.strokeStyle = rgba(COL.ice, 0.55);
    c.lineWidth = 1.2;
    c.beginPath();
    pts.forEach(function (q, i) { if (i) c.lineTo(q[0], q[2]); else c.moveTo(q[0], q[2]); });
    c.stroke();
    // energy levels
    c.strokeStyle = rgba(COL.dust, 0.25);
    c.setLineDash([3, 5]);
    line(c, x0, h * 0.22, x1, h * 0.22);
    line(c, x0, h * 0.34, x1, h * 0.34);
    c.setLineDash([]);
    c.strokeStyle = COL.dust;
    c.lineWidth = 3;
    line(c, x0, base, x0, h * 0.12);
    line(c, x1, base, x1, h * 0.12);
    line(c, x0, base, x1, base);
    // where it was found
    if (meas && age < 1.6) {
      var fx = lerp(x0, x1, meas.x0), fa = 1 - age / 1.6;
      c.setLineDash([3, 4]);
      c.strokeStyle = rgba(COL.brass, 0.7 * fa);
      c.lineWidth = 1.2;
      line(c, fx, base, fx, h * 0.14);
      c.setLineDash([]);
      glow(c, fx, base, 30, COL.brass, 0.6 * fa);
      dot(c, fx, base, 4, rgba(COL.brass, fa));
    }
  };
  A.quantum.hint = "Measure where it is";
  A.quantum.tap = function (s, x, y, w, h, t, p) {
    // the place is drawn at random from |ψ|² at this moment, as quantum mechanics says
    var m = mixOf(p), cdf = [], sum = 0, i, n;
    for (i = 0; i <= 120; i++) {
      var z = twoState(i / 120, t, m);
      sum += z[0] * z[0] + z[1] * z[1];
      cdf.push(sum);
    }
    var r = Math.random() * sum, j = 0;
    while (j < 120 && cdf[j] < r) j++;
    var x0 = j / 120, sig = 0.06, S = quantumTable(), coef = [];
    for (n = 0; n < QN; n++) {
      var acc = 0;
      for (i = 0; i <= 120; i++) {
        var d = i / 120 - x0;
        acc += (i === 0 || i === 120 ? 0.5 : 1) * Math.exp(-(d * d) / (4 * sig * sig)) * S[n][i];
      }
      coef.push((2 * acc) / 120);
    }
    // the tallest point of the new state sets the drawing's scale
    var peak = 0;
    for (i = 0; i <= 120; i++) {
      var v = 0;
      for (n = 0; n < QN; n++) v += coef[n] * S[n][i];
      peak = Math.max(peak, v * v);
    }
    s.meas = { t0: t, x0: x0, c: coef, peak: peak || 1 };
  };

  // Optics: white light through a prism; the pointer moves the incoming beam.
  // A tap changes the light: white, then red, green and violet alone (one colour bends but doesn't split).
  var SPECTRUM = ["#ff4f5e", "#ff9a3c", "#ffd84a", "#5be37d", "#3fc5ff", "#5b6cff", "#a35bff"];
  var MONO = [-1, 0, 3, 6];
  A.prism = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var only = MONO[s.light || 0], beam = only < 0 ? COL.star : SPECTRUM[only];
    var cx = w * 0.48, cy = h * 0.56, S = Math.min(w, h) * 0.46;
    var T = [cx, cy - S * 0.62], Lp = [cx - S * 0.58, cy + S * 0.38], R = [cx + S * 0.58, cy + S * 0.38];
    var yIn = lerp(h * (0.52 + 0.06 * Math.sin(t * 0.6)), clamp(p.y * h, h * 0.2, h * 0.85), p.a);
    var Ein = [lerp(T[0], Lp[0], 0.55), lerp(T[1], Lp[1], 0.55)];
    var X = [lerp(T[0], R[0], 0.55), lerp(T[1], R[1], 0.55)];
    c.fillStyle = rgba(COL.star, 0.06);
    c.strokeStyle = rgba(COL.star, 0.55);
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(T[0], T[1]);
    c.lineTo(Lp[0], Lp[1]);
    c.lineTo(R[0], R[1]);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = rgba(beam, 0.95);
    c.lineWidth = 3;
    line(c, 0, yIn, Ein[0], Ein[1]);
    c.strokeStyle = rgba(beam, 0.5);
    c.lineWidth = 2.4;
    line(c, Ein[0], Ein[1], X[0], X[1]);
    var tilt = (yIn - Ein[1]) / h;
    c.globalCompositeOperation = "lighter";
    SPECTRUM.forEach(function (col, i) {
      if (only >= 0 && i !== only) return;
      var a = 0.08 + tilt * 0.9 + i * 0.07 + 0.01 * Math.sin(t * 2 + i);
      c.strokeStyle = rgba(col, 0.9);
      c.lineWidth = 2.6;
      line(c, X[0], X[1], X[0] + Math.cos(a) * w, X[1] + Math.sin(a) * w);
    });
    c.globalCompositeOperation = "source-over";
  };
  A.prism.hint = "Change the light";
  A.prism.tap = function (s) { s.light = ((s.light || 0) + 1) % MONO.length; };

  // Relativity: a mass bends the grid of spacetime; a moon orbits it.
  // A tap launches a moon. Its pull has a small extra 1/r^4 part, as in general relativity,
  // so the orbit does not close: it turns a little each time round and draws a rosette.
  A.spacetime = function (c, w, h, t, p, s) {
    var dt = stepTime(s, t);
    c.clearRect(0, 0, w, h);
    var M = pointer(p, w, h, t * 0.8, 0.2, 0.15);
    s.M = M;
    var m = Math.min(w, h), k = Math.pow(m * 0.2, 2) * 1.5, soft = Math.pow(m * 0.09, 2);
    function warp(x, y) {
      var dx = x - M[0], dy = y - M[1], r2 = dx * dx + dy * dy;
      var f = Math.min(0.85, k / (r2 + soft));
      return [x - dx * f, y - dy * f];
    }
    var g = m / 8;
    c.lineWidth = 1;
    for (var gy = -g; gy <= h + g; gy += g) {
      c.strokeStyle = rgba(COL.e, 0.32);
      c.beginPath();
      for (var x = -g; x <= w + g; x += 8) {
        var q = warp(x, gy);
        if (x === -g) c.moveTo(q[0], q[1]); else c.lineTo(q[0], q[1]);
      }
      c.stroke();
    }
    for (var gx = -g; gx <= w + g; gx += g) {
      c.strokeStyle = rgba(COL.e, 0.32);
      c.beginPath();
      for (var y = -g; y <= h + g; y += 8) {
        var r = warp(gx, y);
        if (y === -g) c.moveTo(r[0], r[1]); else c.lineTo(r[0], r[1]);
      }
      c.stroke();
    }
    glow(c, M[0], M[1], m * 0.22, COL.brass, 0.4);
    var gr = c.createRadialGradient(M[0] - 5, M[1] - 5, 2, M[0], M[1], m * 0.06);
    gr.addColorStop(0, "#fff4d4");
    gr.addColorStop(1, COL.brass);
    dot(c, M[0], M[1], m * 0.06, gr);
    var oa = t * 1.4;
    dot(c, M[0] + Math.cos(oa) * m * 0.17, M[1] + Math.sin(oa) * m * 0.11, 3.5, COL.star);
    if (s.moons) {
      var soft2 = Math.pow(m * 0.03, 2);
      s.moons = s.moons.filter(function (mo) {
        for (var k2 = 0; k2 < 6; k2++) {
          var d = dt / 6, dx = mo.x - M[0], dy = mo.y - M[1], r2 = dx * dx + dy * dy + soft2, r = Math.sqrt(r2);
          var acc = (-s.GM / r2) * (1 + (0.35 * s.R0 * s.R0) / r2);
          mo.vx += ((acc * dx) / r) * d;
          mo.vy += ((acc * dy) / r) * d;
          mo.x += mo.vx * d;
          mo.y += mo.vy * d;
        }
        mo.trail.push([mo.x, mo.y]);
        if (mo.trail.length > 110) mo.trail.shift();
        var far = Math.hypot(mo.x - M[0], mo.y - M[1]);
        if (far < m * 0.05 || far > Math.max(w, h) * 1.5) return false;
        c.strokeStyle = rgba(COL.ice, 0.45);
        c.lineWidth = 1.2;
        c.beginPath();
        mo.trail.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
        c.stroke();
        glow(c, mo.x, mo.y, 12, COL.ice, 0.5);
        dot(c, mo.x, mo.y, 3.2, "#e9f7ff");
        return true;
      });
    }
  };
  A.spacetime.hint = "Launch a moon";
  A.spacetime.tap = function (s, x, y, w, h) {
    if (!s.M) return;
    var m = Math.min(w, h), R0 = m * 0.3, M = s.M;
    s.R0 = R0;
    s.GM = Math.pow((TAU * R0) / 3.2, 2) * R0; // about 3 seconds per turn
    var px, py;
    if (x !== null && Math.hypot(x - M[0], y - M[1]) > m * 0.12) { px = x; py = y; }
    else { var a = rand(0, TAU); px = M[0] + Math.cos(a) * R0; py = M[1] + Math.sin(a) * R0; }
    var dx = px - M[0], dy = py - M[1], r = Math.hypot(dx, dy), v = Math.sqrt(s.GM / r) * rand(0.85, 1.05);
    var dir = Math.random() < 0.5 ? 1 : -1;
    (s.moons = s.moons || []).push({ x: px, y: py, vx: (-dy / r) * v * dir, vy: (dx / r) * v * dir, trail: [] });
    if (s.moons.length > 5) s.moons.shift();
  };

  // Solid State: a crystal lattice with phonons; the pointer pushes atoms.
  // A tap sends a sound wave (a phonon pulse) out through the crystal from that point.
  A.lattice = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var cols = 8, rows = 6, m = Math.min(w, h);
    var sx = w / (cols + 1), sy = h / (rows + 1), A0 = m * 0.025;
    var P = [];
    var qx = p.x * w, qy = p.y * h, Rr = m * 0.3;
    var pulses = (s.pulses = (s.pulses || []).filter(function (pu) { return (t - pu.t0) * m * 1.1 < Math.max(w, h) * 1.6; }));
    pulses.forEach(function (pu) {
      var front = (t - pu.t0) * m * 1.1, fade = Math.exp(-(t - pu.t0) * 0.6);
      c.strokeStyle = rgba(COL.ice, 0.18 * fade);
      c.lineWidth = 1;
      c.beginPath();
      c.arc(pu.x, pu.y, Math.max(0, front), 0, TAU);
      c.stroke();
    });
    for (var j = 0; j < rows; j++) {
      P.push([]);
      for (var i = 0; i < cols; i++) {
        var x = sx * (i + 1) + A0 * Math.sin(i * 0.9 - t * 2.4), y = sy * (j + 1) + A0 * 0.7 * Math.sin(j * 1.1 - t * 2.1 + i * 0.5);
        for (var k = 0; k < pulses.length; k++) {
          var pu = pulses[k], ddx = sx * (i + 1) - pu.x, ddy = sy * (j + 1) - pu.y, dd = Math.hypot(ddx, ddy) || 1;
          var off = dd - (t - pu.t0) * m * 1.1;
          if (Math.abs(off) > m * 0.25) continue;
          var amp = m * 0.045 * Math.exp(-(off * off) / (2 * m * m * 0.005)) * Math.cos(off / (m * 0.05)) * Math.exp(-(t - pu.t0) * 0.6);
          x += (ddx / dd) * amp;
          y += (ddy / dd) * amp;
        }
        var dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
        if (p.a > 0.01 && d < Rr) {
          var push = ((Rr - d) / Rr) * m * 0.09 * p.a;
          x += (dx / (d || 1)) * push;
          y += (dy / (d || 1)) * push;
        }
        P[j].push([x, y]);
      }
    }
    c.strokeStyle = rgba(COL.dust, 0.3);
    c.lineWidth = 1.2;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      if (i < cols - 1) line(c, P[j][i][0], P[j][i][1], P[j][i + 1][0], P[j][i + 1][1]);
      if (j < rows - 1) line(c, P[j][i][0], P[j][i][1], P[j + 1][i][0], P[j + 1][i][1]);
    }
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      var col = (i + j) % 2 ? COL.ice : COL.brass;
      dot(c, P[j][i][0], P[j][i][1], m * 0.03, col);
      dot(c, P[j][i][0] - m * 0.008, P[j][i][1] - m * 0.008, m * 0.01, "rgba(255,255,255,.55)");
    }
  };
  A.lattice.hint = "Send a sound wave";
  A.lattice.tap = function (s, x, y, w, h, t) {
    if (x === null) { x = rand(0.2, 0.8) * w; y = rand(0.2, 0.8) * h; }
    (s.pulses = s.pulses || []).push({ x: x, y: y, t0: t });
    if (s.pulses.length > 4) s.pulses.shift();
  };

  // Nuclear & Particle: a nucleus and three electron orbits; the pointer tilts them.
  A.atom = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, m = Math.min(w, h);
    if (!s.nuc) {
      s.nuc = [];
      for (var i = 0; i < 11; i++) s.nuc.push({ a: rand(0, TAU), r: Math.sqrt(Math.random()) * m * 0.06, ph: rand(0, TAU), pr: i % 2 === 0 });
    }
    var tilt = (p.x - 0.5) * 1.2 * p.a, squash = 0.32 + (p.y - 0.5) * 0.4 * p.a;
    // an excited electron climbs to a wider orbit for a moment, then drops back
    var exK = -1, sc = 1, emit = false;
    if (s.ex) {
      var tau = t - s.ex.t0;
      exK = s.ex.k;
      if (tau < 0.25) sc = 1 + 0.18 * (tau / 0.25);
      else if (tau < 0.8) sc = 1.18;
      else if (tau < 0.92) { sc = 1.18 - 0.18 * ((tau - 0.8) / 0.12); emit = !s.ex.done; s.ex.done = true; }
      else s.ex = null;
    }
    glow(c, cx, cy, m * 0.2, COL.rose, 0.3);
    for (var k = 0; k < 3; k++) {
      var rot = (k * Math.PI) / 3 + t * 0.12 + tilt, ok = k === exK ? sc : 1;
      c.strokeStyle = rgba(COL.ice, k === exK ? 0.6 : 0.35);
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(cx, cy, m * 0.42 * ok, m * 0.42 * squash * ok, rot, 0, TAU);
      c.stroke();
    }
    s.nuc.forEach(function (n) {
      var x = cx + Math.cos(n.a) * n.r + Math.sin(t * 9 + n.ph) * 1.2, y = cy + Math.sin(n.a) * n.r + Math.cos(t * 8 + n.ph) * 1.2;
      var g = c.createRadialGradient(x - 2, y - 2, 1, x, y, m * 0.035);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, n.pr ? COL.rose : COL.dust);
      dot(c, x, y, m * 0.035, g);
    });
    for (k = 0; k < 3; k++) {
      var rot2 = (k * Math.PI) / 3 + t * 0.12 + tilt, e = t * (1.5 + k * 0.35) + k * 2, ek = k === exK ? sc : 1;
      var ex = Math.cos(e) * m * 0.42 * ek, ey = Math.sin(e) * m * 0.42 * squash * ek;
      var X = cx + ex * Math.cos(rot2) - ey * Math.sin(rot2), Y = cy + ex * Math.sin(rot2) + ey * Math.cos(rot2);
      glow(c, X, Y, 16, COL.ice, 0.6);
      dot(c, X, Y, 4, "#e9f7ff");
      if (emit && k === exK) {
        (s.photons = s.photons || []).push({ x: X, y: Y, a: Math.atan2(Y - cy, X - cx), t0: t, col: [COL.ice, COL.x, COL.b][Math.floor(Math.random() * 3)] });
      }
    }
    // photons: a short wave train flying straight out
    if (s.photons) {
      s.photons = s.photons.filter(function (ph) {
        var age = t - ph.t0, d = age * m * 1.4, ca = Math.cos(ph.a), sa = Math.sin(ph.a);
        var hx = ph.x + ca * d, hy = ph.y + sa * d;
        if (hx < -60 || hy < -60 || hx > w + 60 || hy > h + 60) return false;
        c.strokeStyle = rgba(ph.col, 0.9);
        c.lineWidth = 1.6;
        c.beginPath();
        for (var u = 0; u <= 46; u += 2) {
          var along = d - u, wob = Math.sin(u / 4.2 - age * 18) * 4 * Math.sin((u / 46) * Math.PI);
          if (along < 0) break;
          var px = ph.x + ca * along - sa * wob, py = ph.y + sa * along + ca * wob;
          if (u) c.lineTo(px, py); else c.moveTo(px, py);
        }
        c.stroke();
        return true;
      });
    }
  };
  A.atom.hint = "Excite an electron";
  A.atom.tap = function (s, x, y, w, h, t) {
    if (!s.ex) s.ex = { k: Math.floor(Math.random() * 3), t0: t };
  };

  // Astrophysics: a spiral galaxy with differential rotation; the pointer tilts it.
  A.galaxy = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var m = Math.min(w, h), R = m * 0.46;
    if (!s.st) {
      s.st = [];
      for (var i = 0; i < 620; i++) {
        var arm = i % 2, r = Math.pow(Math.random(), 0.65);
        s.st.push({ r: r, th: arm * Math.PI + r * 5.2 + rand(-0.35, 0.35) * (1 - r * 0.4), z: rand(0.6, 1.6), c: r < 0.25 ? 0 : Math.random() < 0.5 ? 1 : 2 });
      }
      s.st.sort(function (a, b) { return a.c - b.c; });
      s.bg = [];
      for (i = 0; i < 40; i++) s.bg.push([Math.random(), Math.random(), Math.random()]);
    }
    c.fillStyle = COL.star;
    s.bg.forEach(function (b) { c.globalAlpha = 0.3 + b[2] * 0.4; c.fillRect(b[0] * w, b[1] * h, 1.4, 1.4); });
    c.globalAlpha = 1;
    var cx = w / 2 + (p.x - 0.5) * 20 * p.a, cy = h / 2;
    var squash = 0.55 + (0.5 - p.y) * 0.7 * p.a, rot = -0.45 + (p.x - 0.5) * 0.8 * p.a;
    glow(c, cx, cy, R * 0.55, COL.brass, 0.35);
    c.globalCompositeOperation = "lighter";
    var cr = Math.cos(rot), sr = Math.sin(rot), pal = [COL.brass, COL.ice, COL.x], cur = -1;
    c.globalAlpha = 0.55;
    for (var j = 0; j < s.st.length; j++) {
      var q = s.st[j];
      if (q.c !== cur) { cur = q.c; c.fillStyle = pal[cur]; }
      var a = q.th + t * (0.18 / (0.15 + q.r));
      var x = Math.cos(a) * q.r * R, y = Math.sin(a) * q.r * R * squash;
      c.fillRect(cx + x * cr - y * sr, cy + x * sr + y * cr, q.z, q.z);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    glow(c, cx, cy, R * 0.12, "#fff3d0", 0.9);
    // supernovae: a star of the disk flares up, then leaves a ring of gas that spreads and fades
    if (s.sn) {
      s.sn = s.sn.filter(function (sn) {
        var age = t - sn.t0;
        if (age > 4) return false;
        var q = s.st[sn.j], a = q.th + t * (0.18 / (0.15 + q.r));
        var x = Math.cos(a) * q.r * R, y = Math.sin(a) * q.r * R * squash;
        var X = cx + x * cr - y * sr, Y = cy + x * sr + y * cr;
        var flash = age < 0.25 ? age / 0.25 : Math.exp(-(age - 0.25) * 1.6);
        glow(c, X, Y, R * 0.16 * (0.5 + flash), "#fff3d0", 0.9 * flash);
        dot(c, X, Y, 2.5 + 2 * flash, rgba("#ffffff", flash));
        c.strokeStyle = rgba(COL.rose, 0.5 * (1 - age / 4));
        c.lineWidth = 1.4;
        c.beginPath();
        c.ellipse(X, Y, R * 0.12 * Math.max(0, age), R * 0.12 * Math.max(0, age) * squash, rot, 0, TAU);
        c.stroke();
        return true;
      });
    }
  };
  A.galaxy.hint = "Set off a supernova";
  A.galaxy.tap = function (s, x, y, w, h, t) {
    if (!s.st) return;
    var j;
    do { j = Math.floor(Math.random() * s.st.length); } while (s.st[j].r < 0.3);
    (s.sn = s.sn || []).push({ j: j, t0: t });
    if (s.sn.length > 4) s.sn.shift();
  };

  // Mathematical & Computational: the Lorenz attractor drawing itself.
  // A tap starts a twin a thousandth away from it: the butterfly effect, measured as Δ.
  function lorenzStep(tr) {
    var v = tr.v, d = 0.006;
    var dx = 10 * (v[1] - v[0]), dy = v[0] * (28 - v[2]) - v[1], dz = v[0] * v[1] - (8 / 3) * v[2];
    v[0] += dx * d; v[1] += dy * d; v[2] += dz * d;
    tr.pts.push([v[0], v[1], v[2]]);
    if (tr.pts.length > 1100) tr.pts.shift();
  }
  function lorenzTrail(c, pts, ca, sa, sc, cx, cy, colA, colB, fade) {
    var n = pts.length, chunk = 40, ca0 = hexRgb(colA), ca1 = hexRgb(colB);
    for (var j = 0; j < n - 1; j += chunk) {
      var u = j / n;
      c.strokeStyle = "rgba(" + ca0.map(function (v, i) { return Math.round(v + (ca1[i] - v) * u); }).join(",") + "," + ((0.1 + u * 0.85) * fade).toFixed(3) + ")";
      c.beginPath();
      for (var q = j; q <= Math.min(n - 1, j + chunk); q++) {
        var P = pts[q];
        var X = cx + (P[0] * ca - P[1] * sa) * sc, Y = cy - P[2] * sc * 0.95;
        if (q === j) c.moveTo(X, Y); else c.lineTo(X, Y);
      }
      c.stroke();
    }
    var L = pts[n - 1];
    return [cx + (L[0] * ca - L[1] * sa) * sc, cy - L[2] * sc * 0.95];
  }
  A.lorenz = function (c, w, h, t, p, s) {
    if (!s.main) {
      s.main = { v: [0.1, 0, 0], pts: [] };
      for (var i = 0; i < 1400; i++) lorenzStep(s.main);
    }
    for (var k = 0; k < (reduce ? 0 : 5); k++) {
      lorenzStep(s.main);
      if (s.twin) lorenzStep(s.twin);
    }
    c.clearRect(0, 0, w, h);
    var ang = t * 0.2 + (p.x - 0.5) * 3 * p.a, ca = Math.cos(ang), sa = Math.sin(ang);
    var sc = Math.min(w / 58, h / 56), cx = w / 2, cy = h * 0.92;
    c.lineWidth = 1.2;
    var head = lorenzTrail(c, s.main.pts, ca, sa, sc, cx, cy, COL.x, COL.rose, 1);
    if (s.twin && s.twin.pts.length > 1) {
      var head2 = lorenzTrail(c, s.twin.pts, ca, sa, sc, cx, cy, COL.e, COL.ice, 0.9);
      glow(c, head2[0], head2[1], 14, COL.ice, 0.6);
      dot(c, head2[0], head2[1], 3.2, COL.ice);
      var a1 = s.main.v, b1 = s.twin.v;
      var gap = Math.sqrt(Math.pow(a1[0] - b1[0], 2) + Math.pow(a1[1] - b1[1], 2) + Math.pow(a1[2] - b1[2], 2));
      label(c, "\u0394 = " + (gap < 0.01 ? gap.toExponential(1) : gap.toFixed(gap < 10 ? 2 : 1)), 14, 22, rgba(COL.ice, 0.85));
    }
    glow(c, head[0], head[1], 16, COL.brass, 0.6);
    dot(c, head[0], head[1], 3.5, COL.brass);
  };
  A.lorenz.hint = "Butterfly effect";
  A.lorenz.tap = function (s) {
    if (!s.main) return;
    if (s.twin) { s.twin = null; return; }
    var v = s.main.v;
    s.twin = { v: [v[0] + 0.001, v[1], v[2]], pts: [[v[0] + 0.001, v[1], v[2]]] };
  };

  // Precalculus: the unit circle drawing a sine wave. A tap adds harmonics, circle on
  // circle (a Fourier series): a square wave, then a sawtooth, then back to the sine.
  var HARM = [
    [1, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 1 / 3, 0, 1 / 5, 0, 1 / 7, 0, 1 / 9].map(function (v) { return (v * 4 * 0.74) / Math.PI; }),
    [1, -1 / 2, 1 / 3, -1 / 4, 1 / 5, -1 / 6, 0, 0, 0].map(function (v) { return (v * 2 * 0.86) / Math.PI; })
  ];
  A.sine = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var goal = HARM[s.mode || 0];
    if (!s.amp) s.amp = goal.slice();
    for (var k = 0; k < 9; k++) s.amp[k] += (goal[k] - s.amp[k]) * 0.12;
    var R = Math.min(w * 0.18, h * 0.33), cx = w * 0.08 + R + 6, cy = h / 2;
    var th = p.a > 0.5 ? Math.atan2(cy - p.y * h, p.x * w - cx) : t * 0.9;
    c.strokeStyle = rgba(COL.dust, 0.35);
    c.lineWidth = 1;
    line(c, cx - R - 8, cy, w, cy);
    line(c, cx, cy - R - 8, cx, cy + R + 8);
    // the circles, each turning n times as fast as the first
    var px = cx, py = cy;
    for (k = 0; k < 9; k++) {
      var a = s.amp[k] * R, n = k + 1;
      if (Math.abs(a) < 0.6) continue;
      c.strokeStyle = rgba(COL.star, k ? 0.3 : 0.7);
      c.lineWidth = k ? 1 : 1.4;
      c.beginPath();
      c.arc(px, py, Math.abs(a), 0, TAU);
      c.stroke();
      if (!k) {
        c.fillStyle = rgba(COL.brass, 0.18);
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, R * 0.32, 0, -th, th > 0);
        c.closePath();
        c.fill();
      }
      var nx = px + Math.cos(n * th) * a, ny = py - Math.sin(n * th) * a;
      c.strokeStyle = k ? rgba(COL.brass, 0.75) : COL.brass;
      c.lineWidth = k ? 1.2 : 2;
      line(c, px, py, nx, ny);
      px = nx;
      py = ny;
    }
    var x0 = cx + R + 16;
    c.setLineDash([3, 4]);
    c.strokeStyle = rgba(COL.star, 0.4);
    c.lineWidth = 1;
    line(c, px, py, x0, py);
    c.setLineDash([]);
    c.strokeStyle = COL.rose;
    c.lineWidth = 2.2;
    c.beginPath();
    for (var u = 0; u <= w - x0; u += 3) {
      var y = cy;
      for (k = 0; k < 9; k++) if (s.amp[k]) y -= R * s.amp[k] * Math.sin((k + 1) * (th - u / R));
      if (u === 0) c.moveTo(x0 + u, y); else c.lineTo(x0 + u, y);
    }
    c.stroke();
    glow(c, px, py, 16, COL.brass, 0.5);
    dot(c, px, py, 5, COL.brass);
    dot(c, x0, py, 4, COL.rose);
  };
  A.sine.hint = "Add harmonics";
  A.sine.tap = function (s) { s.mode = ((s.mode || 0) + 1) % HARM.length; };

  // Calculus: area under a curve and the tangent line at a moving point.
  // A tap lays Riemann rectangles under the area, 4, 8, 16 then 32 of them, closing in on it.
  var RIEMANN = [0, 4, 8, 16, 32];
  A.calculus = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var x0 = w * 0.07, x1 = w * 0.93, base = h * 0.86;
    function f(u) { return 0.5 + 0.22 * Math.sin(u * 5.2 + 0.4) + 0.12 * Math.sin(u * 11 + 1.3); }
    function X(u) { return lerp(x0, x1, u); }
    function Y(v) { return base - v * h * 0.72; }
    var u0 = lerp(0.5 + 0.42 * Math.sin(t * 0.45), clamp((p.x * w - x0) / (x1 - x0), 0.02, 0.98), p.a);
    var g = c.createLinearGradient(0, Y(1), 0, base);
    g.addColorStop(0, rgba(COL.brass, 0.4));
    g.addColorStop(1, rgba(COL.brass, 0.03));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(X(0), base);
    for (var u = 0; u <= u0; u += 0.01) c.lineTo(X(u), Y(f(u)));
    c.lineTo(X(u0), Y(f(u0)));
    c.lineTo(X(u0), base);
    c.closePath();
    c.fill();
    var nR = RIEMANN[s.n || 0];
    if (nR) {
      var du = u0 / nR;
      c.fillStyle = rgba(COL.brass, 0.16);
      c.strokeStyle = rgba(COL.brass, 0.7);
      c.lineWidth = 1;
      for (var r = 0; r < nR; r++) {
        var top = Y(f(r * du)), left = X(r * du), right = X((r + 1) * du);
        c.fillRect(left, top, right - left, base - top);
        c.strokeRect(left, top, right - left, base - top);
      }
      label(c, "n = " + nR, x0 + 4, h * 0.12, rgba(COL.brass, 0.9));
    }
    c.strokeStyle = rgba(COL.dust, 0.4);
    c.lineWidth = 1;
    line(c, x0, base, x1, base);
    c.strokeStyle = COL.star;
    c.lineWidth = 2;
    c.beginPath();
    for (u = 0; u <= 1.0001; u += 0.01) { if (u === 0) c.moveTo(X(u), Y(f(u))); else c.lineTo(X(u), Y(f(u))); }
    c.stroke();
    var d = (f(u0 + 0.001) - f(u0 - 0.001)) / 0.002;
    var slope = (d * h * 0.72) / (x1 - x0);
    var px = X(u0), py = Y(f(u0)), L = w * 0.22;
    c.strokeStyle = COL.rose;
    c.lineWidth = 2;
    line(c, px - L, py + slope * L, px + L, py - slope * L);
    glow(c, px, py, 16, COL.rose, 0.5);
    dot(c, px, py, 5, COL.rose);
  };
  A.calculus.hint = "Show Riemann sums";
  A.calculus.tap = function (s) { s.n = ((s.n || 0) + 1) % RIEMANN.length; };

  // Linear Algebra: a grid transformed by a matrix; the pointer drags î.
  // A tap shows the eigenvectors (the directions the map only stretches) with their
  // eigenvalues, and the determinant: how much the shaded square's area grows.
  A.matrix = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, u = Math.min(w, h) * 0.15;
    var a = 1 + 0.35 * Math.sin(t * 0.7), cc = 0.3 * Math.sin(t * 0.6 + 1);
    var b = 0.45 * Math.sin(t * 0.5), d = 1 + 0.25 * Math.cos(t * 0.8);
    a = lerp(a, (p.x * w - cx) / u, p.a);
    cc = lerp(cc, -(p.y * h - cy) / u, p.a);
    function T(x, y) { return [cx + (a * x + b * y) * u, cy - (cc * x + d * y) * u]; }
    c.lineWidth = 1;
    c.strokeStyle = rgba(COL.dust, 0.12);
    for (var k = -8; k <= 8; k++) {
      line(c, cx + k * u, 0, cx + k * u, h);
      line(c, 0, cy + k * u, w, cy + k * u);
    }
    c.strokeStyle = rgba(COL.ice, 0.4);
    for (k = -8; k <= 8; k++) {
      var p1 = T(k, -8), p2 = T(k, 8), p3 = T(-8, k), p4 = T(8, k);
      line(c, p1[0], p1[1], p2[0], p2[1]);
      line(c, p3[0], p3[1], p4[0], p4[1]);
    }
    var o = T(0, 0), i1 = T(1, 0), j1 = T(0, 1), ij = T(1, 1);
    c.fillStyle = rgba(COL.brass, 0.16);
    c.beginPath();
    c.moveTo(o[0], o[1]);
    c.lineTo(i1[0], i1[1]);
    c.lineTo(ij[0], ij[1]);
    c.lineTo(j1[0], j1[1]);
    c.closePath();
    c.fill();
    arrow(c, o[0], o[1], i1[0], i1[1], COL.brass, 2.4);
    arrow(c, o[0], o[1], j1[0], j1[1], COL.rose, 2.4);
    if (s.eig) {
      var tr = a + d, det = a * d - b * cc, disc = tr * tr - 4 * det, far = Math.max(w, h);
      var text = "det = " + det.toFixed(2);
      if (disc >= 0) {
        var lams = [(tr + Math.sqrt(disc)) / 2, (tr - Math.sqrt(disc)) / 2];
        lams.forEach(function (lam, k2) {
          var vx = b, vy = lam - a;
          if (Math.abs(vx) + Math.abs(vy) < 1e-6) { vx = lam - d; vy = cc; }
          if (Math.abs(vx) + Math.abs(vy) < 1e-6) { vx = k2 ? 0 : 1; vy = k2 ? 1 : 0; }
          var n = Math.hypot(vx, vy);
          vx /= n; vy /= n;
          var col = k2 ? COL.x : COL.ice;
          c.setLineDash([5, 6]);
          c.strokeStyle = rgba(col, 0.6);
          c.lineWidth = 1.4;
          line(c, cx - vx * far, cy + vy * far, cx + vx * far, cy - vy * far);
          c.setLineDash([]);
          arrow(c, cx, cy, cx + vx * lam * u, cy - vy * lam * u, col, 2);
        });
        text += "   \u03bb = " + lams[0].toFixed(2) + ", " + lams[1].toFixed(2);
      } else {
        text += "   \u03bb \u2208 \u2102";
      }
      label(c, text, 14, 22, rgba(COL.star, 0.85));
    }
  };
  A.matrix.hint = "Show eigenvectors";
  A.matrix.tap = function (s) { s.eig = !s.eig; };

  // Differential Equations: particles flowing along a spiral vector field.
  // A tap changes the linear system: spiral sink, saddle, centre, source, and back.
  var SYSTEMS = [[-0.35, -1.6, 1.6, -0.35], [1.1, 0, 0, -1.1], [0, -1.5, 1.5, 0], [0.55, 0.2, 0.1, 0.75]];
  A.flow = function (c, w, h, t, p, s) {
    var dt = stepTime(s, t);
    var C = pointer(p, w, h, t * 0.6, 0.15, 0.15);
    if (!s.ps) {
      s.ps = [];
      for (var i = 0; i < 170; i++) s.ps.push({ x: rand(0, w), y: rand(0, h), age: rand(0, 4) });
      c.clearRect(0, 0, w, h);
    }
    var goal = SYSTEMS[s.sys || 0];
    if (!s.Mx) s.Mx = goal.slice();
    for (var k = 0; k < 4; k++) s.Mx[k] += (goal[k] - s.Mx[k]) * (reduce ? 1 : 0.06);
    var Mx = s.Mx;
    var m = Math.min(w, h);
    if (reduce) { c.clearRect(0, 0, w, h); dt = 1 / 30; }
    else { c.fillStyle = rgba(COL.tile, 0.16); c.fillRect(0, 0, w, h); }
    c.lineWidth = 1.4;
    for (var rep = 0; rep < (reduce ? 40 : 1); rep++) s.ps.forEach(function (q) {
      var dx = (q.x - C[0]) / m, dy = (q.y - C[1]) / m;
      var vx = Mx[0] * dx + Mx[1] * dy, vy = Mx[2] * dx + Mx[3] * dy;
      var nx = q.x + vx * m * dt * 0.9, ny = q.y + vy * m * dt * 0.9;
      var sp = Math.hypot(vx, vy);
      c.strokeStyle = rgba(sp > 0.5 ? COL.brass : COL.ice, 0.85);
      line(c, q.x, q.y, nx, ny);
      q.x = nx; q.y = ny; q.age += dt;
      if (q.age > 5 || Math.hypot(q.x - C[0], q.y - C[1]) < 4 || q.x < -10 || q.y < -10 || q.x > w + 10 || q.y > h + 10) {
        q.x = rand(0, w); q.y = rand(0, h); q.age = 0;
      }
    });
    if (reduce) {
      glow(c, C[0], C[1], 18, COL.rose, 0.5);
    }
  };
  A.flow.hint = "Change the system";
  A.flow.tap = function (s) { s.sys = ((s.sys || 0) + 1) % SYSTEMS.length; };

  // Vector & Tensor Analysis: an arrow field swirling around a point (curl).
  // A tap shows pure curl (∇×F, no spreading) or pure divergence (∇·F, no turning), then the mix again.
  A.vectors = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var T = pointer(p, w, h, t * 0.7, 0.22, 0.2);
    var cols = 10, rows = 7, sx = w / cols, sy = h / rows, m = Math.min(w, h);
    var mixA = 0.5 + 0.5 * Math.sin(t * 0.4);
    var mode = s.mode || 0;
    var goalCu = mode === 1 ? 1 : mode === 2 ? 0 : 0.5 + mixA * 0.5;
    var goalRa = mode === 1 ? 0 : mode === 2 ? -0.9 : 0.6 - mixA * 0.5;
    if (s.cu === undefined || reduce) { s.cu = goalCu; s.ra = goalRa; }
    s.cu += (goalCu - s.cu) * 0.08;
    s.ra += (goalRa - s.ra) * 0.08;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var x = sx * (i + 0.5), y = sy * (j + 0.5);
      var dx = x - T[0], dy = y - T[1], r = Math.hypot(dx, dy) || 1;
      var vx = (-dy / r) * s.cu - (dx / r) * s.ra;
      var vy = (dx / r) * s.cu - (dy / r) * s.ra;
      var L = Math.min(sx, sy) * 0.42 * (0.45 + 0.55 * Math.exp(-r / (m * 0.45)));
      var k = Math.exp(-r / (m * 0.35));
      arrow(c, x - vx * L * 0.5, y - vy * L * 0.5, x + vx * L * 0.5, y + vy * L * 0.5, mix(COL.ice, COL.brass, k), 1.5);
    }
    glow(c, T[0], T[1], 22, COL.rose, 0.55);
    dot(c, T[0], T[1], 4, COL.rose);
    if (mode) label(c, mode === 1 ? "\u2207\u00d7F \u2260 0    \u2207\u00b7F = 0" : "\u2207\u00b7F > 0    \u2207\u00d7F = 0", 14, 22, rgba(COL.star, 0.85));
  };
  A.vectors.hint = "Curl or divergence";
  A.vectors.tap = function (s) { s.mode = ((s.mode || 0) + 1) % 3; };

  // Complex Analysis: the Joukowski map turns circles into a wing shape.
  // A tap applies another map to the same circles and rays: z², 1/z, sin z.
  var MAPS = [
    ["w = z + 1/z", function (x, y) { var d = x * x + y * y; return [x + x / d, y - y / d]; }],
    ["w = z\u00b2", function (x, y) { return [x * x - y * y, 2 * x * y]; }],
    ["w = 1/z", function (x, y) { var d = x * x + y * y; return [x / d, -y / d]; }],
    ["w = sin z", function (x, y) { x *= 0.7; y *= 0.7; return [Math.sin(x) * Math.cosh(y), Math.cos(x) * Math.sinh(y)]; }]
  ];
  A.complex = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var mx = lerp(-0.1 + 0.05 * Math.sin(t * 0.5), -(p.x - 0.5) * 0.5, p.a);
    var my = lerp(0.1 + 0.06 * Math.cos(t * 0.4), (0.5 - p.y) * 0.5, p.a);
    var R = Math.hypot(1 - mx, my);
    var mode = s.map || 0, f = MAPS[mode][1];
    var rings = [1, 1.12, 1.3, 1.55, 1.9, 2.4], curves = [], i, k;
    rings.forEach(function (kk) {
      var pts = [];
      for (i = 0; i <= 160; i++) {
        var a = (i / 160) * TAU;
        pts.push(f(mx + R * kk * Math.cos(a), my + R * kk * Math.sin(a)));
      }
      curves.push(pts);
    });
    var rays = [];
    for (var r = 0; r < 18; r++) {
      var a2 = (r / 18) * TAU + t * 0.08, ray = [];
      for (var s2 = 1; s2 <= 2.4; s2 += 0.05) ray.push(f(mx + R * s2 * Math.cos(a2), my + R * s2 * Math.sin(a2)));
      rays.push(ray);
    }
    // the first map keeps its own framing; the others are fitted to the canvas
    var goal = Math.min(w / 5, h / 3.2);
    if (mode) {
      var mu = 0, mv = 0;
      for (k = 0; k < 4; k++) curves[k].forEach(function (q) { mu = Math.max(mu, Math.abs(q[0])); mv = Math.max(mv, Math.abs(q[1])); });
      goal = Math.min((w * 0.44) / (mu || 1), (h * 0.42) / (mv || 1));
    }
    s.sc = s.sc === undefined || reduce ? goal : s.sc + (goal - s.sc) * 0.1;
    var sc = s.sc, cx = w / 2, cy = h / 2;
    function path(pts) {
      c.beginPath();
      pts.forEach(function (q, j) {
        var X = cx + q[0] * sc, Y = cy - q[1] * sc;
        if (j === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      });
    }
    curves.forEach(function (pts, idx) {
      path(pts);
      if (idx === 0) {
        c.fillStyle = rgba(COL.brass, 0.85);
        c.fill();
      } else {
        c.strokeStyle = rgba(COL.ice, 0.42 - idx * 0.05);
        c.lineWidth = 1.2;
        c.stroke();
      }
    });
    rays.forEach(function (pts) {
      path(pts);
      c.strokeStyle = rgba(COL.x, 0.28);
      c.stroke();
    });
    if (mode) label(c, MAPS[mode][0], 14, 22, rgba(COL.star, 0.85));
  };
  A.complex.hint = "Change the map";
  A.complex.tap = function (s) { s.map = ((s.map || 0) + 1) % MAPS.length; };

  // Group Theory: the symmetries of a hexagon, rotating and flipping.
  // A tap changes the polygon: triangle, square, pentagon, hexagon (the dihedral group Dn, 2n moves).
  var SHAPES = [6, 3, 4, 5];
  var SUB = "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089";
  A.symmetry = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var N = SHAPES[s.shape || 0], step = TAU / N;
    var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.32;
    var ops = ["r", "r", "f", "r", "f", "r", "r", "f"];
    var per = 1.8, n = Math.floor(t / per), fr = (t / per) % 1;
    var e = fr < 0.55 ? 0.5 - 0.5 * Math.cos((fr / 0.55) * Math.PI) : 1;
    var ang = 0, flip = 1;
    for (var k = 0; k < n % ops.length; k++) {
      if (ops[k] === "r") ang += step; else flip = -flip;
    }
    var op = ops[n % ops.length], sxs = flip;
    if (op === "r") ang += step * e; else sxs = flip * Math.cos(e * Math.PI);
    if (p.a > 0.5) { ang = Math.atan2(p.y * h - cy, p.x * w - cx); sxs = 1; flip = 1; }
    c.strokeStyle = rgba(COL.dust, 0.2);
    c.setLineDash([3, 5]);
    c.beginPath();
    for (var i = 0; i <= N; i++) {
      var a = i * step - Math.PI / 2;
      if (i === 0) c.moveTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); else c.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    }
    c.stroke();
    if (op === "f" && p.a <= 0.5) line(c, cx, cy - R * 1.25, cx, cy + R * 1.25);
    c.setLineDash([]);
    c.save();
    c.translate(cx, cy);
    c.scale(sxs, 1);
    c.rotate(ang);
    var cols = [COL.brass, COL.rose, COL.x, COL.e, COL.b, COL.h];
    for (i = 0; i < N; i++) {
      var a1 = i * step - Math.PI / 2, a2 = (i + 1) * step - Math.PI / 2;
      c.fillStyle = rgba(cols[i % 6], 0.22);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(R * Math.cos(a1), R * Math.sin(a1));
      c.lineTo(R * Math.cos(a2), R * Math.sin(a2));
      c.closePath();
      c.fill();
      c.strokeStyle = rgba(COL.star, 0.8);
      c.lineWidth = 1.6;
      line(c, R * Math.cos(a1), R * Math.sin(a1), R * Math.cos(a2), R * Math.sin(a2));
    }
    for (i = 0; i < N; i++) {
      var av = i * step - Math.PI / 2;
      dot(c, R * Math.cos(av), R * Math.sin(av), 7, cols[i % 6]);
    }
    c.restore();
    dot(c, cx, cy, 3, COL.star);
    if (s.shape) label(c, "D" + SUB[N] + "   |G| = " + 2 * N, 14, 22, rgba(COL.star, 0.85));
  };
  A.symmetry.hint = "Change the shape";
  A.symmetry.tap = function (s) { s.shape = ((s.shape || 0) + 1) % SHAPES.length; };

  // Probability: a Galton board building a bell curve.
  A.galton = function (c, w, h, t, p, s) {
    var dt = stepTime(s, t);
    var rows = 9, top = h * 0.1, dy = h * 0.052, dx = Math.min(w * 0.075, h * 0.09);
    var cx = w / 2, binTop = top + rows * dy + 8, bins = rows + 1;
    if (!s.balls) {
      s.balls = []; s.acc = 0;
      s.bins = [];
      for (var bi = 0, cnk = 1; bi < bins; bi++) {
        s.bins.push(Math.round((cnk / 256) * 60));
        cnk = (cnk * (rows - bi)) / (bi + 1);
      }
    }
    s.acc += dt * (1 + 2 * p.a);
    while (s.acc > 0.09) {
      s.acc -= 0.09;
      s.balls.push({ row: 0, k: 0, f: 0 });
    }
    var maxBin = Math.max.apply(null, s.bins);
    if (maxBin > 34) s.bins = s.bins.map(function (v) { return Math.floor(v * 0.4); });
    c.clearRect(0, 0, w, h);
    for (var r = 0; r < rows; r++) for (var i = 0; i <= r; i++) dot(c, cx + (i - r / 2) * dx, top + r * dy, 2.2, rgba(COL.dust, 0.6));
    var bw = dx * 0.86, H = h - binTop - 6;
    for (var b = 0; b < bins; b++) {
      var bx = cx + (b - rows / 2) * dx, bh = (s.bins[b] / 36) * H;
      c.fillStyle = rgba(COL.brass, 0.7);
      c.fillRect(bx - bw / 2, h - 6 - bh, bw, bh);
    }
    c.strokeStyle = COL.rose;
    c.lineWidth = 1.6;
    c.beginPath();
    var tot = s.bins.reduce(function (a, v) { return a + v; }, 0) || 1;
    for (var z = -rows / 2 - 0.5; z <= rows / 2 + 0.5; z += 0.1) {
      var g = Math.exp(-(z * z) / (2 * (rows / 4))) / Math.sqrt(TAU * (rows / 4));
      var y = h - 6 - ((g * tot) / 36) * H;
      if (z === -rows / 2 - 0.5) c.moveTo(cx + z * dx, y); else c.lineTo(cx + z * dx, y);
    }
    c.stroke();
    s.balls = s.balls.filter(function (q) {
      q.f += dt / 0.085;
      if (q.f < 0) return true; // still waiting at the top (a tap's burst comes in one by one)
      while (q.f >= 1) {
        q.f -= 1;
        q.row++;
        if (Math.random() < 0.5) q.k++;
        if (q.row >= rows) { s.bins[q.k]++; return false; }
      }
      var x0 = cx + (q.k - q.row / 2) * dx, y0 = top + q.row * dy - 6;
      dot(c, x0 + (q.f - 0.5) * dx * 0.5, y0 + q.f * dy, 3, q.burst ? COL.brass : COL.ice);
      return true;
    });
  };
  A.galton.hint = "Drop more balls";
  A.galton.tap = function (s) {
    if (!s.balls) return;
    for (var i = 0; i < 30; i++) s.balls.push({ row: 0, k: 0, f: -i * 0.6, burst: true });
  };

  // History & Philosophy: a brass armillary sphere; the pointer turns it.
  // A tap swaps what sits in the middle: the Earth (Ptolemy) or the Sun (Copernicus),
  // and then the Earth goes round on the ecliptic ring.
  A.armillary = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.38;
    var spin = t * 0.3 + (p.x - 0.5) * 2.5 * p.a, tiltX = 0.42 + (p.y - 0.5) * 0.8 * p.a;
    function proj(x, y, z) {
      var cs = Math.cos(spin), sn = Math.sin(spin);
      var X = x * cs + z * sn, Z = -x * sn + z * cs;
      var ct = Math.cos(tiltX), st = Math.sin(tiltX);
      var Y = y * ct - Z * st, Z2 = y * st + Z * ct;
      return [cx + X * R, cy + Y * R, Z2];
    }
    function ring(fn, col, wd) {
      var pts = [];
      for (var i = 0; i <= 72; i++) {
        var q = fn((i / 72) * TAU);
        pts.push(proj(q[0], q[1], q[2]));
      }
      [false, true].forEach(function (frontSide) {
        c.beginPath();
        for (var k = 0; k < 72; k++) {
          if ((pts[k][2] > 0) !== frontSide) continue;
          c.moveTo(pts[k][0], pts[k][1]);
          c.lineTo(pts[k + 1][0], pts[k + 1][1]);
        }
        c.strokeStyle = rgba(col, frontSide ? 0.95 : 0.3);
        c.lineWidth = frontSide ? wd : wd * 0.7;
        c.stroke();
      });
    }
    var e = 0.409;
    ring(function (a) { return [Math.cos(a), 0, Math.sin(a)]; }, COL.brass, 2.6);
    ring(function (a) { return [Math.cos(a), Math.sin(a), 0]; }, COL.brass, 2.2);
    ring(function (a) { return [0, Math.sin(a), Math.cos(a)]; }, COL.brass, 2.2);
    ring(function (a) { return [Math.cos(a) * Math.cos(e), Math.sin(e) * Math.cos(a) * 0 - Math.cos(a) * Math.sin(e), Math.sin(a)]; }, COL.rose, 2);
    ring(function (a) { return [Math.cos(a) * Math.cos(e), -Math.sin(e), Math.sin(a) * Math.cos(e)]; }, COL.dust, 1.2);
    ring(function (a) { return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]; }, COL.dust, 1.2);
    var n = proj(0, -1.25, 0), s2 = proj(0, 1.25, 0);
    c.strokeStyle = rgba(COL.star, 0.6);
    c.lineWidth = 1.4;
    line(c, n[0], n[1], s2[0], s2[1]);
    var g = c.createRadialGradient(cx - R * 0.08, cy - R * 0.08, 1, cx, cy, R * 0.2);
    if (s.helio) {
      glow(c, cx, cy, R * 0.5, COL.brass, 0.45);
      g.addColorStop(0, "#fff4d4");
      g.addColorStop(1, COL.brass);
      dot(c, cx, cy, R * 0.16, g);
      var ea = t * 0.6, E = proj(Math.cos(ea) * Math.cos(e), -Math.cos(ea) * Math.sin(e), Math.sin(ea));
      var eg = c.createRadialGradient(E[0] - 2, E[1] - 2, 1, E[0], E[1], R * 0.07);
      eg.addColorStop(0, "#d9f1ff");
      eg.addColorStop(1, "#2a62a8");
      c.globalAlpha = E[2] > 0 ? 1 : 0.55;
      dot(c, E[0], E[1], R * 0.065, eg);
      c.globalAlpha = 1;
    } else {
      g.addColorStop(0, "#d9f1ff");
      g.addColorStop(1, "#2a62a8");
      dot(c, cx, cy, R * 0.18, g);
    }
  };
  A.armillary.hint = "Earth or Sun at the centre";
  A.armillary.tap = function (s) { s.helio = !s.helio; };

  // Quantum & Relativity (pop): the double-slit experiment building its pattern.
  A.slits = function (c, w, h, t, p, s) {
    var dt = stepTime(s, t);
    var bx = w * 0.3, sx = w * 0.9, cy = h / 2;
    var d = lerp(h * 0.14, clamp(Math.abs(p.y * h - cy) * 2, h * 0.06, h * 0.4), p.a);
    if (!s.hits || Math.abs(d - s.d) > h * 0.03) { s.hits = []; s.d = d; }
    c.clearRect(0, 0, w, h);
    c.lineWidth = 1.4;
    for (var k = 0; k < 6; k++) {
      var xx = ((t * 40 + k * 18) % (bx - 10));
      c.strokeStyle = rgba(COL.ice, 0.45 * (xx / bx));
      line(c, xx, h * 0.15, xx, h * 0.85);
    }
    [cy - d / 2, cy + d / 2].forEach(function (y0) {
      for (var j = 0; j < 7; j++) {
        var r = (t * 40 + j * 18) % (sx - bx);
        c.strokeStyle = rgba(COL.ice, 0.4 * (1 - r / (sx - bx)));
        c.beginPath();
        c.arc(bx, y0, r, -1.2, 1.2);
        c.stroke();
      }
    });
    c.fillStyle = COL.dust;
    c.fillRect(bx - 3, 0, 6, cy - d / 2 - 5);
    c.fillRect(bx - 3, cy - d / 2 + 5, 6, d - 10);
    c.fillRect(bx - 3, cy + d / 2 + 5, 6, h);
    var lam = h * 0.0024 * 14, sg = 2 * Math.pow(h * 0.16, 2);
    for (var n = 0; n < 4; n++) {
      for (var tries = 0; tries < 30; tries++) {
        var y = rand(0, h), yy = y - cy, I;
        // watched: each particle went through one slit, so the two humps just add up, no fringes
        if (s.det) I = 0.5 * (Math.exp(-Math.pow(yy - d / 2, 2) / sg) + Math.exp(-Math.pow(yy + d / 2, 2) / sg));
        else I = Math.pow(Math.cos((Math.PI * d * yy) / (lam * (sx - bx))), 2) * Math.exp(-(yy * yy) / (2 * Math.pow(h * 0.26, 2)));
        if (Math.random() < I) { s.hits.push([sx + rand(-6, 6), y]); break; }
      }
    }
    if (s.det) {
      [cy - d / 2, cy + d / 2].forEach(function (y0) {
        glow(c, bx + 9, y0, 12, COL.brass, 0.5 + 0.3 * Math.sin(t * 6));
        dot(c, bx + 9, y0, 3, COL.brass);
      });
    }
    if (s.hits.length > 900) s.hits.splice(0, 200);
    c.fillStyle = rgba(COL.star, 0.08);
    c.fillRect(sx - 8, 0, 16, h);
    // all the hits share one colour, so they are filled in one go
    c.fillStyle = rgba(COL.brass, 0.85);
    c.beginPath();
    for (var hi = 0; hi < s.hits.length; hi++) {
      var hq = s.hits[hi];
      c.moveTo(hq[0] + 1.3, hq[1]);
      c.arc(hq[0], hq[1], 1.3, 0, TAU);
    }
    c.fill();
    void dt;
  };
  A.slits.hint = "Detector on or off";
  A.slits.tap = function (s) { s.det = !s.det; s.hits = []; };

  // Universe & Space: a ringed planet and its moon among parallax stars.
  A.planet = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var m = Math.min(w, h), r = m * 0.22;
    if (!s.st) {
      s.st = [];
      for (var i = 0; i < 70; i++) s.st.push([Math.random(), Math.random(), rand(0.3, 1)]);
      // the planet is painted once; each frame only turns it a little
      var L = layer(r * 5.4, r * 3.2, c.canvas.width / w);
      drawRingedPlanet(L.c, r * 2.7, r * 1.6, r, -0.32, 0, COL.brass, COL.rose);
      s.pl = L.cv;
    }
    var ox = (p.x - 0.5) * p.a, oy = (p.y - 0.5) * p.a;
    c.fillStyle = COL.star;
    s.st.forEach(function (q) {
      c.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t + q[0] * 9));
      c.fillRect(q[0] * w - ox * 30 * q[2], q[1] * h - oy * 20 * q[2], q[2] * 1.6, q[2] * 1.6);
    });
    c.globalAlpha = 1;
    var cx = w / 2 - ox * 12, cy = h / 2 - oy * 10;
    glow(c, cx, cy, r * 2.4, COL.x, 0.2);
    var ma = t * 0.5;
    var mx = cx + Math.cos(ma) * r * 2.6, my = cy + Math.sin(ma) * r * 0.7;
    if (Math.sin(ma) < 0) drawMoon(c, mx, my, r * 0.12, true);
    c.save();
    c.translate(cx, cy);
    c.rotate(ox * 0.5);
    c.drawImage(s.pl, -r * 2.7, -r * 1.6, r * 5.4, r * 3.2);
    c.restore();
    if (Math.sin(ma) >= 0) drawMoon(c, mx, my, r * 0.12, true);
    if (s.shots) {
      s.shots = s.shots.filter(function (sh) {
        var k = (t - sh.t0) / 0.9;
        if (k >= 1) return false;
        var sx = sh.x + k * w * 0.3, sy = sh.y + k * h * 0.2;
        var gr = c.createLinearGradient(sx, sy, sx - 80, sy - 50);
        gr.addColorStop(0, rgba(COL.star, 0.95 * (1 - k)));
        gr.addColorStop(1, rgba(COL.star, 0));
        c.strokeStyle = gr;
        c.lineWidth = 1.8;
        line(c, sx, sy, sx - 80, sy - 50);
        return true;
      });
    }
  };
  A.planet.hint = "Make a shooting star";
  A.planet.tap = function (s, x, y, w, h, t) {
    if (x === null) { x = rand(0.05, 0.6) * w; y = rand(0.05, 0.4) * h; }
    (s.shots = s.shots || []).push({ x: x, y: y, t0: t });
  };

  // The Beauty of Mathematics: a sunflower grown from the golden angle.
  // A tap tries other angles: 135° (3/8 of a turn) leaves 8 straight gaps, 137° almost works,
  // 90° makes 4 spokes. Only the golden angle, 137.5°, packs the seeds with no gaps at all.
  var ANGLES = [137.508, 135, 137, 90];
  A.golden = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var goalAng = ANGLES[s.ang || 0];
    s.deg = s.deg === undefined || reduce ? goalAng : s.deg + (goalAng - s.deg) * 0.08;
    var N = 460;
    if (!s.cols) {
      s.cols = [];
      for (var q = 0; q < N; q++) {
        var v = q / N;
        s.cols.push(v < 0.5 ? mix(COL.brass, COL.rose, v * 2) : mix(COL.rose, COL.x, (v - 0.5) * 2));
      }
    }
    var n = reduce ? N : Math.min(N, Math.floor(((t * 70) % (N + 140)))), m = Math.min(w, h);
    var golden = s.deg + (p.x - 0.5) * 8 * p.a;
    var k = (m * 0.46) / Math.sqrt(N), cx = w / 2, cy = h / 2, rad = (golden * Math.PI) / 180;
    // seeds are filled in 20 colour steps instead of one at a time
    var STEP = Math.ceil(N / 20);
    for (var b0 = 0; b0 < n; b0 += STEP) {
      c.fillStyle = s.cols[Math.min(N - 1, b0 + (STEP >> 1))];
      c.beginPath();
      for (var i = b0; i < Math.min(n, b0 + STEP); i++) {
        var r = k * Math.sqrt(i), a = i * rad, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a), rr = 1.2 + (i / N) * 2.6;
        c.moveTo(x + rr, y);
        c.arc(x, y, rr, 0, TAU);
      }
      c.fill();
    }
    if (s.ang) label(c, golden.toFixed(1) + "\u00b0", w - 14, h - 14, rgba(COL.star, 0.85), "right");
  };
  A.golden.hint = "Try another angle";
  A.golden.tap = function (s) { s.ang = ((s.ang || 0) + 1) % ANGLES.length; };

  // Biographies: a constellation of minds that links up around the pointer.
  A.constellation = function (c, w, h, t, p, s) {
    var dt = stepTime(s, t);
    if (!s.st) {
      s.st = [];
      for (var i = 0; i < 26; i++) s.st.push({ x: rand(0.05, 0.95) * w, y: rand(0.08, 0.92) * h, vx: rand(-8, 8), vy: rand(-6, 6), r: rand(1.2, 3), tw: rand(0, TAU) });
    }
    var P = pointer(p, w, h, t * 0.8, 0.3, 0.3), D = Math.min(w, h) * 0.32;
    c.clearRect(0, 0, w, h);
    s.st.forEach(function (q) {
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.x < 5 || q.x > w - 5) q.vx = -q.vx;
      if (q.y < 5 || q.y > h - 5) q.vy = -q.vy;
    });
    c.lineWidth = 1;
    for (var a = 0; a < s.st.length; a++) {
      for (var b = a + 1; b < s.st.length; b++) {
        var d = Math.hypot(s.st[a].x - s.st[b].x, s.st[a].y - s.st[b].y);
        if (d < D * 0.6) {
          c.strokeStyle = rgba(COL.star, (1 - d / (D * 0.6)) * 0.3);
          line(c, s.st[a].x, s.st[a].y, s.st[b].x, s.st[b].y);
        }
      }
      var dp = Math.hypot(s.st[a].x - P[0], s.st[a].y - P[1]);
      if (dp < D) {
        c.strokeStyle = rgba(COL.brass, (1 - dp / D) * 0.8);
        line(c, P[0], P[1], s.st[a].x, s.st[a].y);
      }
    }
    c.fillStyle = COL.star;
    s.st.forEach(function (q) {
      c.globalAlpha = 0.08 + 0.06 * Math.sin(t * 2 + q.tw);
      c.beginPath(); c.arc(q.x, q.y, q.r * 3.4, 0, TAU); c.fill();
      c.globalAlpha = 0.9;
      c.beginPath(); c.arc(q.x, q.y, q.r, 0, TAU); c.fill();
    });
    c.globalAlpha = 1;
    glow(c, P[0], P[1], 20, COL.brass, 0.55);
    dot(c, P[0], P[1], 3.5, COL.brass);
  };
  A.constellation.hint = "Add a star";
  A.constellation.tap = function (s, x, y, w, h) {
    if (!s.st) return;
    if (x === null) { x = rand(0.1, 0.9) * w; y = rand(0.1, 0.9) * h; }
    s.st.push({ x: x, y: y, vx: rand(-8, 8), vy: rand(-6, 6), r: rand(1.6, 3), tw: rand(0, TAU) });
    if (s.st.length > 40) s.st.splice(26, 1); // the first 26 stay; the oldest added one goes
  };

  // Documentaries & Articles: an oscilloscope tracing Lissajous figures.
  // The pointer turns the phase between the two signals; a tap shows the next frequency ratio.
  A.scope = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    var pad = 14, W = w - pad * 2, H = h - pad * 2;
    c.fillStyle = "rgba(0,0,0,.25)";
    c.fillRect(pad, pad, W, H);
    c.strokeStyle = rgba(COL.ice, 0.12);
    c.lineWidth = 1;
    for (var i = 1; i < 8; i++) line(c, pad + (W * i) / 8, pad, pad + (W * i) / 8, pad + H);
    for (i = 1; i < 6; i++) line(c, pad, pad + (H * i) / 6, pad + W, pad + (H * i) / 6);
    var ratios = [[3, 2], [5, 4], [3, 4], [1, 2], [5, 6], [2, 3]];
    var idx = s.pick !== undefined ? s.pick : Math.floor(t / 5) % ratios.length;
    var a = ratios[idx][0], b = ratios[idx][1], dl = t * 0.6 + p.x * TAU * p.a;
    var cx = w / 2, cy = h / 2, Rx = W * 0.42, Ry = H * 0.4;
    c.beginPath();
    for (var k = 0; k <= 420; k++) {
      var u = (k / 420) * TAU;
      var x = cx + Rx * Math.sin(a * u + dl), y = cy + Ry * Math.sin(b * u);
      if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.lineJoin = "round";
    c.strokeStyle = rgba(COL.brass, 0.18);
    c.lineWidth = 7;
    c.stroke();
    c.strokeStyle = COL.brass;
    c.lineWidth = 2;
    c.stroke();
    label(c, a + " : " + b, w - pad - 8, pad + 18, rgba(COL.brass, 0.8), "right");
  };
  A.scope.hint = "Next figure";
  A.scope.tap = function (s, x, y, w, h, t) {
    var cur = s.pick !== undefined ? s.pick : Math.floor(t / 5) % 6;
    s.pick = (cur + 1) % 6;
  };

  // Page not found: a sun and an empty orbit; its planet has drifted off and keeps going.
  A.lost = function (c, w, h, t, p, s) {
    c.clearRect(0, 0, w, h);
    if (!s.st) { s.st = []; for (var i = 0; i < 80; i++) s.st.push([Math.random(), Math.random(), rand(0.3, 1)]); }
    var ox = (p.x - 0.5) * p.a, oy = (p.y - 0.5) * p.a;
    c.fillStyle = COL.star;
    s.st.forEach(function (q) {
      c.globalAlpha = 0.25 + 0.45 * Math.abs(Math.sin(t * 0.8 + q[0] * 9));
      c.fillRect(q[0] * w - ox * 24 * q[2], q[1] * h - oy * 16 * q[2], q[2] * 1.5, q[2] * 1.5);
    });
    c.globalAlpha = 1;
    var m = Math.min(w, h), cx = w * 0.36 - ox * 10, cy = h * 0.5 - oy * 8;
    var rx = m * 0.62, ry = m * 0.2, tilt = -0.18;
    glow(c, cx, cy, m * 0.3, COL.brass, 0.35);
    var sg = c.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, m * 0.07);
    sg.addColorStop(0, "#fff4d4");
    sg.addColorStop(1, COL.brass);
    dot(c, cx, cy, m * 0.07, sg);
    // the orbit it left
    c.save();
    c.translate(cx, cy);
    c.rotate(tilt);
    c.setLineDash([3, 6]);
    c.strokeStyle = rgba(COL.dust, 0.45);
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(0, 0, rx, ry, 0, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    // where it left from, and the straight path it took (as it would, with nothing pulling it)
    var a0 = -0.35, ex = Math.cos(a0) * rx, ey = Math.sin(a0) * ry;
    var tx = -Math.sin(a0) * rx, ty = Math.cos(a0) * ry, tl = Math.hypot(tx, ty);
    tx /= tl; ty /= tl;
    var u = (t % 10) / 10, d = u * w * 0.75;
    c.strokeStyle = rgba(COL.rose, 0.3);
    c.setLineDash([2, 5]);
    line(c, ex, ey, ex + tx * d, ey + ty * d);
    c.setLineDash([]);
    var px = ex + tx * d, py = ey + ty * d, pr = m * 0.045;
    c.globalAlpha = 1 - u * 0.6;
    glow(c, px, py, pr * 3.2, COL.rose, 0.35);
    drawMoon(c, px, py, pr, true);
    c.globalAlpha = 1;
    c.restore();
  };

  /* ---------- running the scenes ---------- */
  var items = [];
  // a figure is sized and drawn once when it comes near the screen (200 px away), so it is
  // ready when it arrives; it only moves while some of it is actually on the screen
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var it = en.target.__it;
      if (it && en.isIntersecting && !it.started) it.start();
    });
  }, { rootMargin: "200px" }) : null;
  var onScreen = io ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var it = en.target.__it;
      if (it) it.visible = en.isIntersecting;
    });
  }) : null;

  function frame(it, t) {
    var p = it.p;
    p.x += (p.tx - p.x) * 0.14;
    p.y += (p.ty - p.y) * 0.14;
    p.a += (p.ta - p.a) * 0.07;
    if (!it.w || !it.h) return;
    it.ctx.setTransform(it.dpr, 0, 0, it.dpr, 0, 0);
    it.t = t + it.offset; // taps use the same clock as the frames
    try {
      it.draw(it.ctx, it.w, it.h, it.t, p, it.state);
    } catch (err) {
      it.visible = false; // a figure that fails stops; the rest of the page carries on
      if (window.console) console.error(err);
    }
  }

  var TAP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 9.5 20 13.7l-4.6 1.7-1.7 4.6z"/><path d="M5.6 5.6 4 4M10 4.3V2M4.3 10H2"/></svg>';

  function setup(canvas) {
    var draw = A[canvas.getAttribute("data-anim")];
    if (!draw) return;
    var host = canvas.closest("[data-pointer]") || canvas;
    var it = {
      canvas: canvas, ctx: canvas.getContext("2d"), draw: draw, host: host,
      w: 0, h: 0, dpr: 1, visible: !io, state: {},
      offset: reduce ? 3 : Math.random() * 20,
      small: !!canvas.closest(".tile, .door"),
      p: { x: 0.5, y: 0.5, a: 0, tx: 0.5, ty: 0.5, ta: 0, down: false }
    };
    canvas.__it = it;
    function resize() {
      var r = canvas.getBoundingClientRect();
      // phones draw at 1.5× (their screens are 3×): a sharp picture for about half the pixels
      it.dpr = Math.min(canvas.classList.contains("hero-sky") || COARSE ? 1.5 : 2, window.devicePixelRatio || 1);
      it.w = r.width;
      it.h = r.height;
      canvas.width = Math.max(1, Math.round(r.width * it.dpr));
      canvas.height = Math.max(1, Math.round(r.height * it.dpr));
      it.state = {};
      // resizing clears the canvas, so draw a frame straight away
      frame(it, reduce ? 3 : performance.now() / 1000);
    }
    it.started = false;
    it.start = function () {
      if (it.started) return;
      it.started = true;
      if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
      else window.addEventListener("resize", resize);
      resize();
    };
    if (!io) it.start();
    host.addEventListener("pointermove", function (e) {
      if (!it.started) return;
      var r = canvas.getBoundingClientRect();
      it.p.tx = (e.clientX - r.left) / r.width;
      it.p.ty = (e.clientY - r.top) / r.height;
      it.p.ta = 1;
      if (reduce) { it.p.x = it.p.tx; it.p.y = it.p.ty; it.p.a = 1; frame(it, 3); }
    });
    host.addEventListener("pointerleave", function () { it.p.ta = 0; it.p.down = false; });
    host.addEventListener("pointercancel", function () { it.p.ta = 0; it.p.down = false; });
    if (!it.small) {
      // a press (mouse button or finger) on the big figures; tiles and doors are links, so not there
      host.addEventListener("pointerdown", function (e) {
        if (!it.started || (e.target.closest && e.target.closest("a, button"))) return;
        var r = canvas.getBoundingClientRect();
        it.p.tx = (e.clientX - r.left) / r.width;
        it.p.ty = (e.clientY - r.top) / r.height;
        it.p.ta = 1;
        it.p.down = true;
      });
      host.addEventListener("pointerup", function (e) {
        it.p.down = false;
        if (e.pointerType !== "mouse") it.p.ta = 0;
      });
    }
    // on a subject page the figure answers a tap, and a small button under it says what a tap does
    var banner = !it.small && draw.tap ? canvas.closest(".banner") : null;
    if (banner) {
      var play = function (x, y) {
        if (!it.started) return;
        draw.tap(it.state, x, y, it.w, it.h, it.t !== undefined ? it.t : (reduce ? 3 : performance.now() / 1000) + it.offset, it.p);
        if (reduce) frame(it, 3);
      };
      canvas.addEventListener("click", function (e) {
        var r = canvas.getBoundingClientRect();
        play(e.clientX - r.left, e.clientY - r.top);
      });
      banner.classList.add("is-playable");
      if (draw.hint) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "banner-hint";
        btn.innerHTML = TAP_ICON + '<span class="banner-hint-text"></span>';
        btn.lastChild.textContent = draw.hint;
        btn.addEventListener("click", function () { play(null, null); });
        banner.appendChild(btn); // into the room kept for it under the figure
      }
    }
    if (io) { io.observe(canvas); onScreen.observe(canvas); }
    items.push(it);
  }

  document.querySelectorAll("canvas[data-anim]").forEach(setup);

  if (!reduce && items.length) {
    // on a touch screen the figures keep moving while the page is scrolled, at 30 frames a
    // second (every other frame), and small decorative figures move at 30 frames a second
    // On slower devices the small figures share the work: when frames start taking
    // too long, each small figure redraws every other frame (the big ones never skip).
    var count = 0, last = 0, avg = 16.7, halve = false;
    var rootEl = document.documentElement, lastScroll = -1e9;
    // very fast screens (120 Hz and up) would redraw every figure twice as often as
    // anyone can use; there, a frame is only drawn once ~13 ms have passed (about 60 per second)
    var gap = 16.7, lastDrawn = 0;
    window.addEventListener("scroll", function () { lastScroll = performance.now(); }, { passive: true });
    var loop = function (now) {
      var t = now / 1000;
      if (last) gap += (Math.min(100, now - last) - gap) * 0.05;
      last = now;
      if (gap < 10 && now - lastDrawn < 13) { requestAnimationFrame(loop); return; }
      if (lastDrawn) {
        avg += (Math.min(100, now - lastDrawn) - avg) * 0.08;
        if (!halve && avg > 21) halve = true;
        else if (halve && avg < 17.5) halve = false;
      }
      lastDrawn = now;
      count++;
      // figures behind an open book panel or search box are hidden, so they rest;
      // while the page is scrolling, figures redraw every other frame so scrolling stays smooth
      var covered = rootEl.classList.contains("book-open") || rootEl.classList.contains("search-open");
      var scrolling = now - lastScroll < 160;
      if (!document.hidden && !covered) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (!it.visible) continue;
          if (COARSE && (scrolling || it.small) && (count + i) % 2) continue;
          if ((halve && it.small || scrolling) && (count + i) % 2) continue;
          frame(it, t);
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
})();
