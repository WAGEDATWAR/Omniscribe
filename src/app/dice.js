import { checkExpression } from "../dice/presets.js";
import { explain } from "../dice/explain.js";
import { displayName } from "../schema.js";
import { mountDicePage } from "../ui/dice.js";

/** The dice table: the roller, saved rolls for the chosen character, and the roll log. */
export function initDice(ctx) {
  const { store, router, toast, confirm } = ctx;
  const { rolling } = ctx;
  let characterId = null;

  const view = mountDicePage(document.querySelector("#page-dice"), {
    onCheck: (text) => checkExpression(text),
    async onRoll({ expression, adv, dis }) {
      const result = await rolling.roll(expression, { characterId, options: { adv, dis } });

      if (result.ok) {
        view.renderResults([result]);
      } else {
        view.renderError(result.error.message);
      }
    },
    async onPreset(id) {
      const preset = rolling.findPreset(characterId, id);

      if (!preset) {
        return;
      }

      const results = await rolling.fire(preset, { characterId, options: view.mode() });
      const good = results.filter((result) => result.ok);

      if (good.length) {
        view.renderResults(good);
      }

      const bad = results.find((result) => !result.ok);

      if (bad) {
        view.renderError(bad.error.message);
      }
    },
    async onAgain(id) {
      const old = rolling.log.get(id);

      if (!old) {
        return;
      }

      const result = await rolling.roll(old.expression, { characterId: old.characterId, label: old.label, groupId: null });

      if (result.ok) {
        view.renderResults([result]);
      } else {
        view.renderError(result.error.message);
      }
    },
    async onClear() {
      const { everyone } = view.filter();
      const scope = !everyone && characterId ? characterId : null;
      const name = scope ? displayName(store.getCharacter(scope) ?? { name: "" }) : null;

      if (!await confirm({
        heading: scope ? `Clear the rolls for ${name}?` : "Clear the whole roll log?",
        body: "You can undo this until you close the app.",
        confirmLabel: "Clear log"
      })) {
        return;
      }

      const removed = await rolling.log.clear({ characterId: scope });
      toast(`Cleared ${removed} roll${removed === 1 ? "" : "s"}.`, { action: { label: "Undo", run: () => rolling.log.undoClear() } });
    },
    onScope(next) {
      if (next !== undefined) {
        characterId = next;
        renderCharacterParts();
      }

      renderLog();
    }
  });

  function characterOptions() {
    return store.getState().characters.map((character) => ({ id: character.id, label: displayName(character) }));
  }

  function renderCharacterParts() {
    const groups = [];
    const own = rolling.characterRolls(characterId);
    const system = rolling.systemRolls(characterId);

    if (own.length) {
      groups.push({ title: "This character", items: own });
    }

    const byGroup = new Map();

    for (const roll of system) {
      const key = roll.group || "System rolls";
      byGroup.set(key, [...(byGroup.get(key) ?? []), roll]);
    }

    for (const [title, items] of byGroup) {
      groups.push({ title, items });
    }

    view.renderPresets(groups);
  }

  function renderLog() {
    const { search, everyone } = view.filter();
    const scoped = Boolean(characterId) && !everyone;
    const names = new Map(store.getState().characters.map((character) => [character.id, displayName(character)]));
    const rolls = rolling.log.list({ characterId: scoped ? characterId : null, search }).map((roll) => ({
      roll,
      text: explain(roll),
      who: roll.characterId ? names.get(roll.characterId) ?? "Removed character" : ""
    }));

    view.renderLog(rolls, { scoped });
  }

  function renderAll() {
    if (characterId && !store.getCharacter(characterId)) {
      characterId = null;
    }

    view.renderCharacters(characterOptions(), characterId);
    renderCharacterParts();
    renderLog();
  }

  rolling.log.subscribe(() => {
    if (router.current().view === "dice") {
      renderLog();
    }
  });

  router.onRoute((route) => {
    if (route.view === "dice") {
      renderAll();
    }
  });
}
