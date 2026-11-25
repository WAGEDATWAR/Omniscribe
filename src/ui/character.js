import { CHARACTER_PAGES, routeHref } from "../views.js";
import { CHARACTER_STATUSES, STATUS_LABELS, displayName, initials } from "../schema.js";
import { LIMITS } from "../limits.js";
import { KIND_IDS } from "../records/kinds.js";
import { button, field, h, pageHeader, replace, section } from "./dom.js";
import { createLayoutForm } from "./layoutForm.js";
import { createTagInput } from "./tagInput.js";

/**
 * Mounts the character page: a header, a link bar of the character's pages (U-11), the overview form
 * and a container the PDF page fills. Inputs write to the store through `onChange` as you type
 * (autosave, no Save step). `render` mirrors the store back into the form, skipping a field that has
 * focus so typing is never interrupted.
 */
export function mountCharacterPage(root, handlers) {
  const name = h("input", {
    id: "character-name",
    class: "input",
    type: "text",
    maxLength: LIMITS.nameLength,
    autocomplete: "off",
    oninput: (event) => handlers.onChange({ name: event.target.value }, "name")
  });

  const player = h("input", {
    id: "character-player",
    class: "input",
    type: "text",
    maxLength: LIMITS.playerLength,
    autocomplete: "off",
    oninput: (event) => handlers.onChange({ player: event.target.value }, "player")
  });

  const system = h("input", {
    id: "character-system",
    class: "input",
    type: "text",
    maxLength: LIMITS.systemLength,
    autocomplete: "off",
    oninput: (event) => handlers.onChange({ systemId: event.target.value }, "system")
  });

  const status = h(
    "select",
    {
      id: "character-status",
      class: "input",
      onchange: (event) => handlers.onChange({ status: event.target.value }, null)
    },
    CHARACTER_STATUSES.map((value) => h("option", { value, text: STATUS_LABELS[value] }))
  );

  const summary = h("textarea", {
    id: "character-summary",
    class: "input",
    rows: 3,
    maxLength: LIMITS.summaryLength,
    oninput: (event) => handlers.onChange({ summary: event.target.value }, "summary")
  });

  const notes = h("textarea", {
    id: "character-notes",
    class: "input input-tall",
    rows: 10,
    maxLength: LIMITS.notesLength,
    oninput: (event) => handlers.onChange({ notes: event.target.value }, "notes")
  });

  const tags = createTagInput({
    id: "character-tags",
    label: "Tags",
    onChange: (next) => handlers.onChange({ tags: next }, null)
  });

  const portraitInput = h("input", {
    id: "portrait-input",
    type: "file",
    accept: "image/png,image/jpeg,image/webp,image/gif",
    hidden: true,
    onchange: (event) => {
      const [file] = event.target.files;
      event.target.value = "";

      if (file) {
        handlers.onPortraitFile(file);
      }
    }
  });

  const portraitFrame = h("div", { class: "portrait-frame", id: "portrait-frame" });
  const removePortrait = button({
    id: "portrait-remove",
    label: "Remove portrait",
    variant: "btn-danger-text",
    onclick: () => handlers.onPortraitRemove()
  });

  const header = h("div", { id: "character-header" });
  const nav = h("nav", { class: "subnav", "aria-label": "Character pages" });
  const portraitPanel = section(
    { id: "character-portrait-section", title: "Portrait", description: "Shown on this character's tile. Images are cropped to a square and kept on this device." },
    h("div", { class: "portrait-block" }, portraitFrame, h("div", { class: "portrait-actions" }, button({ id: "portrait-choose", label: "Choose image", onclick: () => portraitInput.click() }), removePortrait, portraitInput))
  );
  let shownFields = {};
  const details = createLayoutForm({
    prefix: "character",
    panels: true,
    builtins: new Map([
      ["name", { control: name }],
      ["player", { control: player }],
      ["systemId", { control: system }],
      ["status", { control: status }],
      ["summary", { control: summary }],
      ["tags", { control: tags.element, id: "character-tags" }],
      ["notes", { control: notes }]
    ]),
    descriptions: { identity: "Who this character is. Everything saves as you type.", notes: "Anything worth keeping that has no field yet." },
    blocks: [{ afterIndex: 1, node: portraitPanel }],
    onOwnChange: () => {
      const read = details.read(shownFields);

      if (!read.error) {
        shownFields = read.values;
        handlers.onOwnFields(read.values);
      }
    }
  });
  const overview = h("div", { class: "stack", id: "character-overview" }, details.element);
  const glance = h("div", { class: "stat-row", id: "character-glance" });
  overview.append(section({ id: "character-glance-section", title: "At a glance", description: "What this character has recorded on the other pages." }, glance));
  const campaignList = h("div", { class: "stack", id: "character-campaign-list" });
  const campaignPick = h("select", { id: "character-campaign-pick", class: "input", "aria-label": "Campaign to join" });
  const campaignAdd = button({ id: "character-campaign-add", label: "Add to campaign", variant: "btn-small", onclick: () => campaignPick.value && handlers.onJoinCampaign(campaignPick.value) });
  const campaignPanel = section(
    { id: "character-campaigns", title: "Campaigns", description: "The campaigns this character plays in. Shown here from the campaigns; nothing is stored on the character." },
    campaignList,
    h("div", { class: "toolbar" }, campaignPick, campaignAdd)
  );
  const revisionLabel = h("input", { id: "character-revision-label", class: "input", type: "text", maxLength: 80, autocomplete: "off", "aria-label": "Name for the revision", placeholder: "Name this revision (optional)" });
  const revisionList = h("ul", { class: "plain-list", id: "character-revision-list" });
  const revisionPanel = section(
    { id: "character-revisions", title: "Revisions", description: "Earlier states of this character. One is kept before each editing session and before risky changes; restoring one saves the current state first." },
    h("div", { class: "toolbar" }, revisionLabel, button({ id: "character-revision-save", label: "Save a revision", variant: "btn-small", onclick: () => { handlers.onRevisionSave(revisionLabel.value); revisionLabel.value = ""; } })),
    revisionList
  );
  overview.append(campaignPanel, revisionPanel);
  const sheetRoot = h("div", { id: "character-sheet", hidden: true });
  const pdfRoot = h("div", { id: "character-pdf", hidden: true });
  const rollsRoot = h("div", { id: "character-rolls", hidden: true });

  const listRoots = new Map(KIND_IDS.map((id) => [id, h("div", { id: `character-${id}`, hidden: true })]));

  replace(root, header, nav, overview, sheetRoot, rollsRoot, ...listRoots.values(), pdfRoot);

  let shownId = null;

  function setValue(element, value, force) {
    if ((force || document.activeElement !== element) && element.value !== value) {
      element.value = value;
    }
  }

  function drawNav(characterId, sub) {
    if (!nav.children.length) {
      replace(nav, CHARACTER_PAGES.map((page) => h("a", { class: "subnav-link", "data-page": page.id, text: page.label })));
    }

    for (const link of nav.children) {
      link.href = routeHref("character", characterId, link.dataset.page);

      if (link.dataset.page === sub) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }

  function drawGlance(character) {
    const present = character.familiars.filter((familiar) => familiar.summoned).map((familiar) => familiar.name || "Unnamed");
    const stats = [
      ["Items", character.inventory.items.length],
      ["Abilities", character.abilities.length],
      ["Journal entries", character.journal.length],
      ["Relations", character.relations.length],
      ["Familiars", character.familiars.length]
    ];

    replace(
      glance,
      stats.map(([label, value]) => h("div", { class: "stat" }, h("span", { class: "stat-label", text: label }), h("strong", { class: "stat-value", text: String(value) }))),
      present.length ? h("div", { class: "stat" }, h("span", { class: "stat-label", text: "Present now" }), h("strong", { class: "stat-value", text: present.join(", ") })) : null
    );
  }

  function drawRevisions(revisions) {
    replace(
      revisionList,
      revisions.length
        ? revisions.map((revision) =>
            h(
              "li",
              { class: "record-summary", "data-revision": revision.id },
              h("span", { text: `${revision.when}${revision.label ? ` · ${revision.label}` : ""} · ${revision.change}` }),
              button({ label: "Restore", variant: "btn-small", ariaLabel: `Restore the revision from ${revision.when}`, onclick: () => handlers.onRevisionRestore(revision.id) })
            )
          )
        : h("li", { class: "muted", text: "No revisions yet. One is saved before your next editing session." })
    );
  }

  function drawCampaigns(joined, available) {
    replace(
      campaignList,
      joined.length
        ? joined.map(({ campaign, row }) => h("p", { class: "record-summary" }, h("a", { href: routeHref("campaign", campaign.id), text: campaign.name.trim() || "Unnamed campaign" }), h("span", { text: ` · ${[row.role, row.status].filter(Boolean).join(" · ") || "member"}` })))
        : h("p", { class: "muted", text: "Not in any campaign yet." })
    );
    campaignPick.replaceChildren(...available.map((campaign) => h("option", { value: campaign.id, text: campaign.name.trim() || "Unnamed campaign" })));
    campaignPick.hidden = !available.length;
    campaignAdd.hidden = !available.length;
  }

  let portraitKey = null;

  function drawPortrait(character, url) {
    removePortrait.hidden = !character.portraitBlobId;

    const key = url ? `${url}|${displayName(character)}` : `initials|${initials(character)}`;

    if (key === portraitKey) {
      return;
    }

    portraitKey = key;

    if (url) {
      replace(portraitFrame, h("img", { class: "portrait-img", id: "portrait-img", src: url, alt: `Portrait of ${displayName(character)}` }));
    } else {
      replace(portraitFrame, h("span", { class: "portrait-initials", "aria-hidden": "true", text: initials(character) }));
    }
  }

  return {
    sheetRoot,
    pdfRoot,
    render(character, { layout = null, force: forced = false, sub = "overview", portraitUrl = null, campaigns = { joined: [], available: [] }, revisions = [] } = {}) {
      const force = forced || character.id !== shownId;
      shownId = character.id;

      if (!header.firstChild) {
        replace(
          header,
          pageHeader({
            title: "Character",
            subtitle: "Character",
            titleId: "character-title",
            back: { href: "#/library", label: "Library" },
            actions: [
              button({ id: "character-export", icon: "download", label: "Export", onclick: handlers.onExport }),
              button({ id: "character-duplicate", icon: "copy", label: "Duplicate", onclick: handlers.onDuplicate }),
              button({
                id: "character-delete",
                icon: "trash",
                label: "Delete",
                variant: "btn-danger-text",
                onclick: handlers.onDelete
              })
            ]
          })
        );
      }

      header.querySelector(".page-title").textContent = displayName(character);
      header.querySelector(".page-subtitle").textContent =
        [character.player, character.systemId].filter((part) => part.trim()).join(" · ") || "Character";

      drawNav(character.id, sub);
      drawGlance(character);
      drawCampaigns(campaigns.joined, campaigns.available);
      drawRevisions(revisions);
      overview.hidden = sub !== "overview";
      sheetRoot.hidden = sub !== "sheet";
      pdfRoot.hidden = sub !== "pdf";
      rollsRoot.hidden = sub !== "rolls";

      for (const [id, element] of listRoots) {
        element.hidden = sub !== id;
      }

      if (layout) {
        details.setLayout(layout);
      }

      shownFields = character.fields;
      details.write(character.fields, { keepFocus: !force });
      setValue(name, character.name, force);
      setValue(player, character.player, force);
      setValue(system, character.systemId, force);
      setValue(status, character.status, true);
      setValue(summary, character.summary, force);
      setValue(notes, character.notes, force);

      if (force || document.activeElement !== tags.input) {
        tags.set(character.tags);
      }

      drawPortrait(character, portraitUrl);

      return force;
    },
    focusName: () => name.focus()
  };
}
