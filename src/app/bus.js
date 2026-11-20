/** A tiny event bus so controllers never import each other (A-9). */
export function createBus() {
  const handlers = new Map();

  return {
    on(name, handler) {
      if (!handlers.has(name)) {
        handlers.set(name, new Set());
      }

      handlers.get(name).add(handler);
      return () => handlers.get(name).delete(handler);
    },
    emit(name, payload) {
      for (const handler of [...(handlers.get(name) ?? [])]) {
        handler(payload);
      }
    }
  };
}
