const THEME_COLORS = { dark: "#0b0d12", light: "#f6f7fa" };

export function applyTheme(theme, doc = document) {
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme] ?? THEME_COLORS.dark);
}
