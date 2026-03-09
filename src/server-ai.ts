/**
 * AI/LLM call reporting for @whaletools/telemetry server module.
 *
 * @example
 * import { reportAICall, createTraceContext } from '@neowhale/telemetry/server'
 *
 * const trace = createTraceContext();
 * const start = Date.now();
 * const response = await openai.chat.completions.create({ model: 'gpt-4o', ... });
 * await reportAICall({
 *   model: 'gpt-4o',
 *   provider: 'openai',
 *   prompt_tokens: response.usage?.prompt_tokens,
 *   completion_tokens: response.usage?.completion_tokens,
 *   duration_ms: Date.now() - start,
 *   status: 'ok',
 * }, config, trace);
 */

import type { AICallReport, ServerConfig, TraceContext } from "./server-types.js";
import { buildServerSession, buildIngestUrl, createTraceContext } from "./server-types.js";

/**
 * Report an AI/LLM API call to WhaleTools telemetry from server-side code.
 * Feeds ClickHouse token_usage_hourly and function_health materialized views.
 *
 * When a TraceContext is provided, trace_id/span_id/parent_span_id are attached
 * to the payload so the call can be correlated within a distributed trace tree.
 * If no context is given, trace fields from the AICallReport are used as-is.
 */
export async function reportAICall(
  call: AICallReport,
  config: ServerConfig,
  traceContext?: TraceContext,
): Promise<void> {
  const traceFields = traceContext
    ? {
        trace_id: traceContext.traceId,
        span_id: traceContext.spanId,
        parent_span_id: traceContext.parentSpanId,
      }
    : {};

  const payload = {
    ...call,
    ...traceFields,
    total_tokens: call.total_tokens ?? ((call.prompt_tokens || 0) + (call.completion_tokens || 0)),
    status: call.status || "ok",
    timestamp: new Date().toISOString(),
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
      errors: [],
      events: [],
      vitals: [],
      ai_calls: [payload],
    }),
  }).catch(() => {});
}

/**
 * Report a batch of AI/LLM calls at once. Useful for batch processing pipelines.
 *
 * When a parent TraceContext is provided, each call in the batch receives a
 * unique child span derived from that parent context.
 */
export async function reportAICallBatch(
  calls: AICallReport[],
  config: ServerConfig,
  parentContext?: TraceContext,
): Promise<void> {
  const payloads = calls.map((call) => {
    const traceFields = parentContext
      ? (() => {
          const child = createTraceContext(parentContext);
          return {
            trace_id: child.traceId,
            span_id: child.spanId,
            parent_span_id: child.parentSpanId,
          };
        })()
      : {};

    return {
      ...call,
      ...traceFields,
      total_tokens: call.total_tokens ?? ((call.prompt_tokens || 0) + (call.completion_tokens || 0)),
      status: call.status || "ok",
      timestamp: new Date().toISOString(),
    };
  });

  const url = buildIngestUrl(config);

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify({
      session: buildServerSession(),
      errors: [],
      events: [],
      vitals: [],
      ai_calls: payloads,
    }),
  }).catch(() => {});
}
