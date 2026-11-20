import { routeHref } from "../views.js";
import { mountCharacterPage } from "../ui/character.js";

export function initCharacter(ctx) {
  const { store, router, actions, bus, toast } = ctx;
  let focusNameFor = null;

  function currentId() {
    const route = router.current();
    return route.view === "character" ? route.id : null;
  }

  const view = mountCharacterPage(document.querySelector("#page-character"), {
    onChange(patch, key) {
      const id = currentId();

      if (id) {
        store.updateCharacter(id, patch, { key: key ? `${id}:${key}` : null });
      }
    },
    onDuplicate: () => actions.duplicate(currentId(), { open: true }),
    async onDelete() {
      const id = currentId();

      if (id && await actions.remove(id)) {
        router.navigate(routeHref("library"));
      }
    }
  });

  function show({ force = false } = {}) {
    const id = currentId();

    if (!id) {
      return;
    }

    const character = store.getCharacter(id);

    if (!character) {
      toast("That character is no longer here.");
      router.navigate(routeHref("library"));
      return;
    }

    const switched = view.render(character, { force });

    if (switched && focusNameFor === id) {
      focusNameFor = null;
      view.focusName();
    }
  }

  bus.on("character:new", (id) => {
    focusNameFor = id;
  });

  router.onRoute(() => show());
  store.subscribe(() => show());
  bus.on("data:reloaded", () => show({ force: true }));
}
