import { buildCampaigns, buildLibrary } from "../projects.js";
import { mountLibrary } from "../ui/library.js";

export function initLibrary(ctx) {
  const { store, router, actions, prefs, blobUrls } = ctx;
  const view = mountLibrary(document.querySelector("#page-library"), {
    onSearch: (query) => store.setSearch(query),
    onSort: (mode) => {
      store.setSort(mode);
      prefs.update({ sort: mode });
    },
    onNew: () => actions.newCharacter(),
    onNewCampaign: () => actions.newCampaign(),
    onDuplicateCampaign: (id) => actions.duplicateCampaign(id),
    onDeleteCampaign: (id) => actions.removeCampaign(id),
    onSample: () => actions.addSample(),
    onDuplicate: (id) => actions.duplicate(id),
    onDelete: (id) => actions.remove(id)
  });

  function render() {
    const ui = store.getUi();

    const library = buildLibrary(store.getState().characters, { query: ui.search, sort: ui.sort });

    view.render({
      library,
      campaigns: buildCampaigns(store.getState().campaigns, { query: ui.search, sort: ui.sort }),
      search: ui.search,
      sort: ui.sort,
      portraitUrl: (id) => (id ? blobUrls.peek(id) : null)
    });

    blobUrls.ensure(library.items.map((item) => item.portraitBlobId).filter(Boolean)).then((loaded) => {
      if (loaded && router.current().view === "library") {
        render();
      }
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
