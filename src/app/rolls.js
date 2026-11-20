import { PRESET_LIMITS, buildPreset } from "../dice/presets.js";
import { explain } from "../dice/explain.js";
import { mountRollsPage } from "../ui/rolls.js";

/** A character's Rolls page: their saved rolls and macros, system rolls and recent rolls. */
export function initRolls(ctx) {
  const { store, router, toast, rolling } = ctx;

  function currentId() {
    const route = router.current();
    return route.view === "character" && route.sub === "rolls" ? route.id : null;
  }

  function presets() {
    return store.getCharacter(currentId())?.rollPresets ?? [];
  }

  function setPresets(next, key) {
    store.updateCharacter(currentId(), { rollPresets: next }, { key: key ? `${currentId()}:${key}` : null });
  }

  function showResults(results) {
    const good = results.filter((result) => result.ok);

    if (good.length) {
      view.renderResults(good);
    }

    const bad = results.find((result) => !result.ok);

    if (bad) {
      view.renderError(bad.error.message);
    }
  }

  const view = mountRollsPage(document.querySelector("#character-rolls"), {
    onSave(fields, editingId) {
      const verdict = buildPreset({ ...fields, id: editingId ?? undefined });

      if (!verdict.ok) {
        return verdict;
      }

      const list = presets();

      if (editingId) {
        setPresets(list.map((preset) => (preset.id === editingId ? verdict.preset : preset)));
      } else if (list.length >= PRESET_LIMITS.perCharacter) {
        return { ok: false, reason: `A character can keep ${PRESET_LIMITS.perCharacter} saved rolls` };
      } else {
        setPresets([...list, verdict.preset]);
      }

      toast(`Saved ${verdict.preset.label}.`);
      return verdict;
    },
    onDelete(id) {
      const before = presets();
      const removed = before.find((preset) => preset.id === id);

      if (!removed) {
        return;
      }

      const characterId = currentId();
      setPresets(before.filter((preset) => preset.id !== id));
      toast(`Deleted ${removed.label}.`, { action: { label: "Undo", run: () => store.updateCharacter(characterId, { rollPresets: before }) } });
    },
    onMove(id, delta) {
      const list = [...presets()];
      const from = list.findIndex((preset) => preset.id === id);
      const to = from + delta;

      if (from < 0 || to < 0 || to >= list.length) {
        return;
      }

      [list[from], list[to]] = [list[to], list[from]];
      setPresets(list);
    },
    async onRoll(key) {
      const preset = rolling.findPreset(currentId(), key.includes(":") ? key : `preset:${key}`);

      if (preset) {
        showResults(await rolling.fire(preset, { characterId: currentId() }));
      }
    },
    async onAgain(id) {
      const old = rolling.log.get(id);

      if (old) {
        showResults([await rolling.roll(old.expression, { characterId: old.characterId, label: old.label })]);
      }
    }
  });

  function render() {
    const id = currentId();
    const character = id ? store.getCharacter(id) : null;

    if (!character) {
      return;
    }

    view.renderOwn(character.rollPresets);
    view.renderSystem(rolling.systemRolls(id), { hasSheet: Boolean(character.sheet) });
    view.renderRecent(rolling.log.list({ characterId: id }).slice(0, 15).map((roll) => ({ roll, text: explain(roll) })));
  }

  router.onRoute(() => render());
  store.subscribe(() => render());
  rolling.log.subscribe(() => render());
}
