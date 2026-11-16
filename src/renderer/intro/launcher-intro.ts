// Startanimation des Launchers (Design 0.3, die UI-Unterlagen (außerhalb des Repos) Teil 2). Anfang wie die gemeinsame Vorlage
// (Link-Suite/Konzepte/_Startanimation, ?app=suite), Ende neu: Die Programm-Icons fliegen in ihre Karten, das
// Suite-Zeichen gleitet ins Logo oben links. Übertragen aus dem Prototyp design/intro-launcher.html (playLauncherIntro).
// FLIP: Jedes Bild liegt position:fixed an seinem ZIEL; frühere Lagen sind Transforms relativ dazu. Nur transform,
// translate, opacity und clip-path (Compositor), alles über CSSOM/WAAPI (CSP ohne style-Attribute).

export interface IntroTarget { id: string; card: HTMLElement; icon: HTMLImageElement; src: string; visible: boolean }

export interface IntroOptions {
  layer: HTMLElement;
  logoBox: () => DOMRect;
  targets: () => IntroTarget[];
  symbolSrc: string;
  logoSrc: string;
  speed?: number;
  reduced?: boolean;
  holdAt?: number | null;
  text: (k: string) => string;
}

type Placed = HTMLImageElement & { _c: [number, number] };

export function playLauncherIntro(o: IntroOptions): { finish(skipped: boolean): void } {
  const { layer, logoBox, targets, symbolSrc, logoSrc, speed = 1, reduced = false, holdAt = null, text } = o;
  const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2;
  const k = Math.max(0.2, Math.min(W / 1000, H / 600, 1.4)); // Bühne 1000 × 600 wie die Vorlage
  const anims: Animation[] = [];
  const seen = new Set<Element>();
  let T: IntroTarget[] = [];
  const run = (node: Element, frames: Keyframe[], delay: number, dur: number, easing = "cubic-bezier(.2,.8,.2,1)") => {
    const fill: FillMode = seen.has(node) ? "forwards" : "both";
    seen.add(node);
    const a = node.animate(frames, { delay: delay / speed, duration: dur / speed, easing, fill });
    anims.push(a);
    return a;
  };
  // Ein Bild liegt fest an seinem ZIEL (Last). Alles davor ist ein Transform relativ dazu (Invert + Play).
  const put = (src: string, cxL: number, cyL: number, w: number, h = w): Placed => {
    const i = new Image() as Placed;
    i.src = src; i.alt = ""; i.decoding = "sync";
    i.style.left = `${cxL - w / 2}px`; i.style.top = `${cyL - h / 2}px`; i.style.width = `${w}px`; i.style.height = `${h}px`;
    i._c = [cxL, cyL];
    layer.append(i);
    return i;
  };
  const pose = (i: Placed, x: number, y: number, s = 1) => `translate(${x - i._c[0]}px,${y - i._c[1]}px) scale(${s})`;

  // Fläche: vorhandene .ibg (liegt seit dem Laden deckend da) oder neu
  let bg = layer.querySelector<HTMLElement>(".ibg");
  if (!bg) { bg = document.createElement("div"); bg.className = "ibg"; layer.append(bg); }
  const skip = document.createElement("div");
  skip.className = "skip";
  const kbd = document.createElement("kbd");
  kbd.textContent = text("intro.key");
  skip.append(text("intro.skip") + " ", kbd, " " + text("intro.or"));
  bg.append(skip);
  layer.hidden = false;
  document.documentElement.classList.add("intro-run");

  // Ziel des Logos = sichtbares <img> in #top-logo. Zeichen im Logo: viewBox −8 −6.5 591.54 106, Zeichen x 0…108
  const R = logoBox();
  const sc = R.height / 106;
  const logo = put(logoSrc, R.left + R.width / 2, R.top + R.height / 2, R.width, R.height);
  const signClip = `inset(0 ${100 - ((116 + 4) / 591.54) * 100}% 0 0)`; // nur das Zeichen
  // Suite-Zeichen (symbol.svg, viewBox −4 −4 116 98): Ziel = Lage des Zeichens im Logo
  const SW = 150 * k; // Bühnengröße: scharf, wird nur verkleinert
  const symF: [number, number] = [R.left + (4 + 58) * sc, R.top + (4 + 49) * sc];
  const sym = put(symbolSrc, symF[0], symF[1], SW, (SW * 98) / 116);
  const symEnd = (116 * sc) / SW;

  if (reduced) {
    // Bewegung reduzieren: keine Bewegung. Logo groß in der Mitte blendet ein und aus (~1 s), Oberfläche blendet auf.
    const big = put(logoSrc, cx, cy, (84 * R.width) / Math.max(1, R.height), 84);
    run(big, [{ opacity: 0 }, { opacity: 1 }], 0, 300, "ease-out");
    run(big, [{ opacity: 1 }, { opacity: 0 }], 800, 250, "ease-in");
    run(bg, [{ opacity: 1 }, { opacity: 0 }], 800, 250, "ease-out");
    return control(anims, 1050);
  }

  // 1 · 0–380 ms: Suite-Zeichen erscheint und wächst leicht
  run(sym, [{ opacity: 0, transform: pose(sym, cx, cy, 0.82) }, { opacity: 1, transform: pose(sym, cx, cy, 1) }], 0, 380, "cubic-bezier(.2,.7,.2,1)");
  // 2 · 320–840 ms: Zeichen rückt nach oben, die Programme fächern sich zu einer Reihe auf (Reihenfolge = Karten im DOM)
  const up = cy - 96 * k;
  run(sym, [{ transform: pose(sym, cx, cy, 1) }, { transform: pose(sym, cx, up, 0.62) }], 320, 520);
  T = targets();
  const n = T.length, F = 92 * k, G = 22 * k, rowY = cy + 70 * k;
  const rowW = n * F + Math.max(0, n - 1) * G, fit = Math.min(1, (W * 0.92) / Math.max(1, rowW));
  const FF = F * fit, GG = G * fit;
  const step = n > 1 ? Math.min(55, 420 / (n - 1)) : 55; // mehr Karten: Abstand begrenzen
  const LAND: number[] = [];
  T.forEach((tg, i) => {
    const x = cx - (n * FF + (n - 1) * GG) / 2 + FF / 2 + i * (FF + GG);
    const r = tg.visible ? tg.icon.getBoundingClientRect() : null;
    const L: [number, number] = r ? [r.left + r.width / 2, r.top + r.height / 2] : symF; // Rückfall: zurück ins Zeichen
    const endS = r ? r.width / FF : 22 / FF;
    const fly = put(tg.src, L[0], L[1], FF);
    run(fly, [{ opacity: 0, transform: pose(fly, cx, up, 0.25) }, { opacity: 1, transform: pose(fly, x, rowY, 1) }], 380 + i * 45, 480);
    // 3 · ab 1000 ms: Flug ins Ziel. x und y mit verschiedenen Kurven → flacher Bogen
    const d = 1000 + i * step, dur = 600, land = d + dur;
    run(fly, [{ transform: `translateY(${rowY - L[1]}px) scale(1)` }, { transform: `translateY(0px) scale(${endS})` }], d, dur, "cubic-bezier(.6,0,.2,1)");
    anims.push(fly.animate([{ translate: `${x - L[0]}px 0px` }, { translate: "0px 0px" }], { delay: d / speed, duration: dur / speed, easing: "cubic-bezier(.35,0,.15,1)", fill: "forwards" }));
    if (r) {
      // Karte blendet ein, während ihr Icon landet; ihr eigenes Icon erscheint im Moment der Landung (deckungsgleich)
      run(tg.card, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], land - 260, 260, "cubic-bezier(.2,.8,.2,1)");
      run(tg.icon, [{ opacity: 0 }, { opacity: 1 }], land, 1, "linear");
      run(fly, [{ opacity: 1 }, { opacity: 0 }], land + 34, 1, "linear");
    } else {
      run(fly, [{ opacity: 1 }, { opacity: 0 }], d + 280, 320, "ease-in");
      run(tg.card, [{ opacity: 0 }, { opacity: 1 }], 1250, 300, "ease-out");
    }
    LAND.push(land);
  });
  // Fläche gibt die Oberfläche frei (Farbe = --bg des aktuellen Modus: kein Helligkeitssprung, auch am Tag)
  run(bg, [{ opacity: 1 }, { opacity: 0 }], 950, 450, "ease-out");
  // 4 · 1050–1670 ms: Zeichen gleitet an seinen Platz im Logo oben links
  run(sym, [{ transform: pose(sym, cx, up, 0.62) }, { transform: pose(sym, symF[0], symF[1], symEnd) }], 1050, 620, "cubic-bezier(.55,0,.2,1)");
  // 5 · 1670–2140 ms: Logo übernimmt (erst Logo ein, dann Zeichen aus), Name wischt von links herein
  run(logo, [{ opacity: 0, clipPath: signClip }, { opacity: 1, clipPath: signClip }], 1670, 150, "linear");
  run(sym, [{ opacity: 1 }, { opacity: 0 }], 1780, 150, "linear");
  run(logo, [{ clipPath: signClip }, { clipPath: "inset(0 0% 0 0)" }], 1760, 380, "cubic-bezier(.3,.7,.2,1)");
  return control(anims, Math.max(2140, ...LAND));

  function control(list: Animation[], total: number): { finish(skipped: boolean): void } {
    let done = false;
    const onKey = (e: KeyboardEvent) => { if (!e.metaKey && !e.ctrlKey) finish(true); };
    const onResize = () => finish(true); // Ziele stimmen nicht mehr
    const finish = (skipped: boolean) => {
      if (done) return;
      done = true;
      removeEventListener("keydown", onKey);
      removeEventListener("resize", onResize);
      // Stand der Karten merken, dann alle Animationen weg, Rest in 150 ms weich nachziehen (nie hart schneiden)
      const cards = T.map(x => [x.card, Number(getComputedStyle(x.card).opacity)] as const);
      list.forEach(a => a.cancel());
      document.documentElement.classList.remove("intro-run");
      if (skipped) {
        layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
        for (const [c, op] of cards) if (op < 1) c.animate([{ opacity: op }, { opacity: 1 }], { duration: 150 });
        document.getElementById("top-logo")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
        setTimeout(() => layer.remove(), 160);
      } else layer.remove(); // alles liegt deckungsgleich: Schicht weg, kein Sprung
      dispatchEvent(new CustomEvent("linksuite-intro-done", { detail: { app: "suite", skipped } }));
    };
    if (holdAt !== null) {
      list.forEach(a => { a.pause(); a.currentTime = holdAt / speed; });
      skip.remove();
      return { finish };
    }
    setTimeout(() => finish(false), total / speed);
    addEventListener("keydown", onKey);
    layer.addEventListener("pointerdown", () => finish(true), { once: true });
    addEventListener("resize", onResize);
    return { finish };
  }
}
