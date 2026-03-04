/**
 * Server-side helpers for @whaletools/telemetry.
 * Works with Next.js API routes, Express, etc.
 *
 * Usage (Next.js App Router):
 *   import { withTelemetry } from '@whaletools/telemetry/server'
 *
 *   export const GET = withTelemetry(async (req) => {
 *     return Response.json({ ok: true })
 *   }, { apiKey: 'wk_live_...', storeId: '...' })
 */

const DEFAULT_ENDPOINT = "https://whale-gateway.fly.dev";

interface ServerConfig {
  apiKey: string;
  storeId: string;
  endpoint?: string;
  serviceName?: string;
  environment?: string;
}

interface AICallReport {
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
  parent_span_id?: string;
  attributes?: Record<string, unknown>;
}

interface ErrorReport {
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
async function serverFingerprint(
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

function parseServerStack(
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

/**
 * Wrap a Next.js App Router handler with error telemetry.
 * Catches unhandled errors, reports them, and re-throws.
 */
export function withTelemetry<T extends (...args: unknown[]) => Promise<Response>>(
  handler: T,
  config: ServerConfig,
): T {
  const wrapped = async (...args: unknown[]): Promise<Response> => {
    const start = Date.now();
    try {
      return await handler(...args);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const parsed = parseServerStack(err.stack || "");
      const fp = await serverFingerprint(
        err.name,
        err.message,
        `${parsed.file}:${parsed.line}:${parsed.func}`,
      );

      const report: ErrorReport = {
        error_type: err.name || "Error",
        error_message: err.message.slice(0, 1000),
        stack_trace: (err.stack || "").slice(0, 8000),
        fingerprint: fp,
        severity: "error",
        source_file: parsed.file,
        source_line: parsed.line,
        source_function: parsed.func,
        tags: {
          environment: config.environment || "production",
          service: config.serviceName || "store_server",
        },
        extra: { handler: "api_route", duration_ms: Date.now() - start },
        breadcrumbs: [],
        occurred_at: new Date().toISOString(),
        platform: "node",
      };

      // Fire-and-forget to gateway
      const endpoint = config.endpoint || DEFAULT_ENDPOINT;
      const url = `${endpoint}/v1/stores/${config.storeId}/telemetry/ingest`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({
          session: {
            session_id: "",
            visitor_id: "server",
            started_at: new Date(start).toISOString(),
            page_url: "",
            referrer: "",
            user_agent: "",
            screen_width: 0,
            screen_height: 0,
            device: "server",
            language: "en",
          },
          errors: [report],
          events: [],
          vitals: [],
          ai_calls: [],
        }),
      }).catch(() => {});

      throw error; // Re-throw so Next.js can handle the error
    }
  };

  return wrapped as T;
}

/**
 * Send a server-side error to WhaleTools telemetry.
 * Use in catch blocks where withTelemetry isn't applicable.
 */
export async function reportServerError(
  error: Error,
  config: ServerConfig,
  extra?: Record<string, unknown>,
): Promise<void> {
  const parsed = parseServerStack(error.stack || "");
  const fp = await serverFingerprint(
    error.name,
    error.message,
    `${parsed.file}:${parsed.line}:${parsed.func}`,
  );

  const report: ErrorReport = {
    error_type: error.name || "Error",
    error_message: error.message.slice(0, 1000),
    stack_trace: (error.stack || "").slice(0, 8000),
    fingerprint: fp,
    severity: "error",
    source_file: parsed.file,
    source_line: parsed.line,
    source_function: parsed.func,
    tags: {
      environment: config.environment || "production",
      service: config.serviceName || "store_server",
    },
    extra: extra || {},
    breadcrumbs: [],
    occurred_at: new Date().toISOString(),
    platform: "node",
  };

  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  const url = `${endpoint}/v1/stores/${config.storeId}/telemetry/ingest`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify({
      session: {
        session_id: "",
        visitor_id: "server",
        started_at: new Date().toISOString(),
        page_url: "",
        referrer: "",
        user_agent: "",
        screen_width: 0,
        screen_height: 0,
        device: "server",
        language: "en",
      },
      errors: [report],
      events: [],
      vitals: [],
      ai_calls: [],
    }),
  }).catch(() => {});
}

/**
 * Report an AI/LLM API call to WhaleTools telemetry from server-side code.
 * Feeds ClickHouse token_usage_hourly and function_health materialized views.
 *
 * @example
 * import { reportAICall } from '@neowhale/telemetry/server'
 *
 * const start = Date.now();
 * const response = await openai.chat.completions.create({ model: 'gpt-4o', ... });
 * await reportAICall({
 *   model: 'gpt-4o',
 *   provider: 'openai',
 *   prompt_tokens: response.usage?.prompt_tokens,
 *   completion_tokens: response.usage?.completion_tokens,
 *   duration_ms: Date.now() - start,
 *   status: 'ok',
 * }, config);
 */
export async function reportAICall(
  call: AICallReport,
  config: ServerConfig,
): Promise<void> {
  const payload = {
    ...call,
    total_tokens: call.total_tokens ?? ((call.prompt_tokens || 0) + (call.completion_tokens || 0)),
    status: call.status || "ok",
    timestamp: new Date().toISOString(),
  };

  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  const url = `${endpoint}/v1/stores/${config.storeId}/telemetry/ingest`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify({
      session: {
        session_id: "",
        visitor_id: "server",
        started_at: new Date().toISOString(),
        page_url: "",
        referrer: "",
        user_agent: "",
        screen_width: 0,
        screen_height: 0,
        device: "server",
        language: "en",
      },
      errors: [],
      events: [],
      vitals: [],
      ai_calls: [payload],
    }),
  }).catch(() => {});
}

/**
 * Report a batch of AI/LLM calls at once. Useful for batch processing pipelines.
 */
export async function reportAICallBatch(
  calls: AICallReport[],
  config: ServerConfig,
): Promise<void> {
  const payloads = calls.map((call) => ({
    ...call,
    total_tokens: call.total_tokens ?? ((call.prompt_tokens || 0) + (call.completion_tokens || 0)),
    status: call.status || "ok",
    timestamp: new Date().toISOString(),
  }));

  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  const url = `${endpoint}/v1/stores/${config.storeId}/telemetry/ingest`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify({
      session: {
        session_id: "",
        visitor_id: "server",
        started_at: new Date().toISOString(),
        page_url: "",
        referrer: "",
        user_agent: "",
        screen_width: 0,
        screen_height: 0,
        device: "server",
        language: "en",
      },
      errors: [],
      events: [],
      vitals: [],
      ai_calls: payloads,
    }),
  }).catch(() => {});
}
