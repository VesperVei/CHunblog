export function createThemeScript(themeColorConfig: unknown) {
  const serializedThemeColorConfig = JSON.stringify(themeColorConfig);

  return `
(function () {
  const defaultTheme = document.documentElement.getAttribute("data-theme");

  if (defaultTheme) {
    document.documentElement.setAttribute("data-default-theme", defaultTheme);
  }

  const storedTheme = localStorage.getItem("theme");

  if (storedTheme && storedTheme !== "system") {
    document.documentElement.setAttribute("data-theme", storedTheme);
  } else if (defaultTheme && storedTheme !== "system") {
    document.documentElement.setAttribute("data-theme", defaultTheme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  window.defaultTheme = defaultTheme;
})();

const THEME_COLOR_CONFIG = ${serializedThemeColorConfig};
const THEME_COLOR_MODE = THEME_COLOR_CONFIG.mode;
const HUE_STORAGE_KEY = "custom-theme-hue";
const HSL_STORAGE_KEY = "custom-theme-hsl";

function isDarkThemeActive() {
  const explicitTheme = document.documentElement.getAttribute("data-theme");
  if (explicitTheme === "dark") return true;
  if (explicitTheme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyAccentColor(color, extraVars = {}) {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--accent-color", color);

  Object.entries(extraVars).forEach(([key, value]) => {
    rootStyle.setProperty(key, String(value));
  });
}

function applyHueAccent(hue) {
  const isDark = isDarkThemeActive();
  const lightness = isDark ? 65 : 45;
  const accentColor = 'hsl(' + hue + ', 80%, ' + lightness + '%)';

  applyAccentColor(accentColor, {
    "--accent-h": hue,
    "--accent-s": "80%",
    "--accent-l": lightness + '%',
    "--hue": hue,
  });
}

function applyHslAccent(h, s, l) {
  const accentColor = 'hsl(' + h + ', ' + s + '%, ' + l + '%)';

  applyAccentColor(accentColor, {
    "--accent-h": h,
    "--accent-s": s + '%',
    "--accent-l": l + '%',
    "--hue": h,
  });
}

function applyFixedAccent(color) {
  applyAccentColor(color);
}

function applyAccentFromState() {
  if (THEME_COLOR_MODE === "fixed") {
    applyFixedAccent(THEME_COLOR_CONFIG.color);
    return;
  }

  if (THEME_COLOR_MODE === "hsl") {
    const storedValue = localStorage.getItem(HSL_STORAGE_KEY);
    const values = storedValue ? JSON.parse(storedValue) : THEME_COLOR_CONFIG.hsl;
    applyHslAccent(values.h, values.s, values.l);
    return;
  }

  const hue = localStorage.getItem(HUE_STORAGE_KEY) || String(THEME_COLOR_CONFIG.hue);
  applyHueAccent(hue);
}

function setTheme(theme, saveToLocalStorage = false) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }

  if (saveToLocalStorage) {
    localStorage.setItem("theme", theme);
  } else {
    localStorage.removeItem("theme");
  }

  updateIconClass(theme);
  updateActiveButton(theme);
  applyAccentFromState();
}

function resetTheme() {
  setTheme(window.defaultTheme || "system");
}

function switchTheme(theme) {
  if (theme === "system") {
    resetTheme();
  } else {
    setTheme(theme, true);
  }
}

function updateIconClass(theme) {
  const iconElement = document.getElementById("theme-current-icon");
  if (!iconElement) return;

  const iconName = theme === "light"
    ? "sun"
    : theme === "dark"
      ? "moon"
      : "desktop";

  iconElement.style.setProperty("--icon-url", 'url("/icons/phosphor/' + iconName + '.svg")');
}

function updateActiveButton(theme) {
  document.querySelectorAll('#theme-switcher button').forEach((button) => {
    button.classList.remove('active');
  });

  const activeButton = document.querySelector('#theme-' + theme);
  if (activeButton) {
    activeButton.classList.add('active');
  }
}

function initHueControls() {
  const slider = document.getElementById("colorSlider");
  const output = document.getElementById("range-value");
  const resetBtn = document.getElementById("reset-color");
  const defaultHue = String(THEME_COLOR_CONFIG.hue);
  const savedHue = localStorage.getItem(HUE_STORAGE_KEY) || defaultHue;

  function updateResetBtnVisibility(hue) {
    if (!resetBtn) return;
    resetBtn.querySelector('i').style.visibility = String(hue) === defaultHue ? "hidden" : "visible";
  }

  if (slider && output) {
    slider.value = savedHue;
    output.textContent = savedHue;
    updateResetBtnVisibility(savedHue);
  }

  slider?.addEventListener("input", function() {
    if (!output) return;

    const currentHue = this.value;
    output.textContent = currentHue;
    applyHueAccent(currentHue);
    localStorage.setItem(HUE_STORAGE_KEY, currentHue);
    updateResetBtnVisibility(currentHue);
  });

  resetBtn?.addEventListener("click", function() {
    localStorage.removeItem(HUE_STORAGE_KEY);

    if (slider && output) {
      slider.value = defaultHue;
      output.textContent = defaultHue;
    }

    applyHueAccent(defaultHue);
    updateResetBtnVisibility(defaultHue);
  });

  applyHueAccent(savedHue);
}

function initHslControls() {
  const sliders = {
    h: document.getElementById("range-h"),
    s: document.getElementById("range-s"),
    l: document.getElementById("range-l"),
  };
  const outputs = {
    h: document.getElementById("range-h-value"),
    s: document.getElementById("range-s-value"),
    l: document.getElementById("range-l-value"),
  };
  const resetBtn = document.getElementById("reset-color");
  const defaults = THEME_COLOR_CONFIG.hsl;
  const storedValue = localStorage.getItem(HSL_STORAGE_KEY);
  const saved = storedValue ? JSON.parse(storedValue) : defaults;

  function currentValues() {
    return {
      h: Number(sliders.h?.value ?? defaults.h),
      s: Number(sliders.s?.value ?? defaults.s),
      l: Number(sliders.l?.value ?? defaults.l),
    };
  }

  function updateOutputs(values) {
    if (outputs.h) outputs.h.textContent = String(values.h);
    if (outputs.s) outputs.s.textContent = String(values.s) + '%';
    if (outputs.l) outputs.l.textContent = String(values.l) + '%';
  }

  function syncControls(values) {
    if (sliders.h) sliders.h.value = String(values.h);
    if (sliders.s) sliders.s.value = String(values.s);
    if (sliders.l) sliders.l.value = String(values.l);
    updateOutputs(values);
  }

  function updateResetBtnVisibility(values) {
    if (!resetBtn) return;

    const isDefault = values.h === defaults.h && values.s === defaults.s && values.l === defaults.l;
    resetBtn.querySelector('i').style.visibility = isDefault ? "hidden" : "visible";
  }

  function updateAccentColor() {
    const values = currentValues();
    updateOutputs(values);
    applyHslAccent(values.h, values.s, values.l);
    localStorage.setItem(HSL_STORAGE_KEY, JSON.stringify(values));
    updateResetBtnVisibility(values);
  }

  syncControls(saved);
  applyHslAccent(saved.h, saved.s, saved.l);
  updateResetBtnVisibility(saved);

  Object.values(sliders).forEach((slider) => {
    slider?.addEventListener("input", updateAccentColor);
  });

  resetBtn?.addEventListener("click", function() {
    localStorage.removeItem(HSL_STORAGE_KEY);
    syncControls(defaults);
    applyHslAccent(defaults.h, defaults.s, defaults.l);
    updateResetBtnVisibility(defaults);
  });
}

function initThemeControls() {
  document.getElementById("theme-light")?.addEventListener("click", function () {
    switchTheme("light");
  });
  document.getElementById("theme-dark")?.addEventListener("click", function () {
    switchTheme("dark");
  });
  document.getElementById("theme-system")?.addEventListener("click", function () {
    switchTheme("system");
  });

  const currentTheme = localStorage.getItem("theme") || window.defaultTheme || "system";
  updateIconClass(currentTheme);
  updateActiveButton(currentTheme);
  window.switchTheme = switchTheme;

  if (THEME_COLOR_MODE === "fixed") {
    localStorage.removeItem(HUE_STORAGE_KEY);
    localStorage.removeItem(HSL_STORAGE_KEY);
    applyFixedAccent(THEME_COLOR_CONFIG.color);
    return;
  }

  if (THEME_COLOR_MODE === "hsl") {
    localStorage.removeItem(HUE_STORAGE_KEY);
    initHslControls();
  } else {
    localStorage.removeItem(HSL_STORAGE_KEY);
    initHueControls();
  }

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (!document.documentElement.getAttribute("data-theme")) {
      applyAccentFromState();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initThemeControls, { once: true });
} else {
  initThemeControls();
}
`;
}
