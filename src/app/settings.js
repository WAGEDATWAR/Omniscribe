import { mountSettingsPage } from "../ui/settings.js";
import { applyTheme } from "./theme.js";

export function initSettings(ctx) {
  const { router, prefs, bus } = ctx;

  const view = mountSettingsPage(document.querySelector("#page-settings"), {
    onTheme(theme) {
      prefs.update({ theme });
      applyTheme(theme);
    },
    onShortcuts: () => bus.emit("shortcuts:open")
  });

  function render() {
    view.render({ theme: prefs.get().theme, version: ctx.version });
  }

  bus.on("theme:changed", render);

  router.onRoute((route) => {
    if (route.view === "settings") {
      render();
    }
  });
}
