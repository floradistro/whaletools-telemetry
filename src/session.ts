/**
 * Session and visitor ID management.
 * Visitor ID persists across sessions (localStorage).
 * Session ID resets after 30 min inactivity.
 */

const VISITOR_KEY = "wt_vid";
const SESSION_KEY = "wt_sid";
const SESSION_TS_KEY = "wt_sts";
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function getVisitorId(): string {
  const storage = getStorage();
  if (storage) {
    let vid = storage.getItem(VISITOR_KEY);
    if (!vid) {
      vid = generateId();
      storage.setItem(VISITOR_KEY, vid);
    }
    return vid;
  }
  return generateId();
}

export function getSessionId(): string {
  const storage = getStorage();
  if (!storage) return generateId();

  const now = Date.now();
  const lastActivity = parseInt(storage.getItem(SESSION_TS_KEY) || "0", 10);
  let sid = storage.getItem(SESSION_KEY);

  // New session if expired or missing
  if (!sid || now - lastActivity > SESSION_TIMEOUT) {
    sid = generateId();
    storage.setItem(SESSION_KEY, sid);
  }

  storage.setItem(SESSION_TS_KEY, String(now));
  return sid;
}

export function getSessionStartedAt(): string {
  const storage = getStorage();
  if (storage) {
    const ts = storage.getItem(SESSION_TS_KEY);
    if (ts) return new Date(parseInt(ts, 10)).toISOString();
  }
  return new Date().toISOString();
}

/** Detect device type from user agent. */
export function detectDevice(): string {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}

/** Extract UTM params from URL. */
export function getUtmParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const val = params.get(key);
      if (val) utm[key] = val;
    }
    return utm;
  } catch {
    return {};
  }
}
