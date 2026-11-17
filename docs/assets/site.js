// Link-Suite website: start animation, scroll reveal, day/night switch and the mobile menu.
// No tracking, no requests. The language switch is a plain link.
(function () {
  var root = document.documentElement;
  var de = root.lang === "de";
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Day / night ---------- */
  var themeBtn = document.getElementById("theme");
  function label() {
    if (!themeBtn) return;
    var light = root.getAttribute("data-theme") === "light";
    themeBtn.textContent = light ? (de ? "☾ Nacht" : "☾ Night") : (de ? "☀ Tag" : "☀ Day");
    themeBtn.setAttribute("aria-label", light ? (de ? "Nachtmodus" : "Night mode") : (de ? "Tagmodus" : "Day mode"));
  }
  if (themeBtn) {
    label();
    themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("link-suite-theme", next); } catch (e) { /* private mode */ }
      label();
    });
  }

  /* ---------- Mobile menu ---------- */
  var menu = document.getElementById("menu"), nav = document.getElementById("nav");
  if (menu && nav) {
    menu.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target && e.target.tagName === "A") { nav.classList.remove("open"); menu.setAttribute("aria-expanded", "false"); }
    });
  }

  /* ---------- Scroll reveal and the tilted hero screenshot ---------- */
  function startReveal() {
    var items = document.querySelectorAll(".reveal");
    var shot = document.querySelector(".shot-wrap");
    if (calm || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
      if (shot) shot.classList.add("tilt-off");
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        // small stagger for cards that appear together
        var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
        el.style.transitionDelay = Math.min(sib, 5) * 70 + "ms";
        el.classList.add("in");
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
    if (shot) {
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.intersectionRatio > 0.35) { shot.classList.add("tilt-off"); io2.disconnect(); } });
      }, { threshold: [0, 0.35, 0.6] });
      setTimeout(function () { io2.observe(shot); }, 500);
    }
  }

  function ready() { root.classList.add("ready"); startReveal(); }

  /* ---------- Start animation: the same as in the Link-Suite app ----------
     Ported from src/renderer/intro/launcher-intro.ts (playLauncherIntro): same steps, times and curves. The suite sign
     appears, the program icons fan out into a row and fly to their places (here: the icon row in the hero), the sign
     glides into the logo top left and the name wipes in. FLIP: every image lies position:fixed at its TARGET; earlier
     poses are transforms relative to it. Only CSSOM and the Web Animations API (the page CSP allows no inline styles). */
  if (!root.classList.contains("intro-pending") || !document.body.animate || window.scrollY > 40) {
    root.classList.remove("intro-pending");
    requestAnimationFrame(ready);
    return;
  }

  var assets = (document.querySelector('link[rel="stylesheet"]').getAttribute("href") || "assets/site.css").replace("site.css", "");
  var layer = document.createElement("div");
  layer.className = "intro-layer";
  layer.setAttribute("aria-hidden", "true");
  var bg = document.createElement("div");
  bg.className = "ibg";
  layer.appendChild(bg);
  var skip = document.createElement("div");
  skip.className = "iskip";
  var kbd = document.createElement("kbd");
  kbd.textContent = de ? "Taste" : "key";
  skip.append(de ? "Überspringen: " : "Skip: ", kbd, de ? " oder Klick" : " or click");
  bg.appendChild(skip);
  document.body.appendChild(layer);

  // Page underneath is laid out and final (no entrance offsets) before the targets are measured
  root.classList.add("intro-run");
  root.classList.remove("intro-pending");
  root.classList.add("ready");

  var W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2;
  var k = Math.max(0.2, Math.min(W / 1000, H / 600, 1.4)); // stage 1000 × 600 like the template
  var anims = [];
  var seen = [];
  var T = [];
  function run(node, frames, delay, dur, easing) {
    var fill = seen.indexOf(node) >= 0 ? "forwards" : "both";
    seen.push(node);
    var a = node.animate(frames, { delay: delay, duration: dur, easing: easing || "cubic-bezier(.2,.8,.2,1)", fill: fill });
    anims.push(a);
    return a;
  }
  function put(src, cxL, cyL, w, h) {
    if (h === undefined) h = w;
    var i = new Image();
    i.src = src; i.alt = ""; i.decoding = "sync";
    i.style.left = (cxL - w / 2) + "px"; i.style.top = (cyL - h / 2) + "px"; i.style.width = w + "px"; i.style.height = h + "px";
    i._c = [cxL, cyL];
    layer.appendChild(i);
    return i;
  }
  function pose(i, x, y, s) { return "translate(" + (x - i._c[0]) + "px," + (y - i._c[1]) + "px) scale(" + (s === undefined ? 1 : s) + ")"; }

  var logoImg = Array.prototype.find.call(document.querySelectorAll("header.top .brand img"), function (i) { return i.getBoundingClientRect().width > 0; });
  var light = root.getAttribute("data-theme") === "light";

  function play() {
    // Logo target = visible <img> in the header. Sign inside the logo: viewBox −8 −6.5 591.54 106, sign x 0…108
    var R = logoImg.getBoundingClientRect();
    var sc = R.height / 106;
    var logo = put(assets + (light ? "logo-horizontal-on-light.svg" : "logo-horizontal-on-dark.svg"), R.left + R.width / 2, R.top + R.height / 2, R.width, R.height);
    var signClip = "inset(0 " + (100 - ((116 + 4) / 591.54) * 100) + "% 0 0)";
    // Suite sign (symbol.svg, viewBox −4 −4 116 98): target = place of the sign in the logo
    var SW = 150 * k;
    var symF = [R.left + (4 + 58) * sc, R.top + (4 + 49) * sc];
    var sym = put(assets + "symbol.svg", symF[0], symF[1], SW, (SW * 98) / 116);
    var symEnd = (116 * sc) / SW;

    if (calm) {
      // Reduce motion: no movement. Big logo in the middle fades in and out (~1 s), the page fades up.
      var big = put(assets + (light ? "logo-horizontal-on-light.svg" : "logo-horizontal-on-dark.svg"), cx, cy, (84 * R.width) / Math.max(1, R.height), 84);
      run(big, [{ opacity: 0 }, { opacity: 1 }], 0, 300, "ease-out");
      run(big, [{ opacity: 1 }, { opacity: 0 }], 800, 250, "ease-in");
      run(bg, [{ opacity: 1 }, { opacity: 0 }], 800, 250, "ease-out");
      return control(1050);
    }

    // 1 · 0–380 ms: the suite sign appears and grows a little
    run(sym, [{ opacity: 0, transform: pose(sym, cx, cy, 0.82) }, { opacity: 1, transform: pose(sym, cx, cy, 1) }], 0, 380, "cubic-bezier(.2,.7,.2,1)");
    // 2 · 320–840 ms: the sign moves up, the programs fan out into a row
    var up = cy - 96 * k;
    run(sym, [{ transform: pose(sym, cx, cy, 1) }, { transform: pose(sym, cx, up, 0.62) }], 320, 520);
    var head = document.querySelector("header.top").getBoundingClientRect();
    T = Array.prototype.map.call(document.querySelectorAll(".suite-row li"), function (card) {
      var icon = card.querySelector("img"), r = icon.getBoundingClientRect();
      var visible = r.width > 0 && r.bottom > head.bottom && r.top < innerHeight - 8 && r.right > 0 && r.left < innerWidth;
      return { card: card, icon: icon, src: icon.currentSrc || icon.src, visible: visible };
    });
    var n = T.length, F = 92 * k, G = 22 * k, rowY = cy + 70 * k;
    var rowW = n * F + Math.max(0, n - 1) * G, fit = Math.min(1, (W * 0.92) / Math.max(1, rowW));
    var FF = F * fit, GG = G * fit;
    var step = n > 1 ? Math.min(55, 420 / (n - 1)) : 55;
    var LAND = [];
    T.forEach(function (tg, i) {
      var x = cx - (n * FF + (n - 1) * GG) / 2 + FF / 2 + i * (FF + GG);
      var r = tg.visible ? tg.icon.getBoundingClientRect() : null;
      var L = r ? [r.left + r.width / 2, r.top + r.height / 2] : symF;
      var endS = r ? r.width / FF : 22 / FF;
      var fly = put(tg.src, L[0], L[1], FF);
      run(fly, [{ opacity: 0, transform: pose(fly, cx, up, 0.25) }, { opacity: 1, transform: pose(fly, x, rowY, 1) }], 380 + i * 45, 480);
      // 3 · from 1000 ms: flight to the target. x and y on different curves → a flat arc
      var d = 1000 + i * step, dur = 600, land = d + dur;
      run(fly, [{ transform: "translateY(" + (rowY - L[1]) + "px) scale(1)" }, { transform: "translateY(0px) scale(" + endS + ")" }], d, dur, "cubic-bezier(.6,0,.2,1)");
      anims.push(fly.animate([{ translate: (x - L[0]) + "px 0px" }, { translate: "0px 0px" }], { delay: d, duration: dur, easing: "cubic-bezier(.35,0,.15,1)", fill: "forwards" }));
      if (r) {
        // The target fades in while its icon lands; its own icon appears at the moment of landing (exactly on top)
        run(tg.card, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], land - 260, 260, "cubic-bezier(.2,.8,.2,1)");
        run(tg.icon, [{ opacity: 0 }, { opacity: 1 }], land, 1, "linear");
        run(fly, [{ opacity: 1 }, { opacity: 0 }], land + 34, 1, "linear");
      } else {
        run(fly, [{ opacity: 1 }, { opacity: 0 }], d + 280, 320, "ease-in");
        run(tg.card, [{ opacity: 0 }, { opacity: 1 }], 1250, 300, "ease-out");
      }
      LAND.push(land);
    });
    // The surface reveals the page (colour = --bg of the current mode: no jump in brightness, also by day)
    run(bg, [{ opacity: 1 }, { opacity: 0 }], 950, 450, "ease-out");
    // 4 · 1050–1670 ms: the sign glides to its place in the logo top left
    run(sym, [{ transform: pose(sym, cx, up, 0.62) }, { transform: pose(sym, symF[0], symF[1], symEnd) }], 1050, 620, "cubic-bezier(.55,0,.2,1)");
    // 5 · 1670–2140 ms: the logo takes over (logo in first, then sign out), the name wipes in from the left
    run(logo, [{ opacity: 0, clipPath: signClip }, { opacity: 1, clipPath: signClip }], 1670, 150, "linear");
    run(sym, [{ opacity: 1 }, { opacity: 0 }], 1780, 150, "linear");
    run(logo, [{ clipPath: signClip }, { clipPath: "inset(0 0% 0 0)" }], 1760, 380, "cubic-bezier(.3,.7,.2,1)");
    return control(Math.max.apply(null, [2140].concat(LAND)));
  }

  function control(total) {
    var done = false;
    function onKey(e) { if (!e.metaKey && !e.ctrlKey && e.key !== "Meta" && e.key !== "Control") finish(true); }
    function onResize() { finish(true); } // targets no longer match
    function finish(skipped) {
      if (done) return;
      done = true;
      removeEventListener("keydown", onKey);
      removeEventListener("resize", onResize);
      removeEventListener("wheel", onWheel);
      var cards = T.map(function (x) { return [x.card, Number(getComputedStyle(x.card).opacity)]; });
      anims.forEach(function (a) { a.cancel(); });
      root.classList.remove("intro-run");
      if (skipped) {
        layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
        cards.forEach(function (c) { if (c[1] < 1) c[0].animate([{ opacity: c[1] }, { opacity: 1 }], { duration: 150 }); });
        var brand = document.querySelector("header.top .brand");
        if (brand) brand.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
        setTimeout(function () { layer.remove(); }, 160);
      } else layer.remove(); // everything lies exactly on top: remove the layer, no jump
      startReveal();
    }
    function onWheel() { finish(true); }
    setTimeout(function () { finish(false); }, total);
    addEventListener("keydown", onKey);
    addEventListener("wheel", onWheel, { passive: true });
    layer.addEventListener("pointerdown", function () { finish(true); }, { once: true });
    addEventListener("resize", onResize);
  }

  // Start when the icons are decoded (at most 300 ms), like the app
  var imgs = Array.prototype.slice.call(document.querySelectorAll(".suite-row img"));
  if (logoImg) imgs.push(logoImg);
  var started = false;
  function go() { if (started) return; started = true; if (logoImg) play(); else { layer.remove(); root.classList.remove("intro-run"); startReveal(); } }
  Promise.all(imgs.map(function (i) { return i.decode ? i.decode().catch(function () {}) : null; })).then(go);
  setTimeout(go, 300);
})();
