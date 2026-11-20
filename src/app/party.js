import { partyRows, sortRows } from "../party.js";
import { systemRecords } from "../records/systemRecords.js";
import { routeHref } from "../views.js";
import { mountPartyPage } from "../ui/party.js";

/** The party view of a campaign (K-4): columns of sheet values per roster character. */
export function initParty(ctx) {
  const { store, router, rolling, bus } = ctx;

  function currentId() {
    const route = router.current();
    return route.view === "campaign" && route.sub === "party" ? route.id : null;
  }

  function suggestion(campaign) {
    const counts = new Map();

    for (const row of campaign.roster) {
      const template = rolling.templateFor(row.characterId);
      const columns = systemRecords(template).party;

      if (template && columns.length) {
        const entry = counts.get(template.id) ?? { name: template.name, columns, count: 0 };
        entry.count += 1;
        counts.set(template.id, entry);
      }
    }

    return [...counts.values()].sort((left, right) => right.count - left.count)[0] ?? null;
  }

  const view = mountPartyPage(document.querySelector("#campaign-party"), {
    onSuggest(columns) {
      const id = currentId();

      for (const column of columns) {
        store.addCampaignRecord(id, "partyColumns", column);
      }
    },
    onRoll(characterId) {
      bus.emit("dice:as", characterId);
      router.navigate("#/dice");
    }
  });

  function render() {
    const id = currentId();
    const campaign = id ? store.getCampaign(id) : null;

    if (!campaign) {
      return;
    }

    const characters = store.getState().characters;
    const rows = partyRows(campaign, characters, (character) => (character.sheet ? rolling.scopeFor(character.id) : null)).map((row) => ({
      ...row,
      href: row.character ? routeHref("character", row.character.id) : ""
    }));

    view.render({
      rows,
      columns: campaign.partyColumns,
      suggestion: suggestion(campaign),
      order: (list, sort) => (sort.index >= 0 ? sortRows(list, sort.index, sort.direction) : list),
      notes: []
    });
  }

  router.onRoute(() => render());
  store.subscribe(() => render());
}
