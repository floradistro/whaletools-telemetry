/**
 * Breadcrumb collector — records click, navigation, console, and network events.
 * Maintains a ring buffer of the most recent 25 breadcrumbs.
 */

import type { Breadcrumb } from "./types.js";

const MAX_BREADCRUMBS = 25;
const breadcrumbs: Breadcrumb[] = [];
let installed = false;

export function addBreadcrumb(
  category: string,
  message: string,
  level: Breadcrumb["level"] = "info",
  data?: Record<string, unknown>,
): void {
  breadcrumbs.push({
    timestamp: new Date().toISOString(),
    category,
    message,
    level,
    data,
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

export function clearBreadcrumbs(): void {
  breadcrumbs.length = 0;
}

export function installBreadcrumbs(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Click breadcrumbs
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const tag = target.tagName?.toLowerCase();
      const text = target.textContent?.slice(0, 50) || "";
      const id = target.id ? `#${target.id}` : "";
      const cls = target.className
        ? `.${String(target.className).split(" ")[0]}`
        : "";
      addBreadcrumb("ui.click", `${tag}${id}${cls} "${text.trim()}"`, "info");
    },
    { capture: true, passive: true },
  );

  // Navigation breadcrumbs (SPA route changes)
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    addBreadcrumb("navigation", `${window.location.pathname}`, "info");
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    addBreadcrumb("navigation", `${window.location.pathname}`, "info");
  };

  window.addEventListener("popstate", () => {
    addBreadcrumb("navigation", `${window.location.pathname}`, "info");
  });

  // Console breadcrumbs (intercept console.warn/error)
  const origWarn = console.warn;
  console.warn = function (...args: unknown[]) {
    addBreadcrumb("console", String(args[0]).slice(0, 200), "warning");
    origWarn.apply(console, args);
  };

  const origError = console.error;
  console.error = function (...args: unknown[]) {
    addBreadcrumb("console", String(args[0]).slice(0, 200), "error");
    origError.apply(console, args);
  };

  // Fetch breadcrumbs
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = init?.method || "GET";
    const start = Date.now();
    try {
      const response = await origFetch.call(window, input, init);
      addBreadcrumb("http", `${method} ${url} [${response.status}]`, response.ok ? "info" : "warning", {
        duration_ms: Date.now() - start,
      });
      return response;
    } catch (err) {
      addBreadcrumb("http", `${method} ${url} [FAILED]`, "error", {
        duration_ms: Date.now() - start,
      });
      throw err;
    }
  };
}
