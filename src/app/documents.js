import { HEAD_BYTES, checkPdf, cleanFileName } from "../files.js";
import { createPdfViewer } from "../pdf/view.js";
import { mountDocumentsPage } from "../ui/documents.js";
import { displayName } from "../schema.js";

/** The PDF sheets page of a character: upload, list, rename, mark as the sheet, download, remove, view. */
export function initDocuments(ctx) {
  const { store, storage, router, toast, confirm } = ctx;
  let shown = null;
  let renderToken = 0;
  let checkedKey = null;
  let missing = new Set();

  function currentId() {
    const route = router.current();
    return route.view === "character" && route.sub === "pdf" ? route.id : null;
  }

  async function addFiles(files) {
    const id = currentId();
    let added = 0;

    for (const file of files) {
      const character = store.getCharacter(id);
      const name = cleanFileName(file.name);

      if (!character) {
        return;
      }

      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      const verdict = checkPdf({ size: file.size, head }, { count: character.documents.length });

      if (!verdict.ok) {
        toast(`${name}: ${verdict.reason}`, { tone: "error" });
        continue;
      }

      try {
        const meta = await storage.putBlob({ type: "application/pdf", data: new Blob([file], { type: "application/pdf" }) });
        const document = store.addDocument(id, { blobId: meta.id, name, size: file.size });

        if (!document) {
          await storage.deleteBlobs([meta.id]);
          toast(`${name}: this character cannot hold more documents.`, { tone: "error" });
          continue;
        }

        store.selectDocument(document.id);
        added += 1;
      } catch {
        toast(`${name} could not be saved. The device may be out of space.`, { tone: "error" });
      }
    }

    if (added) {
      toast(added === 1 ? "PDF added." : `${added} PDFs added.`);
    }
  }

  async function download(documentId) {
    const document = store.getCharacter(currentId())?.documents.find((item) => item.id === documentId);
    const record = document ? await storage.getBlob(document.blobId) : null;

    if (!record) {
      toast("That file is missing from this device.", { tone: "error" });
      return;
    }

    const url = URL.createObjectURL(record.data);
    const link = globalThis.document.createElement("a");

    link.href = url;
    link.download = document.name.toLowerCase().endsWith(".pdf") ? document.name : `${document.name}.pdf`;
    globalThis.document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function remove(documentId) {
    const id = currentId();
    const character = store.getCharacter(id);
    const document = character?.documents.find((item) => item.id === documentId);

    if (!document) {
      return;
    }

    const confirmed = await confirm({
      heading: `Remove ${document.name}?`,
      body: `This removes the PDF from ${displayName(character)}. The file is deleted from this device once nothing else uses it. You can undo it right after.`,
      confirmLabel: "Remove",
      danger: true
    });

    const removed = confirmed ? store.removeDocument(id, documentId) : null;

    if (removed) {
      toast(`Removed ${document.name}.`, { action: { label: "Undo", run: () => store.restoreDocument(id, removed) } });
    }
  }

  const view = mountDocumentsPage(document.querySelector("#character-pdf"), {
    onFiles: addFiles,
    onRename: (documentId, name) => store.renameDocument(currentId(), documentId, name),
    onSelect: (documentId) => store.selectDocument(documentId),
    onSheet(documentId) {
      const id = currentId();
      const isSheet = store.getCharacter(id)?.pdf.uploadedId === documentId;
      store.setSheetDocument(id, isSheet ? null : documentId);
    },
    onDownload: download,
    onRemove: remove
  });

  const viewer = createPdfViewer(view.viewerHost);

  async function render() {
    const id = currentId();

    if (!id) {
      if (shown) {
        viewer.clear();
        shown = null;
      }

      checkedKey = null;
      return;
    }

    const character = store.getCharacter(id);

    if (!character) {
      return;
    }

    const token = ++renderToken;
    const { selectedDocumentId } = store.getUi();
    const selectedId = character.documents.some((item) => item.id === selectedDocumentId)
      ? selectedDocumentId
      : character.pdf.uploadedId ?? character.documents[0]?.id ?? null;
    const blobKey = `${id}|${character.documents.map((item) => item.blobId).join(",")}`;

    if (blobKey !== checkedKey) {
      const present = new Set((await storage.listBlobs()).map((blob) => blob.id));

      if (token !== renderToken) {
        return;
      }

      missing = new Set(character.documents.filter((item) => !present.has(item.blobId)).map((item) => item.blobId));
      checkedKey = blobKey;
    }

    view.render({ documents: character.documents, selectedId, sheetId: character.pdf.uploadedId, missing });

    const selected = character.documents.find((item) => item.id === selectedId);
    const key = selected && !missing.has(selected.blobId) ? `${selected.id}:${selected.blobId}` : null;

    if (key === shown) {
      return;
    }

    shown = key;

    if (!key) {
      viewer.clear();
      return;
    }

    const record = await storage.getBlob(selected.blobId);

    if (token === renderToken && shown === key && record) {
      viewer.show(record.data, { name: selected.name });
    }
  }

  router.onRoute(() => {
    checkedKey = null;
    render();
  });
  store.subscribe(() => render());
  ctx.bus.on("data:reloaded", () => {
    checkedKey = null;
    shown = null;
    render();
  });
}
