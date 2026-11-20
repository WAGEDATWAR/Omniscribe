import assert from "node:assert/strict";
import { test } from "node:test";
import { createTabGuard, peerSaveAction } from "../src/tabGuard.js";

function createBus() {
  const channels = [];

  return (name) => {
    const channel = {
      name,
      onmessage: null,
      postMessage(data) {
        for (const other of channels) {
          if (other !== channel) {
            other.onmessage?.({ data: JSON.parse(JSON.stringify(data)) });
          }
        }
      },
      close() {
        channels.splice(channels.indexOf(channel), 1);
      }
    };

    channels.push(channel);
    return channel;
  };
}

test("tabs discover each other and count peers", () => {
  const factory = createBus();
  const seen = [];
  const first = createTabGuard({ channelFactory: factory, id: "a", onPeerPresent: (id) => seen.push(`a sees ${id}`) });
  const second = createTabGuard({ channelFactory: factory, id: "b", onPeerPresent: (id) => seen.push(`b sees ${id}`) });

  second.announce();

  assert.equal(first.peerCount(), 1);
  assert.equal(second.peerCount(), 1);
  assert.deepEqual(seen.sort(), ["a sees b", "b sees a"]);
});

test("a save in one tab tells the others", () => {
  const factory = createBus();
  const events = [];
  createTabGuard({ channelFactory: factory, id: "a", onPeerSaved: (from, at) => events.push([from, at]) });
  const second = createTabGuard({ channelFactory: factory, id: "b" });

  second.notifySaved(1234);

  assert.deepEqual(events, [["b", 1234]]);
});

test("a tab ignores its own messages and malformed ones", () => {
  const factory = createBus();
  const events = [];
  const guard = createTabGuard({ channelFactory: factory, id: "a", onPeerSaved: () => events.push("saved") });
  const channel = factory("omniscribe-tabs");

  guard.notifySaved();
  channel.postMessage({ type: "saved", from: "a" });
  channel.postMessage("junk");
  channel.postMessage({ type: "saved" });

  assert.deepEqual(events, []);
});

test("closing announces a goodbye and forgets the peer", () => {
  const factory = createBus();
  const first = createTabGuard({ channelFactory: factory, id: "a" });
  const second = createTabGuard({ channelFactory: factory, id: "b" });

  second.announce();
  assert.equal(first.peerCount(), 1);

  second.close();
  assert.equal(first.peerCount(), 0);
});

test("without BroadcastChannel the guard is inert but safe", () => {
  const guard = createTabGuard({});

  assert.equal(guard.supported, false);
  assert.doesNotThrow(() => {
    guard.announce();
    guard.notifySaved();
    guard.close();
  });
});

test("a throwing channel factory degrades to inert", () => {
  const guard = createTabGuard({ channelFactory: () => { throw new Error("blocked"); } });

  assert.equal(guard.supported, false);
});

test("a clean tab reloads when a peer saves; an unsaved tab must ask", () => {
  assert.equal(peerSaveAction({ dirty: false, status: "saved" }), "reload");
  assert.equal(peerSaveAction({ dirty: true, status: "saved" }), "ask");

  for (const status of ["dirty", "saving", "error", "paused"]) {
    assert.equal(peerSaveAction({ dirty: false, status }), "ask");
  }
});
