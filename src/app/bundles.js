import { buildArchive, bundleContents } from "../backup.js";
import { campaignName } from "../campaigns.js";
import { displayName as characterName } from "../schema.js";
import { formatBytes } from "../utils.js";
import { saveFile } from "./download.js";

function slug(text, fallback) {
  const value = String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return value || fallback;
}

/** Exports one character or one campaign as a bundle (X-6). The file imports through the Data page's restore. */
export function createBundles(ctx) {
  const { store, storage, autosave, toast } = ctx;

  async function build(kind, options, name) {
    await autosave.flush();
    const state = store.getState();
    const contents = bundleContents({ kind, ...options, characters: state.characters, customSystems: await storage.listSystems(), layouts: ctx.layouts.all() });
    const blobs = [];

    for (const id of contents.blobIds) {
      const record = await storage.getBlob(id);

      if (record?.data) {
        blobs.push({ id, type: record.type, addedAt: record.addedAt, bytes: new Uint8Array(await record.data.arrayBuffer()) });
      }
    }

    const { bytes } = await buildArchive({ kind, characters: contents.characters, campaigns: contents.campaigns, systems: contents.systems, layouts: contents.layouts, blobs, appVersion: ctx.version });
    saveFile(new Blob([bytes], { type: "application/zip" }), `${name}.omniscribe-bundle.zip`);
    return bytes.length;
  }

  return {
    async exportCharacter(id) {
      const character = store.getCharacter(id);

      if (!character) {
        return;
      }

      try {
        const size = await build("character", { character }, slug(characterName(character), "character"));
        toast(`Exported ${characterName(character)} (${formatBytes(size)}).`);
      } catch {
        toast("Could not export the character.", { tone: "error" });
      }
    },
    async exportCampaign(id, secrets) {
      const campaign = store.getCampaign(id);

      if (!campaign) {
        return;
      }

      try {
        const size = await build("campaign", { campaign, secrets }, slug(campaignName(campaign), "campaign"));
        toast(`Exported ${campaignName(campaign)} (${formatBytes(size)})${secrets ? "" : ", without secrets"}.`);
      } catch {
        toast("Could not export the campaign.", { tone: "error" });
      }
    }
  };
}
