import { applyDelta, attunedCount, canContain, carriedWeight, totalValue } from "../inventory.js";
import { filterEntries, sortEntries } from "../journal.js";
import { lastLevel, newestFirst, xpTotal } from "../progression.js";
import { attitudeWord, reciprocalRelations, targetExists } from "../relations.js";
import { evaluateLimit, systemRecords } from "../records/systemRecords.js";
import { explain } from "../dice/explain.js";
import { routeHref } from "../views.js";
import { button, h } from "../ui/dom.js";
import { resultCard } from "../ui/dice.js";

const DEFAULT_CURRENCIES = ["gp", "sp", "cp"];

function stat(label, value) {
  return h("div", { class: "stat" }, h("span", { class: "stat-label", text: label }), h("strong", { class: "stat-value", text: String(value) }));
}

function number(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * What a descriptor cannot say about each kind (C-11): its summary line, quick controls and extra panels.
 * Built once with the shared services; each hook is a small function over a character's records.
 */
export function createKindUi({ store, router, toast, rolling, currentId }) {
  const abilityResult = h("div", { id: "abilities-result", class: "roll-slot", role: "status", "aria-live": "polite" });

  function update(recordId, kindId, patch, key) {
    store.updateRecord(currentId(), kindId, recordId, patch, { key });
  }

  function stepper(record, kindId, field, { label, min = 0, max, step = 1 }) {
    return h(
      "span",
      { class: "stepper", role: "group", "aria-label": `${label} of ${record.name ?? record.title}` },
      button({ label: "−", ariaLabel: `Less ${label}`, variant: "btn-small", disabled: record[field] <= min, onclick: () => update(record.id, kindId, { [field]: Math.max(min, record[field] - step) }, field) }),
      h("span", { class: "stepper-value", text: String(record[field]) }),
      button({ label: "+", ariaLabel: `More ${label}`, variant: "btn-small", disabled: max !== undefined && record[field] >= max, onclick: () => update(record.id, kindId, { [field]: record[field] + step }, field) })
    );
  }

  function toggle(record, kindId, field, label) {
    return h("button", {
      type: "button",
      class: "btn btn-small",
      "aria-pressed": String(record[field] === true),
      "aria-label": `${label}: ${record.name ?? record.title}`,
      text: record[field] ? `${label} ✓` : label,
      onclick: () => update(record.id, kindId, { [field]: !record[field] })
    });
  }

  function walletPanel(character) {
    const wallets = character.inventory.wallets;
    const configured = systemRecords(rolling.templateFor(character.id)).currencies;
    const labels = new Map(configured.map((currency) => [currency.key, currency.label]));
    const keys = [...new Set([...(configured.length ? configured.map((currency) => currency.key) : DEFAULT_CURRENCIES), ...Object.keys(wallets)])];

    const rows = keys.map((key) => {
      const delta = h("input", { class: "input wallet-delta", type: "text", inputMode: "numeric", autocomplete: "off", "aria-label": `${key} change`, placeholder: "+25", id: `wallet-delta-${key}` });
      const message = h("span", { class: "field-error", role: "alert", hidden: true, id: `wallet-error-${key}` });

      function apply() {
        const verdict = applyDelta(wallets[key] ?? 0, delta.value);

        if (!verdict.ok) {
          message.textContent = verdict.reason;
          message.hidden = false;
          return;
        }

        store.setWallet(currentId(), key, verdict.value);
      }

      delta.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          apply();
        }
      });

      return h(
        "div",
        { class: "wallet-row", "data-currency": key },
        h("strong", { class: "wallet-key", text: key }),
        labels.has(key) && labels.get(key) !== key ? h("span", { class: "field-hint", text: labels.get(key) }) : null,
        h("span", { class: "wallet-amount", id: `wallet-amount-${key}`, text: String(wallets[key] ?? 0) }),
        delta,
        button({ label: "Apply", ariaLabel: `Apply ${key} change`, variant: "btn-small", onclick: apply }),
        message
      );
    });

    const newKey = h("input", { class: "input", id: "wallet-new", type: "text", maxLength: 12, autocomplete: "off", "aria-label": "New currency name", placeholder: "pp" });

    return h(
      "section",
      { class: "panel", id: "wallet-panel", "aria-labelledby": "wallet-heading" },
      h("h2", { class: "panel-title", id: "wallet-heading", text: "Wallet" }),
      h("p", { class: "panel-description", text: "Type a change such as +25 or -3, or a new total. A wallet cannot go below zero." }),
      h("div", { class: "stack" }, rows),
      h(
        "div",
        { class: "toolbar" },
        newKey,
        button({
          id: "wallet-add",
          label: "Add currency",
          variant: "btn-small",
          onclick: () => {
            const key = newKey.value.trim();

            if (!/^[A-Za-z0-9_-]{1,12}$/.test(key)) {
              toast("A currency name is 1 to 12 letters or digits.", { tone: "error" });
              return;
            }

            store.setWallet(currentId(), key, wallets[key] ?? 0);
          }
        })
      )
    );
  }

  return {
    abilityResult,
    inventory: {
      description: "Everything this character carries, with weight and containers when you want them.",
      summary(record, character) {
        const items = character.inventory.items;
        const parent = record.containerId ? items.find((item) => item.id === record.containerId) : null;
        return [
          `x${record.quantity}`,
          record.weight ? `${number(record.weight)} each` : "",
          record.isContainer ? "container" : "",
          record.equipped ? "equipped" : "",
          record.attuned ? "attuned" : "",
          parent ? `in ${parent.name || "a container"}` : ""
        ]
          .filter(Boolean)
          .join(" · ");
      },
      rowControls: (record) => [stepper(record, "inventory", "quantity", { label: "quantity", max: 999999 }), toggle(record, "inventory", "equipped", "Equip")],
      formExtras: [
        {
          label: "Inside",
          hint: "Put this item in a container you own.",
          build: () => h("select", { id: "rec-inventory-container", class: "input" }),
          read: (node) => ({ containerId: node.value || null }),
          write(node, record, view) {
            node.dataset.self = record?.id ?? "";
            this.refresh(node, view.records, view.character);
            node.value = record?.containerId ?? "";
          },
          refresh(node, records) {
            const self = node.dataset.self || null;
            const chosen = node.value;
            node.replaceChildren(h("option", { value: "", text: "Carried" }));

            for (const item of records) {
              if (item.isContainer && item.id !== self && (!self || canContain(records, item.id, self).ok)) {
                node.append(h("option", { value: item.id, text: item.name || "Unnamed container" }));
              }
            }

            node.value = [...node.options].some((option) => option.value === chosen) ? chosen : "";
          }
        }
      ],
      top(character, records) {
        const rules = systemRecords(rolling.templateFor(character.id));
        const scope = rolling.scopeFor(character.id);
        const limit = evaluateLimit(rules.carry, scope);
        const cap = evaluateLimit(rules.attunement, scope);
        const weight = carriedWeight(records);
        const attuned = attunedCount(records);

        return h(
          "div",
          { class: "stack" },
          h(
            "div",
            { class: "stat-row", id: "inventory-stats" },
            stat("Carried weight", limit === null ? number(weight) : `${number(weight)} of ${number(limit)}`),
            stat("Total value", number(totalValue(records))),
            stat("Attuned", cap === null ? attuned : `${attuned} of ${number(cap)}`)
          ),
          limit !== null && weight > limit ? h("p", { class: "field-error", id: "inventory-over", text: `Over the carry limit by ${number(weight - limit)}.` }) : null,
          cap !== null && attuned > cap ? h("p", { class: "field-error", id: "inventory-over-attune", text: `Attuned to ${attuned - cap} more than the limit of ${number(cap)}.` }) : null
        );
      },
      extra: (character) => walletPanel(character)
    },
    abilities: {
      description: "Features, spells, powers and techniques, including ones no game system lists.",
      summary(record) {
        return [record.kind, record.source, record.summary, record.uses.max === null ? "" : `${record.uses.max - record.uses.used} of ${record.uses.max} uses left`].filter(Boolean).join(" · ");
      },
      detail: (record) => (record.text ? h("p", { class: "record-text", text: record.text }) : null),
      rowControls(record) {
        const controls = [];

        if (record.uses.max !== null) {
          controls.push(
            button({ label: "Use", ariaLabel: `Use ${record.name}`, variant: "btn-small", disabled: record.uses.used >= record.uses.max, onclick: () => update(record.id, "abilities", { uses: { ...record.uses, used: record.uses.used + 1 } }) }),
            button({ label: "Regain", ariaLabel: `Regain a use of ${record.name}`, variant: "btn-small", disabled: record.uses.used <= 0, onclick: () => update(record.id, "abilities", { uses: { ...record.uses, used: record.uses.used - 1 } }) })
          );
        }

        if (record.expression) {
          controls.push(
            button({
              label: "Roll",
              ariaLabel: `Roll ${record.name}`,
              variant: "btn-small btn-primary",
              onclick: async () => {
                const result = await rolling.roll(record.expression, { characterId: currentId(), label: record.name, options: record.critMin ? { critMin: record.critMin } : {} });
                abilityResult.replaceChildren(result.ok ? resultCard(result.roll, result.text ?? explain(result.roll)) : h("p", { class: "field-error", text: result.error.message }));
              }
            })
          );
        }

        return controls;
      },
      extra(character, records) {
        const spent = records.some((record) => record.uses.used > 0);
        return h(
          "div",
          { class: "stack" },
          abilityResult,
          button({
            id: "abilities-restore",
            label: "Restore all uses",
            variant: "btn-small",
            disabled: !spent,
            onclick: () => {
              store.restoreList(currentId(), "abilities", records.map((record) => ({ ...record, uses: { ...record.uses, used: 0 } })));
              toast("Every ability has its uses back.");
            }
          })
        );
      }
    },
    journal: {
      description: "Session notes, goals, recaps and secrets. Entries are plain text.",
      manualOrder: false,
      summary: (record) => [record.date, record.kind[0].toUpperCase() + record.kind.slice(1), record.kind === "goal" ? (record.done ? "done" : "open") : ""].filter(Boolean).join(" · "),
      detail: (record) => (record.text ? h("p", { class: "record-text", text: record.text }) : null),
      rowControls: (record) => (record.kind === "goal" ? toggle(record, "journal", "done", "Done") : null),
      filters: [
        {
          key: "kind",
          label: "Filter by kind",
          options: () => [{ value: "", label: "Every kind" }, ...["note", "session", "goal", "secret", "recap"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))]
        }
      ],
      filter: (records, { query, filters }) => filterEntries(records, { query, kind: filters.kind ?? "" }),
      sort: sortEntries
    },
    relations: {
      description: "Who this character knows, and how they feel about each other.",
      summary(record, character) {
        const missing = !targetExists(store.getState().characters, record);
        return [record.targetType, record.kind, `${attitudeWord(record.attitude)} (${record.attitude > 0 ? "+" : ""}${record.attitude})`, missing ? "(not in this library)" : ""].filter(Boolean).join(" · ");
      },
      formExtras: [
        {
          label: "Link to a character",
          hint: "Only used when this is a character in your library.",
          build: () => h("select", { id: "rec-relations-character", class: "input" }),
          read: (node) => ({ targetId: node.value || null }),
          write(node, record) {
            this.refresh(node);
            node.value = record?.targetId ?? "";
          },
          refresh(node) {
            const chosen = node.value;
            node.replaceChildren(h("option", { value: "", text: "Not linked" }));

            for (const character of store.getState().characters) {
              if (character.id !== currentId()) {
                node.append(h("option", { value: character.id, text: character.name || "Unnamed character" }));
              }
            }

            node.value = [...node.options].some((option) => option.value === chosen) ? chosen : "";
          }
        }
      ],
      extra(character) {
        const others = reciprocalRelations(store.getState().characters, character.id);
        return h(
          "section",
          { class: "panel", id: "relations-reciprocal", "aria-labelledby": "relations-reciprocal-heading" },
          h("h2", { class: "panel-title", id: "relations-reciprocal-heading", text: "Others who know this character" }),
          others.length
            ? h(
                "ul",
                { class: "plain-list" },
                others.map(({ from, relation }) =>
                  h("li", {}, h("a", { href: routeHref("character", from.id, "relations"), text: from.name || "Unnamed character" }), h("span", { text: ` · ${relation.kind || "knows them"} · ${attitudeWord(relation.attitude)}` }))
                )
              )
            : h("p", { class: "muted", text: "No other character has listed this one." })
        );
      }
    },
    progression: {
      description: "A log of experience, levels and milestones. It never edits the sheet by itself.",
      manualOrder: false,
      summary: (record) => [record.date, record.kind, record.delta === null ? "" : `${record.delta > 0 ? "+" : ""}${record.delta}`].filter(Boolean).join(" · "),
      sort: newestFirst,
      rowControls(record, { character }) {
        const key = record.kind === "xp" ? "xp" : record.kind === "level" ? "level" : null;
        const template = rolling.templateFor(character.id);
        const known = key && template?.fields.some((entry) => entry.key === key && entry.type !== "derived" && entry.type === "number");

        if (!known || !character.sheet || record.delta === null) {
          return null;
        }

        if (record.applied) {
          return h("span", { class: "field-hint", text: "Applied to the sheet" });
        }

        return button({
          label: "Apply to the sheet",
          ariaLabel: `Apply to the sheet: ${record.label}`,
          variant: "btn-small",
          onclick: () => {
            const value = key === "xp" ? (Number(character.sheet.values[key]) || 0) + record.delta : record.delta;
            store.updateCharacter(character.id, {
              sheet: { ...character.sheet, values: { ...character.sheet.values, [key]: value } },
              progression: character.progression.map((entry) => (entry.id === record.id ? { ...entry, applied: true } : entry))
            });
            toast(`Set ${key} to ${value} on the sheet.`);
          }
        });
      },
      top(character, records) {
        const level = lastLevel(records);
        return h("div", { class: "stat-row", id: "progression-stats" }, stat("Experience logged", number(xpTotal(records))), stat("Last level", level === null ? "none" : number(level)));
      }
    },
    familiars: {
      description: "Companions, mounts and summons.",
      summary: (record) => [record.kind, record.summoned ? "present" : "away", record.linkedCharacterId ? "linked to a character" : ""].filter(Boolean).join(" · "),
      rowControls(record) {
        return [
          toggle(record, "familiars", "summoned", "Present"),
          button({
            label: "Make a character",
            ariaLabel: `Make a character: ${record.name}`,
            variant: "btn-small",
            onclick: () => {
              const made = store.promoteFamiliar(currentId(), record.id);

              if (!made) {
                toast("The library is full.", { tone: "error" });
                return;
              }

              toast(`${record.name} is now a character.`, { action: { label: "Open", run: () => router.navigate(routeHref("character", made.id)) } });
            }
          })
        ];
      }
    }
  };
}
