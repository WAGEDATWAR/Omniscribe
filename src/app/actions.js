import { campaignName, rosterCount } from "../campaigns.js";
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

    newCampaign() {
      const campaign = store.addCampaign();

      if (!campaign) {
        toast("The library is full.", { tone: "error" });
        return null;
      }

      bus.emit("campaign:new", campaign.id);
      router.navigate(routeHref("campaign", campaign.id));
      return campaign;
    },

    duplicateCampaign(id) {
      const copy = store.duplicateCampaign(id);

      if (!copy) {
        toast("The library is full.", { tone: "error" });
        return null;
      }

      toast(`Duplicated as ${campaignName(copy)}.`, { action: { label: "Undo", run: () => store.deleteCampaign(copy.id) } });
      return copy;
    },

    async removeCampaign(id) {
      const campaign = store.getCampaign(id);

      if (!campaign) {
        return false;
      }

      const confirmed = await confirm({
        heading: `Delete ${campaignName(campaign)}?`,
        body: `This removes the campaign, its ${campaign.roster.length === 1 ? "1 roster member" : `${campaign.roster.length} roster members`} and its sessions from this device. The characters stay. You can undo it right after.`,
        confirmLabel: "Delete",
        danger: true
      });

      if (!confirmed || !store.deleteCampaign(id)) {
        return false;
      }

      toast(`Deleted ${campaignName(campaign)}.`, { action: { label: "Undo", run: () => store.restoreCampaign(campaign) } });
      return true;
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

      const campaignsBefore = store.getState().campaigns;
      const inCampaigns = rosterCount(campaignsBefore, id);
      const confirmed = await confirm({
        heading: `Delete ${displayName(character)}?`,
        body: inCampaigns
          ? `This removes the character from this device and from the roster of ${inCampaigns === 1 ? "1 campaign" : `${inCampaigns} campaigns`}. You can undo it right after.`
          : "This removes the character from this device. You can undo it right after.",
        confirmLabel: "Delete",
        danger: true
      });

      if (!confirmed || !store.deleteCharacter(id)) {
        return false;
      }

      toast(`Deleted ${displayName(character)}.`, {
        action: { label: "Undo", run: () => store.restoreCharacter(character, { campaigns: campaignsBefore }) }
      });
      return true;
    }
  };
}
