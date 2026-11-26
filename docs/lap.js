/* Engineer's lap: one real lap of telemetry drives the page.
   - The strip under the hero plots the whole lap; its corner labels link to the sections.
   - Each section is pinned to a corner. Scroll position maps to lap distance through those
     anchors, and the spine (desktop) or lap bar (phone) shows where you are on the lap. */
(function () {
  "use strict";
  var LAP = window.LAP;
  if (!LAP) return;
  var NS = "http://www.w3.org/2000/svg";
  var T = LAP.trace, L = LAP.length, C = LAP.corners;
  var VMIN = 80, VMAX = 330;
  var first = true;

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function fmt(n) { return Math.round(n).toLocaleString("en-GB"); }
  function ordinal(g) { return g + (g === 1 ? "st" : g === 2 ? "nd" : g === 3 ? "rd" : "th"); }

  // Sample the trace at distance d (linear interpolation; gear and brake snap).
  function sample(d) {
    var lo = 0, hi = T.length - 1;
    if (d <= T[0][0]) return T[0];
    if (d >= T[hi][0]) return T[hi];
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (T[mid][0] <= d) lo = mid; else hi = mid; }
    var a = T[lo], b = T[hi], f = (d - a[0]) / (b[0] - a[0] || 1);
    return [d, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, f < 0.5 ? a[3] : b[3], f < 0.5 ? a[4] : b[4]];
  }
  var corners = C.map(function (d, i) { var s = sample(d); return { n: i + 1, d: d, v: Math.round(s[1]), g: s[4] }; });

  // Corner tags on each section.
  document.querySelectorAll(".turn[data-corner]").forEach(function (sec) {
    var c = corners[+sec.dataset.corner], tag = sec.querySelector(".tag");
    if (c && tag) tag.innerHTML = "<b>T" + c.n + "</b><span>" + c.v + " km/h · " + ordinal(c.g) + " gear · " + fmt(c.d) + " m</span>";
  });

  // ── Strip: the whole lap ────────────────────────────
  var strip = document.querySelector(".strip-svg"), cornerList = document.querySelector(".strip-corners");
  var names = Array.prototype.map.call(document.querySelectorAll(".turn[data-corner]"), function (s) { return s.dataset.short || ""; });
  function drawStrip() {
    if (!strip) return;
    var W = strip.clientWidth, H = strip.clientHeight, small = W < 640;
    var padL = small ? 0 : 64, top = small ? 12 : 56, spH = small ? 84 : 112;
    var thrY = top + spH + 12, thrH = small ? 10 : 16, brkY = thrY + thrH + 6, brkH = small ? 6 : 10, axY = H - 4;
    var x = function (d) { return padL + (d / L) * (W - padL); };
    var y = function (v) { return top + spH - ((v - VMIN) / (VMAX - VMIN)) * spH; };
    strip.setAttribute("viewBox", "0 0 " + W + " " + H);
    strip.textContent = "";
    [100, 200, 300].forEach(function (v) {
      el("line", { x1: padL, x2: W, y1: y(v), y2: y(v), class: "grid" }, strip);
      if (!small) el("text", { x: padL - 10, y: y(v) + 4, "text-anchor": "end", class: "axis" }, strip).textContent = v;
    });
    if (!small) {
      el("text", { x: 0, y: top - 8, class: "chan" }, strip).textContent = "km/h";
      el("text", { x: 0, y: thrY + thrH - 3, class: "chan" }, strip).textContent = "Throttle";
      el("text", { x: 0, y: brkY + brkH - 1, class: "chan" }, strip).textContent = "Brake";
    }
    corners.forEach(function (c) { el("line", { x1: x(c.d), x2: x(c.d), y1: top - 4, y2: y(c.v) - 6, class: "cline" }, strip); });
    var dSpeed = "", dThr = "M" + padL + " " + (thrY + thrH), dBrk = "";
    T.forEach(function (p, i) {
      dSpeed += (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1);
      dThr += "L" + x(p[0]).toFixed(1) + " " + (thrY + thrH - (p[2] / 100) * thrH).toFixed(1);
      if (p[3] && i < T.length - 1) dBrk += "M" + x(p[0]).toFixed(1) + " " + brkY + "H" + x(T[i + 1][0]).toFixed(1) + "v" + brkH + "H" + x(p[0]).toFixed(1) + "Z";
    });
    dThr += "L" + W + " " + (thrY + thrH) + "Z";
    el("path", { d: dThr, class: "thr" }, strip);
    el("path", { d: dBrk, class: "brk" }, strip);
    var sp = el("path", { d: dSpeed, class: "speed" }, strip);
    if (first && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sp.style.setProperty("--len", Math.ceil(sp.getTotalLength()));
      sp.classList.add("draw");
    }
    [0, 1000, 2000, 3000, 4000, 5011].forEach(function (d) {
      if (small && (d % 2000 || d === 4000) && d !== 5011) return;
      el("text", { x: x(d), y: axY, "text-anchor": d === 0 ? "start" : d === 5011 ? "end" : "middle", class: "axis" }, strip).textContent = d === 5011 ? "5,011 m" : fmt(d);
    });
    cornerList.textContent = "";
    cornerList.classList.toggle("chips", small);
    corners.forEach(function (c, i) {
      var li = document.createElement("li");
      if (!small) { li.style.left = x(c.d) + "px"; li.style.top = "4px"; }
      li.innerHTML = '<a href="#t' + c.n + '"><b>T' + c.n + "</b><span>" + (names[i] || "") + "</span></a>";
      cornerList.appendChild(li);
    });
    // Labels that would collide keep only the corner number.
    var prev = -1e9;
    if (small) return;
    Array.prototype.forEach.call(cornerList.children, function (li) {
      var r = li.getBoundingClientRect();
      if (r.left < prev + 6) li.querySelector("span").style.visibility = "hidden";
      else prev = r.right;
    });
  }

  // ── Scroll mapping: page position ↔ lap distance ────
  var lap = document.getElementById("lap"), spine = document.querySelector(".spine-svg");
  var readout = document.querySelector(".readout"), top = document.querySelector(".top");
  var anchors = [], behindClip = null, lane = 56, spineX = null, cur = null, curLine = null;

  function buildAnchors() {
    var base = lap.getBoundingClientRect().top + scrollY;
    anchors = [[0, 0]];
    document.querySelectorAll(".turn[data-corner]").forEach(function (sec) {
      var h = sec.querySelector("h2").getBoundingClientRect();
      anchors.push([h.top + scrollY - base + h.height / 2, C[+sec.dataset.corner]]);
    });
    anchors.push([lap.offsetHeight, L]);
  }
  function yToD(y) {
    for (var i = 1; i < anchors.length; i++) {
      if (y <= anchors[i][0]) { var a = anchors[i - 1], b = anchors[i]; return a[1] + (b[1] - a[1]) * Math.max(0, (y - a[0]) / (b[0] - a[0] || 1)); }
    }
    return L;
  }
  function dToY(d) {
    for (var i = 1; i < anchors.length; i++) {
      if (d <= anchors[i][1]) { var a = anchors[i - 1], b = anchors[i]; return a[0] + (b[0] - a[0]) * ((d - a[1]) / (b[1] - a[1] || 1)); }
    }
    return lap.offsetHeight;
  }

  function drawSpine() {
    if (!spine || getComputedStyle(spine.parentNode).display === "none") return;
    var Hh = lap.offsetHeight, W = spine.parentNode.clientWidth;
    lane = W >= 160 ? 56 : 40;
    spine.setAttribute("viewBox", "0 0 " + W + " " + Hh);
    spine.textContent = "";
    var x = function (v) { return 4 + ((v - VMIN) / (VMAX - VMIN)) * lane; };
    var d = "";
    T.forEach(function (p, i) { d += (i ? "L" : "M") + x(p[1]).toFixed(1) + " " + dToY(p[0]).toFixed(1); });
    var defs = el("defs", {}, spine), cp = el("clipPath", { id: "behind" }, defs);
    behindClip = el("rect", { x: 0, y: 0, width: W, height: 0 }, cp);
    el("path", { d: d, class: "ahead" }, spine);
    el("path", { d: d, class: "behind", "clip-path": "url(#behind)" }, spine);
    corners.forEach(function (c) {
      var cy = dToY(c.d);
      el("line", { x1: x(c.v) - 6, x2: x(c.v) + 6, y1: cy, y2: cy, class: "ctick" }, spine);
    });
    curLine = el("line", { class: "curline", x1: 0, x2: lane + 16, y1: 0, y2: 0 }, spine);
    cur = el("circle", { class: "cur", r: 5, cx: 0, cy: 0 }, spine);
    spineX = x;
    if (readout) { readout.style.marginLeft = (lane + 16) + "px"; readout.style.width = (W - lane - 32) + "px"; }
  }

  // Mini track map in the readout, and the phone lap bar.
  var mapPath = document.querySelector(".ro-track"), mapDot = document.querySelector(".ro-dot"), mapLen = 0;
  if (mapPath && LAP.map) {
    var pts = LAP.map.points, s = LAP.map.markers.finish || 0;
    var ring = pts.slice(s).concat(pts.slice(0, s + 1));
    mapPath.setAttribute("d", ring.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + p[1]; }).join(""));
    mapPath.parentNode.setAttribute("viewBox", "-60 -60 " + (LAP.map.w + 120) + " " + (LAP.map.h + 120));
    mapLen = mapPath.getTotalLength();
  }
  var barSvg = document.querySelector(".lapbar-trace");
  function drawBar() {
    if (!barSvg) return;
    barSvg.setAttribute("viewBox", "0 0 1000 100");
    barSvg.textContent = "";
    var d = "";
    T.forEach(function (p, i) { d += (i ? "L" : "M") + ((p[0] / L) * 1000).toFixed(1) + " " + (96 - ((p[1] - VMIN) / (VMAX - VMIN)) * 92).toFixed(1); });
    var defs = el("defs", {}, barSvg), cp = el("clipPath", { id: "barclip" }, defs);
    barSvg._clip = el("rect", { x: 0, y: 0, width: 0, height: 100 }, cp);
    el("path", { d: d, class: "ahead" }, barSvg);
    el("path", { d: d, class: "behind", "clip-path": "url(#barclip)" }, barSvg);
  }

  var ro = readout && {
    turn: readout.querySelector(".ro-turn"), dist: readout.querySelector(".ro-dist"),
    speed: readout.querySelector(".ro-speed b"), gear: readout.querySelector(".ro-gear"),
    thr: readout.querySelector(".thr"), brk: readout.querySelector(".brk")
  };
  var barCursor = document.querySelector(".lapbar-cursor"), barRead = document.querySelector(".lapbar-read");
  var lastKey = "";

  function turnAt(d) {
    if (d >= L - 1) return "Finish";
    var label = "Start";
    for (var i = 0; i < corners.length; i++) if (d >= corners[i].d - 60) label = "T" + corners[i].n;
    return label;
  }

  function update() {
    ticking = false;
    if (top) top.classList.toggle("scrolled", scrollY > 8);
    var lapRect = lap.getBoundingClientRect();
    var phone = !spine || getComputedStyle(spine.parentNode).display === "none";
    var cursorVY = phone ? innerHeight * 0.4 : (readout ? readout.getBoundingClientRect().top + 20 : innerHeight / 2);
    var yIn = cursorVY - lapRect.top;
    var d = Math.max(0, Math.min(L, yToD(Math.max(0, yIn))));
    var s = sample(d), turn = turnAt(d);
    if (top) top.classList.toggle("in-lap", phone && lapRect.top < innerHeight * 0.4 && lapRect.bottom > innerHeight * 0.4);
    var key = Math.round(d) + "|" + phone;
    if (key === lastKey) return;
    lastKey = key;
    if (!phone) {
      if (behindClip) behindClip.setAttribute("height", Math.max(0, Math.min(lap.offsetHeight, yIn)));
      if (cur && spineX) {
        var cy = Math.max(0, Math.min(lap.offsetHeight, yIn)).toFixed(1), cx = spineX(s[1]).toFixed(1);
        cur.setAttribute("cx", cx); cur.setAttribute("cy", cy);
        curLine.setAttribute("x1", cx); curLine.setAttribute("y1", cy); curLine.setAttribute("y2", cy);
      }
      if (ro) {
        ro.turn.textContent = turn;
        ro.dist.textContent = fmt(d) + " m";
        ro.speed.textContent = Math.round(s[1]);
        ro.gear.textContent = "Gear " + s[4];
        ro.thr.style.setProperty("--v", (s[2] / 100).toFixed(2));
        ro.brk.style.setProperty("--v", s[3] ? 1 : 0);
      }
      if (mapLen) {
        var pt = mapPath.getPointAtLength((d / L) * mapLen);
        mapDot.setAttribute("cx", pt.x.toFixed(1));
        mapDot.setAttribute("cy", pt.y.toFixed(1));
      }
    } else if (barSvg && barSvg._clip) {
      var f = d / L;
      barSvg._clip.setAttribute("width", (f * 1000).toFixed(1));
      var bw = barSvg.getBoundingClientRect();
      barCursor.style.transform = "translateX(" + (f * bw.width).toFixed(1) + "px)";
      barRead.innerHTML = "<b>" + turn + "</b> · " + Math.round(s[1]) + " km/h";
    }
  }

  var ticking = false;
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  function layout() {
    drawStrip();
    buildAnchors();
    drawSpine();
    drawBar();
    lastKey = "";
    update();
    first = false;
  }

  // Copy buttons on the setup commands.
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.parentNode.querySelector("code").textContent;
      var done = function () {
        btn.dataset.done = ""; btn.textContent = "Copied";
        setTimeout(function () { delete btn.dataset.done; btn.textContent = "Copy"; }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });

  var resizeTimer;
  addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
  addEventListener("scroll", onScroll, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout); else addEventListener("load", layout);
  addEventListener("load", function () { buildAnchors(); drawSpine(); lastKey = ""; update(); });
  layout();
})();
