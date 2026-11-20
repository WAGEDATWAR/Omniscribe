import { THEMES } from "../settings.js";
import { button, h, pageHeader, replace, section } from "./dom.js";

const THEME_LABELS = { dark: "Dark", light: "Light" };

export function mountSettingsPage(root, handlers) {
  const themeGroup = h("div", { class: "radio-group" });

  const appearance = section(
    { id: "settings-appearance", title: "Appearance", description: "Dark is the default; light is opt-in." },
    h("fieldset", { class: "fieldset" }, h("legend", { class: "field-label", text: "Theme" }), themeGroup)
  );

  const about = h("dl", { class: "facts" });

  replace(
    root,
    pageHeader({ title: "Settings", subtitle: "Appearance, shortcuts and about.", titleId: "settings-title" }),
    h(
      "div",
      { class: "stack" },
      appearance,
      section(
        { id: "settings-keyboard", title: "Keyboard" },
        button({ id: "shortcuts-btn", label: "Show keyboard shortcuts", onclick: handlers.onShortcuts })
      ),
      section({ id: "settings-about", title: "About" }, about)
    )
  );

  return {
    render({ theme, version }) {
      replace(
        themeGroup,
        THEMES.map((value) => h(
          "label",
          { class: "radio" },
          h("input", {
            type: "radio",
            name: "theme",
            value,
            checked: value === theme,
            onchange: () => handlers.onTheme(value)
          }),
          h("span", { text: THEME_LABELS[value] })
        ))
      );

      replace(
        about,
        h("dt", { text: "Version" }),
        h("dd", { id: "about-version", text: version }),
        h("dt", { text: "Stage" }),
        h("dd", { text: "Characters and PDFs (P1). A library, portraits, PDF sheets and local storage; value sheets, dice and campaigns are planned." }),
        h("dt", { text: "Privacy" }),
        h("dd", { text: "No account and nothing leaves this device." })
      );
    }
  };
}
