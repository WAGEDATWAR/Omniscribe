export const SAVE_DELAY_MS = 400;
export const RETRY_DELAY_MS = 3000;

/**
 * Debounced autosave over the store's dirty set (P-4, P-10). Status is one of `saved`, `dirty`,
 * `saving`, `error` or `paused`. `save(batch)` is injected and must reject on failure; the batch is
 * then put back so nothing is lost.
 */
export function createAutosave({
  store,
  save,
  delay = SAVE_DELAY_MS,
  retryDelay = RETRY_DELAY_MS,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
  onStatus = () => {}
}) {
  let status = "saved";
  let timer = null;
  let inflight = null;
  let paused = false;
  let unsubscribe = null;

  function setStatus(next) {
    if (next !== status) {
      status = next;
      onStatus(status);
    }
  }

  function arm(ms) {
    if (timer !== null) {
      cancel(timer);
    }

    timer = schedule(() => {
      timer = null;
      flush();
    }, ms);
  }

  async function flush() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }

    if (paused) {
      return;
    }

    if (inflight) {
      await inflight;
      return flush();
    }

    if (!store.hasDirty()) {
      setStatus("saved");
      return;
    }

    const batch = store.takeDirty();
    setStatus("saving");

    inflight = Promise.resolve()
      .then(() => save(batch))
      .then(
        () => {
          inflight = null;

          if (store.hasDirty()) {
            setStatus("dirty");

            if (!paused) {
              arm(delay);
            }
          } else {
            setStatus("saved");
          }
        },
        () => {
          inflight = null;
          store.restoreDirty(batch);
          setStatus("error");

          if (!paused) {
            arm(retryDelay);
          }
        }
      );

    await inflight;
  }

  return {
    start() {
      unsubscribe = store.subscribe(({ type }) => {
        if (type === "ui" || !store.hasDirty()) {
          return;
        }

        setStatus(paused ? "paused" : "dirty");

        if (!paused) {
          arm(delay);
        }
      });
    },
    flush,
    pause() {
      paused = true;

      if (timer !== null) {
        cancel(timer);
        timer = null;
      }

      setStatus("paused");
    },
    resume() {
      paused = false;

      if (store.hasDirty()) {
        setStatus("dirty");
        arm(0);
      } else {
        setStatus("saved");
      }
    },
    status: () => status,
    isPaused: () => paused,
    dispose() {
      unsubscribe?.();

      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
    }
  };
}
