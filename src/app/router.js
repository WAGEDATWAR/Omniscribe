import { parseRoute } from "../views.js";

export function createRouter(win = window) {
  const listeners = new Set();
  let route = parseRoute(win.location.hash);
  let started = false;

  function handle() {
    route = parseRoute(win.location.hash);

    for (const listener of [...listeners]) {
      listener(route, { initial: !started });
    }

    started = true;
  }

  return {
    current: () => route,
    onRoute(listener) {
      listeners.add(listener);
    },
    navigate(href) {
      if (win.location.hash === href) {
        handle();
      } else {
        win.location.hash = href;
      }
    },
    start() {
      win.addEventListener("hashchange", handle);
      handle();
    }
  };
}
