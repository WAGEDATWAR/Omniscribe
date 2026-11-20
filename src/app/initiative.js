import { campaignName } from "../campaigns.js";
import { checkExpression } from "../dice/presets.js";
import { currentEntry, keepTurnOn, moveWithinTie, nextTurn, orderEntries, previousTurn } from "../initiative.js";
import { systemRecords } from "../records/systemRecords.js";
import { mountInitiativePage } from "../ui/initiative.js";

/** The initiative tracker of a campaign: rolls through the one rolling path, orders, steps turns (K-5, K-6). */
export function initInitiative(ctx) {
  const { store, router, rolling, toast, confirm } = ctx;

  function currentId() {
    const route = router.current();
    return route.view === "campaign" && route.sub === "initiative" ? route.id : null;
  }

  const campaign = () => store.getCampaign(currentId());

  function expressionFor(characterId) {
    const own = campaign()?.initiativeExpression.trim();
    return own || systemRecords(rolling.templateFor(characterId)).initiative || "1d20";
  }

  function saveInitiative(next, key) {
    store.updateCampaign(currentId(), { initiative: next }, { key: key ? `${currentId()}:initiative:${key}` : null });
  }

  const base = () => campaign()?.initiative ?? { round: 1, turn: 0, entries: [] };

  /** Edits an entry and keeps the turn on whoever is current, even when the order changes. */
  function editEntry(entryId, patch, key) {
    const initiative = base();
    const current = currentEntry(initiative);
    const entries = initiative.entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry));
    saveInitiative(current ? keepTurnOn({ ...initiative, entries }, current.id) : { ...initiative, entries }, key);
  }

  async function rollFor(characterId, label) {
    const result = await rolling.roll(expressionFor(characterId), { characterId, label: `Initiative: ${label}`, options: { campaignId: currentId() } });
    return result.ok ? { ok: true, value: Math.round(result.roll.total * 100) / 100 } : { ok: false, reason: result.error.message };
  }

  function parseValue(text) {
    const source = String(text).trim();
    const number = Number(source);
    return source && Number.isFinite(number) && Math.abs(number) <= 1e6 ? { ok: true, value: number } : { ok: false, reason: "Initiative must be a number" };
  }

  const view = mountInitiativePage(document.querySelector("#campaign-initiative"), {
    async onAddRoster() {
      const found = campaign();
      const entries = base().entries;
      let added = 0;
      let failed = null;

      for (const member of found.roster) {
        const character = store.getCharacter(member.characterId);

        if (!character || entries.some((entry) => entry.characterId === member.characterId)) {
          continue;
        }

        const rolled = await rollFor(character.id, character.name.trim() || "Unnamed character");

        if (!rolled.ok) {
          failed = rolled.reason;
        }

        store.addCampaignRecord(currentId(), "initiative", { characterId: character.id, name: character.name.trim() || "Unnamed character", value: rolled.ok ? rolled.value : 0 });
        added += 1;
      }

      toast(failed ? `Rolled with a problem: ${failed}. Those start at 0.` : added ? `Rolled initiative for ${added === 1 ? "1 character" : `${added} characters`}.` : "Everyone on the roster is already here.", failed ? { tone: "error" } : {});
    },
    async onAddOther({ name, value }) {
      if (!name.trim()) {
        return { ok: false, reason: "Give the combatant a name" };
      }

      let number;

      if (value.trim()) {
        const parsed = parseValue(value);

        if (!parsed.ok) {
          return parsed;
        }

        number = parsed.value;
      } else {
        const expression = expressionFor(null);
        const verdict = checkExpression(expression);

        if (!verdict.ok) {
          return verdict;
        }

        const rolled = await rollFor(null, name.trim());

        if (!rolled.ok) {
          return rolled;
        }

        number = rolled.value;
      }

      const initiative = base();
      const current = currentEntry(initiative);
      const added = store.addCampaignRecord(currentId(), "initiative", { name: name.trim(), value: number });

      if (!added) {
        return { ok: false, reason: "A tracker can hold 100 combatants" };
      }

      if (current) {
        saveInitiative(keepTurnOn(base(), current.id));
      }

      return { ok: true };
    },
    onValue(id, text) {
      const parsed = parseValue(text);

      if (parsed.ok) {
        editEntry(id, { value: parsed.value });
      } else {
        toast(parsed.reason, { tone: "error" });
        render();
      }
    },
    onNote: (id, text) => editEntry(id, { note: text }),
    onHp: (id, text) => editEntry(id, { hp: text }),
    onTie(id, delta) {
      const initiative = base();
      const current = currentEntry(initiative);
      const entries = moveWithinTie(initiative.entries, id, delta);

      if (entries !== initiative.entries) {
        saveInitiative(current ? keepTurnOn({ ...initiative, entries }, current.id) : { ...initiative, entries });
      }
    },
    onDone: (id) => editEntry(id, { done: !base().entries.find((entry) => entry.id === id)?.done }),
    onRemove(id) {
      const initiative = base();
      const before = initiative;
      const current = currentEntry(initiative);
      const entries = initiative.entries.filter((entry) => entry.id !== id);
      const next = { ...initiative, entries };
      saveInitiative(current && current.id !== id ? keepTurnOn(next, current.id) : { ...next, turn: Math.min(initiative.turn, Math.max(0, entries.length - 1)) });
      toast("Removed from the tracker.", { action: { label: "Undo", run: () => saveInitiative(before) } });
    },
    onNext: () => saveInitiative(nextTurn(base())),
    onPrev: () => saveInitiative(previousTurn(base())),
    async onEnd() {
      const before = campaign()?.initiative;

      if (!before || !(await confirm({ heading: "End the encounter?", body: `This clears the tracker for ${campaignName(campaign())}. You can undo it right after.`, confirmLabel: "End encounter", danger: true }))) {
        return;
      }

      saveInitiative(null);
      toast("Encounter ended.", { action: { label: "Undo", run: () => saveInitiative(before) } });
    }
  });

  function render() {
    if (!currentId() || !campaign()) {
      return;
    }

    const initiative = base();
    const ordered = orderEntries(initiative.entries);
    view.render({ ordered, round: initiative.round, currentId: ordered[initiative.turn]?.id ?? null });
  }

  router.onRoute(() => render());
  store.subscribe(() => render());
}
