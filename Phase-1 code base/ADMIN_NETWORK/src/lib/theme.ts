export type Theme = "dark" | "light" | "system";

export const THEME_KEY = "rv-theme";

// Runs in <head> before the page paints, so the panel never flashes the wrong colours.
export const THEME_BOOT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}")||"dark";var l=c==="light"||(c==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.dataset.theme=l?"light":"dark";}catch(e){}})();`;

const prefersLight = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;

export function storedTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const value = window.localStorage.getItem(THEME_KEY);
  return value === "light" || value === "system" ? value : "dark";
}

export function applyTheme(theme: Theme) {
  window.localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme === "light" || (theme === "system" && prefersLight()) ? "light" : "dark";
}

// With "system", follows the device when it switches between day and night.
export function followSystem(theme: Theme) {
  if (theme !== "system") return () => undefined;
  const query = window.matchMedia("(prefers-color-scheme: light)");
  const change = () => applyTheme("system");
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
