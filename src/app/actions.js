import { displayName } from "../schema.js";
import { sampleCharacter } from "../sample.js";
import { routeHref } from "../views.js";

/** Character actions shared by the library, the character page and the palette. */
export function createActions({ store, router, toast, confirm, bus }) {
  function full() {
    toast("The library is full.", { tone: "error" });
    return null;
  }

  return {
    newCharacter() {
      const character = store.addCharacter();

      if (!character) {
        return full();
      }

      bus.emit("character:new", character.id);
      router.navigate(routeHref("character", character.id));
      return character;
    },

    addSample() {
      const character = store.addCharacter(sampleCharacter());

      if (!character) {
        return full();
      }

      toast(`Added ${displayName(character)}.`, {
        action: { label: "Undo", run: () => store.deleteCharacter(character.id) }
      });
      return character;
    },

    duplicate(id, { open = false } = {}) {
      const copy = store.duplicateCharacter(id);

      if (!copy) {
        return full();
      }

      toast(`Duplicated as ${displayName(copy)}.`, {
        action: { label: "Undo", run: () => store.deleteCharacter(copy.id) }
      });

      if (open) {
        router.navigate(routeHref("character", copy.id));
      }

      return copy;
    },

    async remove(id) {
      const character = store.getCharacter(id);

      if (!character) {
        return false;
      }

      const confirmed = await confirm({
        heading: `Delete ${displayName(character)}?`,
        body: "This removes the character from this device. You can undo it right after.",
        confirmLabel: "Delete",
        danger: true
      });

      if (!confirmed || !store.deleteCharacter(id)) {
        return false;
      }

      toast(`Deleted ${displayName(character)}.`, {
        action: { label: "Undo", run: () => store.restoreCharacter(character) }
      });
      return true;
    }
  };
}
