import { LIMITS } from "./limits.js";

/**
 * Bounded, session-only undo history over immutable snapshots. `record` is called with the state
 * from before a change; rapid changes that share a key coalesce into one step.
 */
export function createHistory({ limit = LIMITS.historySteps, coalesceMs = 800 } = {}) {
  let past = [];
  let future = [];
  let lastKey = null;
  let lastAt = 0;

  return {
    record(snapshot, { key = null, at = Date.now() } = {}) {
      future = [];

      if (key && key === lastKey && past.length && at - lastAt <= coalesceMs) {
        lastAt = at;
        return false;
      }

      past.push(snapshot);

      if (past.length > limit) {
        past = past.slice(past.length - limit);
      }

      lastKey = key;
      lastAt = at;
      return true;
    },
    undo(current) {
      if (!past.length) {
        return null;
      }

      future.push(current);
      lastKey = null;
      return past.pop();
    },
    redo(current) {
      if (!future.length) {
        return null;
      }

      past.push(current);
      lastKey = null;
      return future.pop();
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() {
      past = [];
      future = [];
      lastKey = null;
    }
  };
}
