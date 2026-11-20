export const TAB_CHANNEL = "omniscribe-tabs";

const UNSAFE_STATUSES = new Set(["dirty", "saving", "error", "paused"]);

/**
 * What a tab should do when another tab saves. A tab with nothing unsaved can quietly reload from
 * storage; a tab with unsaved edits must ask, because loading would discard them.
 */
export function peerSaveAction({ dirty, status }) {
  return dirty || UNSAFE_STATUSES.has(status) ? "ask" : "reload";
}

export function createTabId() {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * One writer tab (P-11). Tabs announce themselves and tell each other when they save, so a tab can
 * learn that its in-memory copy is out of date. `channelFactory` is injected so this stays pure.
 */
export function createTabGuard({
  name = TAB_CHANNEL,
  channelFactory,
  id = createTabId(),
  onPeerPresent = () => {},
  onPeerSaved = () => {}
} = {}) {
  let channel = null;
  const peers = new Set();

  try {
    channel = channelFactory ? channelFactory(name) : null;
  } catch {
    channel = null;
  }

  function post(message) {
    try {
      channel?.postMessage({ ...message, from: id });
    } catch {
      return;
    }
  }

  function meet(from) {
    const isNew = !peers.has(from);
    peers.add(from);

    if (isNew) {
      onPeerPresent(from);
    }

    return isNew;
  }

  if (channel) {
    channel.onmessage = (event) => {
      const message = event?.data;

      if (!message || typeof message !== "object" || typeof message.from !== "string" || message.from === id) {
        return;
      }

      if (message.type === "hello") {
        if (meet(message.from)) {
          post({ type: "here" });
        }
      } else if (message.type === "here") {
        meet(message.from);
      } else if (message.type === "saved") {
        peers.add(message.from);
        onPeerSaved(message.from, Number(message.at) || 0);
      } else if (message.type === "bye") {
        peers.delete(message.from);
      }
    };
  }

  return {
    id,
    supported: Boolean(channel),
    peerCount: () => peers.size,
    announce: () => post({ type: "hello" }),
    notifySaved: (at = Date.now()) => post({ type: "saved", at }),
    close() {
      post({ type: "bye" });

      try {
        channel?.close();
      } catch {
        return;
      }
    }
  };
}
