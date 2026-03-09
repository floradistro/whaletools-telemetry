/**
 * Types and helpers for @whaletools/telemetry server module.
 */

export const DEFAULT_ENDPOINT = "https://whale-gateway.fly.dev";

// ============================================================================
// Distributed Tracing
// ============================================================================

/** W3C-compatible trace context for distributed tracing correlation. */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

/** Generate a random hex string of the given byte length. */
function randomHex(bytes: number): string {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback for environments without Web Crypto
  let hex = "";
  for (let i = 0; i < bytes; i++) {
    hex += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return hex;
}

/**
 * Create a new trace context. If a parent context is provided, the new context
 * inherits the parent's traceId and sets parentSpanId to the parent's spanId.
 * Otherwise a fresh traceId is generated.
 */
export function createTraceContext(parent?: TraceContext): TraceContext {
  if (parent) {
    return {
      traceId: parent.traceId,
      spanId: randomHex(8),
      parentSpanId: parent.spanId,
    };
  }
  return {
    traceId: randomHex(16),
    spanId: randomHex(8),
  };
}

/**
 * Serialize a TraceContext into a W3C `traceparent` header value.
 * Format: `00-<traceId>-<spanId>-01`
 */
export function toTraceparentHeader(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-01`;
}

/**
 * Parse a W3C `traceparent` header into a TraceContext.
 * Returns null if the header is malformed.
 */
export function parseTraceparentHeader(header: string): TraceContext | null {
  const parts = header.split("-");
  if (parts.length < 4) return null;
  const [version, traceId, spanId] = parts;
  if (version !== "00") return null;
  if (traceId.length !== 32 || !/^[0-9a-f]{32}$/.test(traceId)) return null;
  if (spanId.length !== 16 || !/^[0-9a-f]{16}$/.test(spanId)) return null;
  return { traceId, spanId };
}

// ============================================================================
// Configuration
// ============================================================================

export interface ServerConfig {
  apiKey: string;
  storeId: string;
  endpoint?: string;
  serviceName?: string;
  environment?: string;
}

export interface AICallReport {
  model: string;
  provider?: string;
  operation?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  duration_ms?: number;
  status?: "ok" | "error";
  error_message?: string;
  http_status?: number;
  agent_id?: string;
  conversation_id?: string;
  tool_name?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  attributes?: Record<string, unknown>;
}

export interface ErrorReport {
  error_type: string;
  error_message: string;
  stack_trace: string;
  fingerprint: string;
  severity: string;
  source_file: string;
  source_line: number;
  source_function: string;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  breadcrumbs: never[];
  occurred_at: string;
  platform: string;
}

// Simple server-side fingerprint (no SubtleCrypto needed in Node 18+)
export async function serverFingerprint(
  type: string,
  message: string,
  source: string,
): Promise<string> {
  const input = `${type}|${message}|${source}`;
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const encoded = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(16, "0");
}

export function parseServerStack(
  stack: string,
): { file: string; line: number; func: string } {
  if (!stack) return { file: "", line: 0, func: "" };
  const lines = stack.split("\n");
  for (const line of lines) {
    const match = line.match(/at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):\d+)\)?/);
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

/** Build the server session envelope used by all telemetry ingestion calls. */
export function buildServerSession(startedAt?: string) {
  return {
    session_id: "",
    visitor_id: "server",
    started_at: startedAt || new Date().toISOString(),
    page_url: "",
    referrer: "",
    user_agent: "",
    screen_width: 0,
    screen_height: 0,
    device: "server",
    language: "en",
  };
}

/** Build the ingestion URL for a given config. */
export function buildIngestUrl(config: ServerConfig): string {
  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  return `${endpoint}/v1/stores/${config.storeId}/telemetry/ingest`;
}
