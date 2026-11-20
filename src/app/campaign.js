import { isShared } from "../campaigns.js";
import { explain } from "../dice/explain.js";
import { routeHref } from "../views.js";
import { mountCampaignPage } from "../ui/campaign.js";

/** The campaign page shell and its overview: one campaign, one of its pages (U-4, U-11). */
export function initCampaign(ctx) {
  const { store, router, actions, bus, toast } = ctx;
  let focusNameFor = null;

  function currentId() {
    const route = router.current();
    return route.view === "campaign" ? route.id : null;
  }

  const view = mountCampaignPage(document.querySelector("#page-campaign"), {
    onChange(patch, key) {
      const id = currentId();

      if (id) {
        store.updateCampaign(id, patch, { key: key ? `${id}:${key}` : null });
      }
    },
    onCustom(custom) {
      store.updateCampaign(currentId(), { custom });
      toast("Saved your fields.");
    },
    onDuplicate: () => actions.duplicateCampaign(currentId()),
    async onDelete() {
      const id = currentId();

      if (id && (await actions.removeCampaign(id))) {
        router.navigate(routeHref("library"));
      }
    }
  });

  function show({ force = false } = {}) {
    const id = currentId();

    if (!id) {
      return;
    }

    const campaign = store.getCampaign(id);

    if (!campaign) {
      toast("That campaign is no longer here.");
      router.navigate(routeHref("library"));
      return;
    }

    const recentRolls = ctx.rolling.log
      .list({ characterId: null })
      .filter((roll) => roll.campaignId === id && isShared(roll))
      .slice(0, 10)
      .map((roll) => ({ roll, text: explain(roll) }));
    const switched = view.render(campaign, { force, sub: router.current().sub, recentRolls });

    if (switched && focusNameFor === id) {
      focusNameFor = null;
      view.focusName();
    }
  }

  bus.on("campaign:new", (id) => {
    focusNameFor = id;
  });

  ctx.rolling.log.subscribe(() => router.current().view === "campaign" && show());
  router.onRoute(() => show());
  store.subscribe(() => show());
  bus.on("data:reloaded", () => show({ force: true }));
}
