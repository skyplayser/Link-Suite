// Loaded in <head> before the page is drawn: day or night from the saved choice, otherwise from the system.
// Also decides whether the start animation plays (on every load without a #section link; with "reduce motion" only a short fade).
// Only stored in this browser (localStorage), never sent anywhere.
(function () {
  var root = document.documentElement;
  var t = null;
  try { t = localStorage.getItem("link-suite-theme"); } catch (e) { /* private mode */ }
  if (t !== "light" && t !== "dark") {
    t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  root.setAttribute("data-theme", t);
  root.classList.add("js");

  if (!location.hash && !root.hasAttribute("data-no-intro")) {
    root.classList.add("intro-pending");
    // Every load starts at the top, so the animation can land in the hero (also after reload)
    try { history.scrollRestoration = "manual"; } catch (e) { /* old browsers */ }
    window.scrollTo(0, 0);
    // Safety net: never leave the page hidden if the animation cannot run.
    setTimeout(function () { root.classList.remove("intro-pending"); root.classList.add("ready"); }, 7000);
  }
})();
