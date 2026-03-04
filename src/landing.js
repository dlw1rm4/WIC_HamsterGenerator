document.getElementById("dayBtn")?.addEventListener("click",   () => setTheme("day"));
document.getElementById("nightBtn")?.addEventListener("click", () => setTheme("night"));
document.getElementById("pinkBtn")?.addEventListener("click",  () => setTheme("pink"));

const saved = localStorage.getItem("theme");
const text = "Welcome user!";
const welcomeEl = document.getElementById("dynamic-text");
const typingSpeed = 100;
const pause = 1200;
let index = 0;
let typingStatus = true;


function setTheme(mode) {

  document.body.classList.remove("theme-day", "theme-night", "theme-pink");
 
  document.body.classList.add("theme-" + mode);

  localStorage.setItem("theme", mode);
}

function typeLoop() {
  if (!welcomeEl) return; // Safety check

  if (typingStatus) {
    welcomeEl.textContent = text.slice(0, index + 1);
    index++;

    if (index === text.length) {
      setTimeout(() => (typingStatus = false), pause);
    }
  } else { // Deleting status
    welcomeEl.textContent = text.slice(0, index - 1);
    index--;

    if (index === 0) {
      typingStatus = true;
    }
  }

  setTimeout(typeLoop, typingSpeed);
}

setTheme(saved || "day");
typeLoop();