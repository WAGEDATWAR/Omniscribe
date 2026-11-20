import { SCHEMA_VERSION } from "../migrations.js";
import { checkPersistence, estimateUsage, requestPersistence } from "../storage.js";
import { mountDataPage } from "../ui/data.js";

export function initData(ctx) {
  const { store, storage, router, toast } = ctx;

  const view = mountDataPage(document.querySelector("#page-data"), {
    async onPersist() {
      const result = await requestPersistence();

      toast(
        result.persisted
          ? "Storage is now protected."
          : "The browser declined. It usually grants this once the app is installed or used often.",
        { tone: result.persisted ? "info" : "error" }
      );

      refresh();
    }
  });

  async function refresh() {
    const [persistence, usage, blobs] = await Promise.all([
      checkPersistence(),
      estimateUsage(),
      storage.blobUsage()
    ]);

    if (router.current().view !== "data") {
      return;
    }

    view.render({
      backend: storage.name,
      degraded: storage.degraded,
      persistence,
      usage,
      blobs,
      characters: store.getState().characters.length,
      schemaVersion: SCHEMA_VERSION
    });
  }

  router.onRoute((route) => {
    if (route.view === "data") {
      refresh();
    }
  });
}
