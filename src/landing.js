function setTheme(mode) {

  document.body.classList.remove("theme-day", "theme-night", "theme-pink");
 
  document.body.classList.add("theme-" + mode);

  localStorage.setItem("theme", mode);
}

const saved = localStorage.getItem("theme");
setTheme(saved || "day");

document.getElementById("dayBtn")?.addEventListener("click",   () => setTheme("day"));
document.getElementById("nightBtn")?.addEventListener("click", () => setTheme("night"));
document.getElementById("pinkBtn")?.addEventListener("click",  () => setTheme("pink"));