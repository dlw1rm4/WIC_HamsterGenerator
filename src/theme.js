const radios = document.querySelectorAll('input[name="theme"]');

const BG_POS = {
  day: '20%',
  night: '50%',
  pink: '80%',
};

function applyThemeGlobal(theme){
  if (!theme) return;
  localStorage.setItem("theme", theme);
  document.body.classList.remove("theme-day","theme-night","theme-pink");
  document.body.classList.add(`theme-${theme}`);
  document.body.classList.add('has-background');
  const pos = BG_POS[theme] || '50%';
  document.body.style.setProperty('--bg-x', pos);
  const radio = document.getElementById(theme);
  if (radio) radio.checked = true;
}

// expose globally so other scripts can call it
window.applyThemeGlobal = applyThemeGlobal;

const savedTheme = localStorage.getItem("theme");
if(savedTheme){
  applyThemeGlobal(savedTheme);
}

radios.forEach(radio => {
  radio.addEventListener("change", () => {
    const theme = radio.value || radio.id;
    applyThemeGlobal(theme);
  });
});
