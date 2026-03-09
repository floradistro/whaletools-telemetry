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

// Re-export types, AI call reporters, and trace context utilities
export type { ServerConfig, AICallReport, ErrorReport, TraceContext } from "./server-types.js";
export {
  createTraceContext,
  toTraceparentHeader,
  parseTraceparentHeader,
} from "./server-types.js";
export { reportAICall, reportAICallBatch } from "./server-ai.js";

import type { ServerConfig, ErrorReport, TraceContext } from "./server-types.js";
import {
  serverFingerprint,
  parseServerStack,
  buildServerSession,
  buildIngestUrl,
  createTraceContext,
  parseTraceparentHeader,
} from "./server-types.js";

/** Options for withTelemetry wrapper. */
export interface WithTelemetryOptions {
  /** Incoming trace context to propagate. When omitted, the wrapper attempts
   *  to parse a `traceparent` header from the request. */
  traceContext?: TraceContext;
}

/**
 * Wrap a Next.js App Router handler with error telemetry and trace propagation.
 * Catches unhandled errors, reports them with trace context, and re-throws.
 *
 * Trace context resolution order:
 * 1. Explicit `options.traceContext` if provided
 * 2. Parsed from the request's `traceparent` header (W3C standard)
 * 3. A fresh root context generated automatically
 */
export function withTelemetry<T extends (...args: unknown[]) => Promise<Response>>(
  handler: T,
  config: ServerConfig,
  options?: WithTelemetryOptions,
): T {
  const wrapped = async (...args: unknown[]): Promise<Response> => {
    // Resolve trace context
    let traceCtx = options?.traceContext;
    if (!traceCtx) {
      // Attempt to extract traceparent from request if the first arg is a Request
      const maybeRequest = args[0];
      if (maybeRequest && typeof (maybeRequest as Request).headers?.get === "function") {
        const traceparent = (maybeRequest as Request).headers.get("traceparent");
        if (traceparent) {
          const parsed = parseTraceparentHeader(traceparent);
          if (parsed) {
            traceCtx = createTraceContext(parsed);
          }
        }
      }
    }
    if (!traceCtx) {
      traceCtx = createTraceContext();
    }

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
        extra: {
          handler: "api_route",
          duration_ms: Date.now() - start,
          trace_id: traceCtx.traceId,
          span_id: traceCtx.spanId,
          parent_span_id: traceCtx.parentSpanId,
        },
        breadcrumbs: [],
        occurred_at: new Date().toISOString(),
        platform: "node",
      };

      // Fire-and-forget to gateway
      const url = buildIngestUrl(config);
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({
          session: buildServerSession(new Date(start).toISOString()),
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
 *
 * Accepts an optional TraceContext to correlate the error within a trace tree.
 */
export async function reportServerError(
  error: Error,
  config: ServerConfig,
  extra?: Record<string, unknown>,
  traceContext?: TraceContext,
): Promise<void> {
  const parsed = parseServerStack(error.stack || "");
  const fp = await serverFingerprint(
    error.name,
    error.message,
    `${parsed.file}:${parsed.line}:${parsed.func}`,
  );

  const traceExtra: Record<string, unknown> = {};
  if (traceContext) {
    traceExtra.trace_id = traceContext.traceId;
    traceExtra.span_id = traceContext.spanId;
    traceExtra.parent_span_id = traceContext.parentSpanId;
  }

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
    extra: { ...extra, ...traceExtra },
    breadcrumbs: [],
    occurred_at: new Date().toISOString(),
    platform: "node",
  };

  const url = buildIngestUrl(config);

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify({
      session: buildServerSession(),
      errors: [report],
      events: [],
      vitals: [],
      ai_calls: [],
    }),
  }).catch(() => {});
}
