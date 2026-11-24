import { campaignName } from "../campaigns.js";
import { displayName } from "../schema.js";
import { CAMPAIGN_PAGES, CHARACTER_PAGES, VIEWS, routeHref } from "../views.js";
import { createPalette } from "../ui/commandPalette.js";
import { applyTheme } from "./theme.js";

export function initPalette(ctx) {
  const { store, router, actions, prefs, bus, els } = ctx;

  function getCommands() {
    const commands = VIEWS.map((view) => ({
      id: `go-${view.id}`,
      title: `Go to ${view.label}`,
      hint: view.shortcut,
      keywords: view.description,
      run: () => router.navigate(routeHref(view.id))
    }));

    commands.push({ id: "new-campaign", title: "New campaign", keywords: "create add game", run: () => actions.newCampaign() });
    commands.push({ id: "import", title: "Import a backup or bundle", keywords: "restore open zip file", run: () => ctx.bus.emit("import:choose") });
    commands.push({ id: "new-character", title: "New character", keywords: "create add", run: () => actions.newCharacter() });

    if (store.canUndo()) {
      commands.push({ id: "undo", title: "Undo", hint: "Ctrl+Z", run: () => store.undo() });
    }

    if (store.canRedo()) {
      commands.push({ id: "redo", title: "Redo", hint: "Ctrl+Shift+Z", run: () => store.redo() });
    }

    const next = prefs.get().theme === "dark" ? "light" : "dark";

    commands.push({
      id: "theme",
      title: `Switch to the ${next} theme`,
      keywords: "appearance colour",
      run: () => {
        prefs.update({ theme: next });
        applyTheme(next);
        bus.emit("theme:changed");
      }
    });

    commands.push({ id: "sidebar", title: "Show or hide navigation", keywords: "menu sidebar", run: () => bus.emit("sidebar:toggle") });

    commands.push({ id: "shortcuts", title: "Show keyboard shortcuts", hint: "?", run: () => bus.emit("shortcuts:open") });

    const route = router.current();

    if (route.view === "character" && store.getCharacter(route.id)) {
      for (const page of CHARACTER_PAGES) {
        commands.push({ id: `page-${page.id}`, title: `Open this character's ${page.label}`, keywords: "page tab", run: () => router.navigate(routeHref("character", route.id, page.id)) });
      }
    }

    if (route.view === "campaign" && store.getCampaign(route.id)) {
      for (const page of CAMPAIGN_PAGES) {
        commands.push({ id: `campaign-page-${page.id}`, title: `Open this campaign's ${page.label}`, keywords: "page tab", run: () => router.navigate(routeHref("campaign", route.id, page.id)) });
      }
    }

    for (const campaign of store.getState().campaigns) {
      commands.push({ id: `open-${campaign.id}`, title: `Open campaign: ${campaignName(campaign)}`, keywords: `${campaign.system} ${campaign.tags.join(" ")}`, run: () => router.navigate(routeHref("campaign", campaign.id)) });
    }

    for (const character of store.getState().characters) {
      commands.push({
        id: `open-${character.id}`,
        title: `Open character: ${displayName(character)}`,
        keywords: `${character.player} ${character.systemId} ${character.tags.join(" ")}`,
        run: () => router.navigate(routeHref("character", character.id))
      });
    }

    return commands;
  }

  const palette = createPalette({
    dialog: els.paletteDialog,
    input: document.querySelector("#palette-input"),
    list: document.querySelector("#palette-list"),
    empty: document.querySelector("#palette-empty"),
    getCommands
  });

  bus.on("palette:open", () => {
    if (!palette.isOpen()) {
      palette.open();
    }
  });
}
