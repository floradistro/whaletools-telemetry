// ============================================================================
// Configuration
// ============================================================================

export interface WhaleToolsConfig {
  /** API key (wk_live_... or wk_test_...) */
  apiKey: string;
  /** Store UUID */
  storeId: string;
  /** Gateway endpoint (defaults to https://whale-gateway.fly.dev) */
  endpoint?: string;
  /** Enable error tracking (default: true) */
  errors?: boolean;
  /** Enable analytics / page views (default: true) */
  analytics?: boolean;
  /** Enable Web Vitals collection (default: true) */
  vitals?: boolean;
  /** Enable breadcrumb collection (default: true) */
  breadcrumbs?: boolean;
  /** Environment tag (default: "production") */
  environment?: string;
  /** Service name tag (default: "store_client") */
  serviceName?: string;
  /** Service version tag */
  serviceVersion?: string;
  /** Flush interval in ms (default: 5000) */
  flushInterval?: number;
  /** Max items before auto-flush (default: 10) */
  flushThreshold?: number;
  /** Debug mode — logs to console (default: false) */
  debug?: boolean;
  /** Sample rate 0-1 for analytics events (default: 1) */
  sampleRate?: number;
  /** Callback before sending errors — return false to drop */
  beforeSend?: (error: ErrorPayload) => ErrorPayload | false;
}

// ============================================================================
// Error Tracking
// ============================================================================

export interface ErrorPayload {
  error_type: string;
  error_message: string;
  stack_trace: string;
  fingerprint: string;
  severity: "debug" | "info" | "warning" | "error" | "fatal";
  source_file: string;
  source_line: number;
  source_function: string;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
  occurred_at: string;
  platform: string;
}

export interface Breadcrumb {
  timestamp: string;
  category: string;
  message: string;
  level: "debug" | "info" | "warning" | "error";
  data?: Record<string, unknown>;
}

// ============================================================================
// Analytics
// ============================================================================

export interface AnalyticsEvent {
  event_name: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

export interface WebVital {
  name: "CLS" | "FID" | "LCP" | "INP" | "TTFB" | "FCP";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  timestamp: string;
}

// ============================================================================
// AI / LLM Call Tracking
// ============================================================================

export interface AICallPayload {
  /** Model identifier (e.g. "gpt-4o", "claude-3-opus", "llama-3.1-70b") */
  model: string;
  /** Provider name (e.g. "openai", "anthropic", "google", "ollama") */
  provider?: string;
  /** Operation type (e.g. "chat.completion", "embeddings", "image.generation") */
  operation?: string;
  /** Input tokens consumed */
  prompt_tokens?: number;
  /** Output tokens generated */
  completion_tokens?: number;
  /** Total tokens (auto-calculated if omitted) */
  total_tokens?: number;
  /** Estimated cost in USD */
  cost?: number;
  /** Call duration in milliseconds */
  duration_ms?: number;
  /** Outcome */
  status?: "ok" | "error";
  /** Error message if status=error */
  error_message?: string;
  /** HTTP status code from the LLM API */
  http_status?: number;
  /** Agent/bot identifier for multi-agent systems */
  agent_id?: string;
  /** Conversation/thread identifier */
  conversation_id?: string;
  /** Tool or function name (for tool-use / function-calling) */
  tool_name?: string;
  /** Parent span ID for distributed tracing */
  parent_span_id?: string;
  /** Extra attributes */
  attributes?: Record<string, unknown>;
  /** Timestamp (auto-set if omitted) */
  timestamp?: string;
}

// ============================================================================
// Transport — Batch payload sent to gateway
// ============================================================================

export interface TelemetryBatch {
  session: SessionContext;
  user?: UserContext;
  errors: ErrorPayload[];
  events: AnalyticsEvent[];
  vitals: WebVital[];
  ai_calls: AICallPayload[];
}

export interface SessionContext {
  session_id: string;
  visitor_id: string;
  started_at: string;
  page_url: string;
  referrer: string;
  user_agent: string;
  screen_width: number;
  screen_height: number;
  device: string;
  language: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface UserContext {
  user_id: string;
  email?: string;
  name?: string;
  traits?: Record<string, unknown>;
}
