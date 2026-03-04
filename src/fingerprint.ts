/**
 * Error fingerprinting — SHA-256 hash of normalized (errorType | message | source).
 * Same algorithm as supabase/functions/_shared/error-logger.ts
 */

/** Normalize a message to group similar errors. */
export function normalizeMessage(msg: string): string {
  return msg
    // UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>")
    // URLs
    .replace(/https?:\/\/[^\s)]+/g, "<URL>")
    // Emails
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, "<EMAIL>")
    // IPs
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<IP>")
    // Numbers (standalone)
    .replace(/\b\d{3,}\b/g, "<N>")
    // Quoted strings
    .replace(/"[^"]{4,}"/g, '"<STR>"')
    .replace(/'[^']{4,}'/g, "'<STR>'");
}

/** Compute SHA-256 fingerprint for an error. */
export async function computeFingerprint(
  errorType: string,
  errorMessage: string,
  sourceLocation: string,
): Promise<string> {
  const normalized = normalizeMessage(errorMessage);
  const input = `${errorType}|${normalized}|${sourceLocation}`;

  // Use SubtleCrypto in browser, fall back to basic hash
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback: simple djb2 hash (for environments without SubtleCrypto)
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Parse a stack trace string into source location info. */
export function parseStack(stack: string): {
  file: string;
  line: number;
  func: string;
} {
  if (!stack) return { file: "", line: 0, func: "" };

  const lines = stack.split("\n");
  // Find first meaningful stack frame (skip Error: message line)
  for (const line of lines) {
    const match = line.match(
      /at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):\d+)\)?/,
    );
    if (match) {
      return {
        func: match[1] || "<anonymous>",
        file: match[2] || "",
        line: parseInt(match[3] || "0", 10),
      };
    }
  }
  return { file: "", line: 0, func: "" };
}
