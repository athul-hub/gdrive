(() => {
  const toggle = document.querySelector("#menuToggle");
  const nav = document.querySelector("#mainNav");
  if (!toggle || !nav) return;
  const close = () => {
    nav.classList.remove("open");
    toggle.classList.remove("active");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation menu");
  };
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.classList.toggle("active", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  });
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
  document.addEventListener("click", e => {
    if (nav.classList.contains("open") && !nav.contains(e.target) && !toggle.contains(e.target)) close();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  window.addEventListener("resize", () => { if (innerWidth > 760) close(); });
})();
