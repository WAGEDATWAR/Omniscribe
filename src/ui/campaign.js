import { CAMPAIGN_LIMITS, CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, campaignName } from "../campaigns.js";
import { CAMPAIGN_PAGES, routeHref } from "../views.js";
import { button, field, h, pageHeader, replace, section } from "./dom.js";
import { createTagInput } from "./tagInput.js";
import { createLayoutForm } from "./layoutForm.js";

const ROOTS = CAMPAIGN_PAGES.filter((page) => page.id !== "overview").map((page) => page.id);

/**
 * Mounts the campaign page: a header, its own link bar (U-4, U-11), the overview form and a container per page
 * that its controller fills. Inputs write through `onChange` as you type; `render` mirrors the store back into the
 * form and skips a field that has focus.
 */
export function mountCampaignPage(root, handlers) {
  const name = h("input", { id: "campaign-name", class: "input", type: "text", maxLength: CAMPAIGN_LIMITS.name, autocomplete: "off", oninput: (event) => handlers.onChange({ name: event.target.value }, "name") });
  const system = h("input", { id: "campaign-system", class: "input", type: "text", maxLength: CAMPAIGN_LIMITS.system, autocomplete: "off", oninput: (event) => handlers.onChange({ system: event.target.value }, "system") });
  const status = h(
    "select",
    { id: "campaign-status", class: "input", onchange: (event) => handlers.onChange({ status: event.target.value }, null) },
    CAMPAIGN_STATUSES.map((value) => h("option", { value, text: CAMPAIGN_STATUS_LABELS[value] }))
  );
  const description = h("textarea", { id: "campaign-description", class: "input input-tall", rows: 6, maxLength: CAMPAIGN_LIMITS.description, oninput: (event) => handlers.onChange({ description: event.target.value }, "description") });
  const expression = h("input", {
    id: "campaign-initiative-expression",
    class: "input input-mono",
    type: "text",
    maxLength: CAMPAIGN_LIMITS.expression,
    autocomplete: "off",
    spellcheck: false,
    placeholder: "1d20 + @dex.mod",
    oninput: (event) => handlers.onChange({ initiativeExpression: event.target.value }, "initiative")
  });
  const tags = createTagInput({ id: "campaign-tags", label: "Tags", onChange: (next) => handlers.onChange({ tags: next }, null) });
  let shownFields = {};
  const details = createLayoutForm({
    prefix: "campaign",
    surface: "campaign",
    editor: handlers.layoutEditor,
    panels: true,
    builtins: new Map([
      ["name", { control: name }],
      ["status", { control: status }],
      ["system", { control: system }],
      ["tags", { control: tags.element, id: "campaign-tags" }],
      ["description", { control: description }],
      ["initiativeExpression", { control: expression }]
    ]),
    descriptions: { details: "The basics of this campaign. Changes save as you type." },
    onOwnChange: () => {
      const read = details.read(shownFields);

      if (!read.error) {
        shownFields = read.values;
        handlers.onOwnFields(read.values);
      }
    }
  });
  const rolls = h("ol", { class: "roll-log", id: "campaign-rolls-list" });
  const counts = h("div", { class: "stat-row", id: "campaign-glance" });
  const secretsBox = h("input", { id: "campaign-export-secrets", type: "checkbox" });

  const header = h("div", { id: "campaign-header" });
  const nav = h("nav", { class: "subnav", "aria-label": "Campaign pages" });
  const overview = h(
    "div",
    { class: "stack", id: "campaign-overview" },
    details.element,
    section({ id: "campaign-glance-section", title: "At a glance" }, counts),
    section(
      { id: "campaign-share-section", title: "Share this campaign", description: "Export the campaign with its roster characters and files as one bundle. Anyone can import it from the Data page." },
      h("label", { class: "radio-row" }, secretsBox, h("span", { text: "Include secret notes and secret journal entries" })),
      button({ id: "campaign-export", icon: "download", label: "Export bundle", variant: "btn-small", onclick: () => handlers.onExport(secretsBox.checked) })
    ),
    section({ id: "campaign-rolls-section", title: "Recent rolls", description: "Rolls made for this campaign, such as initiative. Secret rolls are left out." }, rolls)
  );

  const roots = new Map(ROOTS.map((id) => [id, h("div", { id: `campaign-${id}`, hidden: true })]));
  replace(root, header, nav, overview, ...roots.values());

  let shownId = null;

  function setValue(element, value, force) {
    if ((force || document.activeElement !== element) && element.value !== value) {
      element.value = value;
    }
  }

  function drawNav(campaignId, sub) {
    if (!nav.children.length) {
      replace(nav, CAMPAIGN_PAGES.map((page) => h("a", { class: "subnav-link", "data-page": page.id, text: page.label })));
    }

    for (const link of nav.children) {
      link.href = routeHref("campaign", campaignId, link.dataset.page);

      if (link.dataset.page === sub) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }

  return {
    render(campaign, { layout = null, force: forced = false, sub = "overview", recentRolls = [] } = {}) {
      const force = forced || campaign.id !== shownId;
      shownId = campaign.id;

      if (!header.firstChild) {
        replace(
          header,
          pageHeader({
            title: "Campaign",
            subtitle: "Campaign",
            titleId: "campaign-title",
            back: { href: "#/library", label: "Library" },
            actions: [
              button({ id: "campaign-duplicate", icon: "copy", label: "Duplicate", onclick: handlers.onDuplicate }),
              button({ id: "campaign-delete", icon: "trash", label: "Delete", variant: "btn-danger-text", onclick: handlers.onDelete })
            ]
          })
        );
      }

      header.querySelector(".page-title").textContent = campaignName(campaign);
      header.querySelector(".page-subtitle").textContent = [CAMPAIGN_STATUS_LABELS[campaign.status], campaign.system].filter((part) => part.trim()).join(" · ") || "Campaign";

      drawNav(campaign.id, sub);
      overview.hidden = sub !== "overview";

      for (const [id, element] of roots) {
        element.hidden = sub !== id;
      }

      if (layout) {
        details.setLayout(layout);
      }

      setValue(name, campaign.name, force);
      setValue(system, campaign.system, force);
      setValue(status, campaign.status, true);
      setValue(description, campaign.description, force);
      setValue(expression, campaign.initiativeExpression, force);

      if (force || document.activeElement !== tags.input) {
        tags.set(campaign.tags);
      }

      shownFields = campaign.fields;
      details.write(campaign.fields, { keepFocus: !force });

      replace(
        counts,
        [["Roster", campaign.roster.length], ["Sessions", campaign.sessions.length], ["Handouts", campaign.handouts.length], ["Party columns", campaign.partyColumns.length]].map(([label, value]) =>
          h("div", { class: "stat" }, h("span", { class: "stat-label", text: label }), h("strong", { class: "stat-value", text: String(value) }))
        )
      );

      replace(
        rolls,
        recentRolls.length
          ? recentRolls.map(({ roll, text }) =>
              h("li", { class: "roll-entry" }, h("div", { class: "roll-entry-head" }, h("strong", { text: roll.label }), h("span", { class: "roll-entry-total", text: String(roll.total) })), h("p", { class: "roll-explain", text }))
            )
          : h("li", { class: "roll-empty", text: "No rolls for this campaign yet." })
      );

      return force;
    },
    focusName: () => name.focus()
  };
}
