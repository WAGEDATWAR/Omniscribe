import { buildLibrary } from "../projects.js";
import { mountLibrary } from "../ui/library.js";

export function initLibrary(ctx) {
  const { store, router, actions, prefs } = ctx;
  const view = mountLibrary(document.querySelector("#page-library"), {
    onSearch: (query) => store.setSearch(query),
    onSort: (mode) => {
      store.setSort(mode);
      prefs.update({ sort: mode });
    },
    onNew: () => actions.newCharacter(),
    onSample: () => actions.addSample(),
    onDuplicate: (id) => actions.duplicate(id),
    onDelete: (id) => actions.remove(id)
  });

  function render() {
    const ui = store.getUi();

    view.render({
      library: buildLibrary(store.getState().characters, { query: ui.search, sort: ui.sort }),
      search: ui.search,
      sort: ui.sort
    });
  }

  router.onRoute((route) => {
    if (route.view === "library") {
      render();
    }
  });

  store.subscribe(() => {
    if (router.current().view === "library") {
      render();
    }
  });
}
