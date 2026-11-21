import { campaignsOf, onRoster } from "../campaigns.js";
import { HEAD_BYTES, checkImage } from "../files.js";
import { routeHref } from "../views.js";
import { mountCharacterPage } from "../ui/character.js";
import { scalePortrait } from "./images.js";

export function initCharacter(ctx) {
  const { store, storage, router, actions, bus, toast, blobUrls } = ctx;
  let focusNameFor = null;

  function currentId() {
    const route = router.current();
    return route.view === "character" ? route.id : null;
  }

  async function setPortraitFrom(file) {
    const id = currentId();
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
    const verdict = checkImage({ size: file.size, head });

    if (!verdict.ok) {
      toast(verdict.reason, { tone: "error" });
      return;
    }

    const room = await ctx.room(file.size);

    if (!room.ok) {
      toast(room.message, { tone: "error" });
      return;
    }

    try {
      const image = await scalePortrait(file);
      const meta = await storage.putBlob({ type: image.type, data: image });

      if (!store.getCharacter(id)) {
        await storage.deleteBlobs([meta.id]);
        return;
      }

      await blobUrls.ensure([meta.id]);
      store.setPortrait(id, meta.id);
      toast("Portrait updated.");
    } catch {
      toast("That image could not be read.", { tone: "error" });
    }
  }

  const view = mountCharacterPage(document.querySelector("#page-character"), {
    onChange(patch, key) {
      const id = currentId();

      if (id) {
        store.updateCharacter(id, patch, { key: key ? `${id}:${key}` : null });
      }
    },
    onExport: () => ctx.bundles.exportCharacter(currentId()),
    onDuplicate: () => actions.duplicate(currentId(), { open: true }),
    async onDelete() {
      const id = currentId();

      if (id && await actions.remove(id)) {
        router.navigate(routeHref("library"));
      }
    },
    onPortraitFile: setPortraitFrom,
    onJoinCampaign(campaignId) {
      const id = currentId();

      if (id && store.addCampaignRecord(campaignId, "roster", { characterId: id, role: "Player character", status: "Active" })) {
        toast("Added to the campaign.");
      }
    },
    onPortraitRemove() {
      const id = currentId();
      const previous = store.getCharacter(id)?.portraitBlobId;

      if (previous) {
        store.setPortrait(id, null);
        toast("Portrait removed.", { action: { label: "Undo", run: () => store.setPortrait(id, previous) } });
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

    const blobId = character.portraitBlobId;
    const switched = view.render(character, {
      force,
      sub: router.current().sub,
      portraitUrl: blobId ? blobUrls.peek(blobId) : null,
      campaigns: {
        joined: campaignsOf(store.getState().campaigns, id),
        available: store.getState().campaigns.filter((campaign) => !onRoster(campaign, id))
      }
    });

    if (blobId && blobUrls.peek(blobId) === null) {
      blobUrls.ensure([blobId]).then((loaded) => {
        if (loaded) {
          show();
        }
      });
    }

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
