import { recapText } from "../campaigns.js";
import { markdownElement } from "../ui/markdown.js";
import { openViewerDialog } from "../ui/viewerDialog.js";
import { HEAD_BYTES, checkHandout, cleanFileName } from "../files.js";
import { evaluateFormulaText } from "../party.js";
import { routeHref } from "../views.js";
import { button, h } from "../ui/dom.js";

function nameOf(store, characterId) {
  return store.getCharacter(characterId)?.name?.trim() || "Unnamed character";
}

/**
 * What a descriptor cannot say about each campaign record (K-3): the roster's character picker, a session's
 * attendees and recap, handouts' upload and preview, and the party columns' formula check. Same shape as the
 * character hooks in `recordKinds.js`.
 */
export function createCampaignKindUi({ store, storage, router, toast, bus, blobUrls, currentId, room: checkRoom }) {
  function memberOptions(node, campaign, selected) {
    node.replaceChildren();

    for (const row of campaign?.roster ?? []) {
      const option = h("option", { value: row.characterId, text: nameOf(store, row.characterId) });
      option.selected = selected.includes(row.characterId);
      node.append(option);
    }
  }

  async function addHandouts(files) {
    const id = currentId();
    let added = 0;

    for (const file of files) {
      const campaign = store.getCampaign(id);
      const name = cleanFileName(file.name);

      if (!campaign) {
        return;
      }

      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      const verdict = checkHandout({ size: file.size, head }, { count: campaign.handouts.length });

      if (!verdict.ok) {
        toast(`${name}: ${verdict.reason}`, { tone: "error" });
        continue;
      }

      const room = await checkRoom(file.size);

      if (!room.ok) {
        toast(room.message, { tone: "error" });
        break;
      }

      try {
        const type = verdict.kind === "pdf" ? "application/pdf" : `image/${verdict.kind === "jpeg" ? "jpeg" : verdict.kind}`;
        const meta = await storage.putBlob({ type, data: new Blob([file], { type }) });
        const handout = store.addCampaignRecord(id, "handouts", { blobId: meta.id, name, size: file.size, kind: verdict.kind === "pdf" ? "pdf" : "image" });

        if (!handout) {
          await storage.deleteBlobs([meta.id]);
          toast(`${name}: this campaign cannot hold more handouts.`, { tone: "error" });
          continue;
        }

        added += 1;
      } catch {
        toast(`${name} could not be saved. The device may be out of space.`, { tone: "error" });
      }
    }

    if (added) {
      toast(added === 1 ? "Handout added." : `${added} handouts added.`);
    }
  }

  async function open(record, { download = false } = {}) {
    if (record.kind === "pdf" && !download) {
      const stored = await storage.getBlob(record.blobId);

      if (stored) {
        await openViewerDialog({ title: record.name, blob: stored.data, onDownload: () => open(record, { download: true }) });
        return;
      }
    }

    await blobUrls.ensure([record.blobId]);
    const url = blobUrls.peek(record.blobId);

    if (!url) {
      toast("That file is missing from this device.", { tone: "error" });
      return;
    }

    if (download) {
      const link = document.createElement("a");
      link.href = url;
      link.download = record.name;
      document.body.append(link);
      link.click();
      link.remove();
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  const kinds = {
    roster: {
      description: "Who plays in this campaign, and what part each character has.",
      title: (record) => (record.characterId ? nameOf(store, record.characterId) : ""),
      summary: (record) => [record.role, record.status, record.joinedAt ? `joined ${record.joinedAt}` : ""].filter(Boolean).join(" · "),
      rowControls: (record) =>
        store.getCharacter(record.characterId)
          ? h("a", { class: "btn btn-small", href: routeHref("character", record.characterId), "aria-label": `Open ${nameOf(store, record.characterId)}`, text: "Open" })
          : null,
      formExtras: [
        {
          label: "Character",
          hint: "Pick from your library. A character can be in many campaigns.",
          build: () => h("select", { id: "rec-roster-character", class: "input" }),
          read: (node) => ({ characterId: node.value || null }),
          write(node, record, view) {
            node.dataset.self = record?.characterId ?? "";
            this.refresh(node, view.records);
            node.value = record?.characterId ?? "";
          },
          refresh(node, records) {
            const self = node.dataset.self || null;
            const chosen = node.value;
            node.replaceChildren(h("option", { value: "", text: "Choose a character" }));

            for (const character of store.getState().characters) {
              if (character.id === self || !records.some((row) => row.characterId === character.id)) {
                node.append(h("option", { value: character.id, text: character.name || "Unnamed character" }));
              }
            }

            node.value = [...node.options].some((option) => option.value === chosen) ? chosen : "";
          }
        }
      ]
    },
    sessions: {
      description: "What happened, and who was there. Notes are plain text.",
      manualOrder: false,
      sort: (records) => [...records].sort((left, right) => (right.date || "").localeCompare(left.date || "")),
      summary: (record) => [record.date, record.attendeeIds.length ? record.attendeeIds.map((id) => nameOf(store, id)).join(", ") : ""].filter(Boolean).join(" · "),
      detail: (record) =>
        h(
          "div",
          {},
          record.notes ? markdownElement(record.notes) : null,
          record.secretNotes ? h("p", { class: "record-text", text: `Secret: ${record.secretNotes}` }) : null
        ),
      rowControls: (record, { character: campaign }) =>
        button({
          label: "Copy recap",
          ariaLabel: `Copy recap: ${record.title}`,
          variant: "btn-small",
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(recapText(campaign, record, store.getState().characters));
              toast("Recap copied. It leaves out secret notes.");
            } catch {
              toast("The recap could not be copied.", { tone: "error" });
            }
          }
        }),
      formExtras: [
        {
          label: "Who was there",
          hint: "Choose from the roster; hold Ctrl or Shift for several.",
          build: () => h("select", { id: "rec-sessions-attendees", class: "input", multiple: true, size: 5 }),
          read: (node) => ({ attendeeIds: [...node.selectedOptions].map((option) => option.value) }),
          write(node, record, view) {
            memberOptions(node, view.character, record?.attendeeIds ?? []);
          },
          refresh(node, records, campaign) {
            memberOptions(node, campaign, [...node.selectedOptions].map((option) => option.value));
          }
        }
      ]
    },
    handouts: {
      description: "Images and PDFs the table should see.",
      noAdd: true,
      detail(record) {
        if (record.kind !== "image") {
          return h("p", { class: "field-hint", text: "PDF" });
        }

        const url = blobUrls.peek(record.blobId);

        if (!url) {
          blobUrls.ensure([record.blobId]).then((loaded) => loaded && bus.emit("records:refresh"));
          return null;
        }

        return h("img", { class: "handout-image", src: url, alt: record.name, loading: "lazy" });
      },
      rowControls: (record) => [
        button({ label: "Open", ariaLabel: `Open ${record.name}`, variant: "btn-small", onclick: () => open(record) }),
        button({ label: "Download", ariaLabel: `Download ${record.name}`, variant: "btn-small", onclick: () => open(record, { download: true }) })
      ],
      top() {
        const input = h("input", {
          id: "handout-input",
          type: "file",
          multiple: true,
          accept: "image/png,image/jpeg,image/webp,image/gif,application/pdf",
          hidden: true,
          onchange: (event) => {
            const files = [...event.target.files];
            event.target.value = "";
            addHandouts(files);
          }
        });

        return h("div", { class: "toolbar" }, button({ id: "handout-add", icon: "plus", label: "Add files", variant: "btn-primary", onclick: () => input.click() }), input, h("span", { class: "field-hint", text: "Images and PDFs, up to 25 MB each." }));
      }
    },
    partyColumns: {
      description: "The sheet values the Party page shows for each character.",
      summary: (record) => record.ref
    }
  };

  return {
    kinds,
    check(kindId, fields, editingId, records) {
      if (kindId === "roster") {
        if (!fields.characterId) {
          return { ok: false, reason: "Choose a character" };
        }

        if (records.some((row) => row.characterId === fields.characterId && row.id !== editingId)) {
          return { ok: false, reason: "That character is already on the roster" };
        }
      }

      if (kindId === "partyColumns") {
        const verdict = evaluateFormulaText(fields.ref);

        if (!verdict.ok) {
          return verdict;
        }
      }

      return { ok: true };
    },
    prepare(kindId, fields) {
      return kindId === "roster" && !fields.role.trim() ? { ...fields, role: "Player character" } : fields;
    }
  };
}
