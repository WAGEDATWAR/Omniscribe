import { campaignsOf, onRoster } from "../campaigns.js";
import { HEAD_BYTES, checkImage } from "../files.js";
import { routeHref } from "../views.js";
import { mountCharacterPage } from "../ui/character.js";
import { openCropDialog } from "../ui/cropDialog.js";
import { cropPortrait, scalePortrait } from "./images.js";

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

    let bitmap = null;

    try {
      bitmap = await createImageBitmap(file);
      const choice = await openCropDialog(bitmap);

      if (!choice) {
        return;
      }

      const image = choice === "whole" ? await scalePortrait(file) : await cropPortrait(bitmap, choice);
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
    } finally {
      bitmap?.close?.();
    }
  }

  const view = mountCharacterPage(document.querySelector("#page-character"), {
    onChange(patch, key) {
      const id = currentId();

      if (id) {
        store.updateCharacter(id, patch, { key: key ? `${id}:${key}` : null });
      }
    },
    layoutEditor: ctx.layoutEditor,
    onOwnFields(fields) {
      const id = currentId();

      if (id) {
        store.updateCharacter(id, { fields }, { key: `${id}:fields` });
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
    onRevisionSave: async (label) => {
      const id = currentId();

      if (id && (await ctx.revisions.snapshot(id, label.trim() || "Saved by you"))) {
        toast("Revision saved.");
      }
    },
    async onRevisionRestore(revisionId) {
      const id = currentId();
      const when = ctx.revisions.describeWhen(revisionId);

      if (id && (await ctx.confirm({ heading: "Restore this revision?", body: `This character goes back to how it was on ${when}. The current state is saved as a revision first, and Undo also works.`, confirmLabel: "Restore" })) && (await ctx.revisions.restore(id, revisionId))) {
        show({ force: true });
        toast("Restored. Undo goes back.");
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
      layout: ctx.layouts.resolved("character"),
      force,
      sub: router.current().sub,
      portraitUrl: blobId ? blobUrls.peek(blobId) : null,
      revisions: ctx.revisions.rowsFor(id),
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
  bus.on("revisions:changed", () => show());
  bus.on("layouts:changed", () => show({ force: true }));
  bus.on("layout:editing", () => show({ force: true }));
}
