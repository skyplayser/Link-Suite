// Day/night switch and the mobile menu. No tracking, no requests. The language switch is a plain link.
(function () {
  var root = document.documentElement;
  var de = root.lang === "de";

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
})();
