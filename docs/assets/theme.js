// Loaded in <head> before the page is drawn: day or night from the saved choice, otherwise from the system.
// Only stored in this browser (localStorage), never sent anywhere.
(function () {
  var t = null;
  try { t = localStorage.getItem("link-suite-theme"); } catch (e) { /* private mode */ }
  if (t !== "light" && t !== "dark") {
    t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.setAttribute("data-theme", t);
})();
