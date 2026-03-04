/**
 * Core WhaleTools telemetry client.
 * Orchestrates error capture, analytics, Web Vitals, breadcrumbs, and transport.
 */

import type {
  WhaleToolsConfig,
  ErrorPayload,
  AnalyticsEvent,
  WebVital,
  AICallPayload,
  SessionContext,
  UserContext,
} from "./types.js";
import { computeFingerprint, parseStack } from "./fingerprint.js";
import {
  getVisitorId,
  getSessionId,
  getSessionStartedAt,
  detectDevice,
  getUtmParams,
} from "./session.js";
import {
  addBreadcrumb,
  getBreadcrumbs,
  installBreadcrumbs,
} from "./breadcrumbs.js";
import { Transport } from "./transport.js";

const DEFAULT_ENDPOINT = "https://whale-gateway.fly.dev";

export class WhaleToolsClient {
  private config: Required<
    Pick<
      WhaleToolsConfig,
      | "apiKey"
      | "storeId"
      | "endpoint"
      | "environment"
      | "serviceName"
      | "flushInterval"
      | "flushThreshold"
      | "debug"
      | "sampleRate"
    >
  > & { serviceVersion: string };
  private transport: Transport;
  private user: UserContext | undefined;
  private initialized = false;
  private beforeSend?: WhaleToolsConfig["beforeSend"];

  constructor() {
    // Defaults — overridden by init()
    this.config = {
      apiKey: "",
      storeId: "",
      endpoint: DEFAULT_ENDPOINT,
      environment: "production",
      serviceName: "store_client",
      serviceVersion: "",
      flushInterval: 5000,
      flushThreshold: 10,
      debug: false,
      sampleRate: 1,
    };
    this.transport = new Transport({
      apiKey: "",
      storeId: "",
      endpoint: DEFAULT_ENDPOINT,
      flushInterval: 5000,
      flushThreshold: 10,
      debug: false,
      getSession: () => this.getSessionContext(),
      getUser: () => this.user,
    });
  }

  init(config: WhaleToolsConfig): void {
    if (this.initialized) return;
    this.initialized = true;

    this.config = {
      apiKey: config.apiKey,
      storeId: config.storeId,
      endpoint: config.endpoint || DEFAULT_ENDPOINT,
      environment: config.environment || "production",
      serviceName: config.serviceName || "store_client",
      serviceVersion: config.serviceVersion || "",
      flushInterval: config.flushInterval || 5000,
      flushThreshold: config.flushThreshold || 10,
      debug: config.debug || false,
      sampleRate: config.sampleRate ?? 1,
    };

    this.beforeSend = config.beforeSend;

    this.transport = new Transport({
      apiKey: this.config.apiKey,
      storeId: this.config.storeId,
      endpoint: this.config.endpoint,
      flushInterval: this.config.flushInterval,
      flushThreshold: this.config.flushThreshold,
      debug: this.config.debug,
      getSession: () => this.getSessionContext(),
      getUser: () => this.user,
    });

    // Install auto-capture
    if (typeof window !== "undefined") {
      if (config.breadcrumbs !== false) installBreadcrumbs();
      if (config.errors !== false) this.installErrorHandlers();
      if (config.analytics !== false) this.installPageTracking();
      if (config.vitals !== false) this.installWebVitals();
    }

    this.transport.start();

    if (this.config.debug) {
      console.log("[whaletools] initialized", {
        storeId: this.config.storeId,
        endpoint: this.config.endpoint,
      });
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /** Manually capture an error. */
  async captureError(
    error: Error | string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const err = typeof error === "string" ? new Error(error) : error;
    const payload = await this.buildErrorPayload(err, "error", extra);
    if (!payload) return;
    this.transport.queueError(payload);
  }

  /** Capture a message as an error event. */
  async captureMessage(
    message: string,
    severity: ErrorPayload["severity"] = "info",
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const err = new Error(message);
    const payload = await this.buildErrorPayload(err, severity, extra);
    if (!payload) return;
    this.transport.queueError(payload);
  }

  /** Track a custom analytics event. */
  track(eventName: string, properties?: Record<string, unknown>): void {
    if (!this.shouldSample()) return;

    const event: AnalyticsEvent = {
      event_name: eventName,
      properties: {
        ...properties,
        page_url: typeof window !== "undefined" ? window.location.href : "",
        page_title:
          typeof document !== "undefined" ? document.title : "",
      },
      timestamp: new Date().toISOString(),
    };
    this.transport.queueEvent(event);
    addBreadcrumb("track", `${eventName}`, "info", properties);
  }

  /** Track a page view. */
  page(properties?: Record<string, unknown>): void {
    this.track("page_view", {
      page_url: typeof window !== "undefined" ? window.location.href : "",
      page_path:
        typeof window !== "undefined" ? window.location.pathname : "",
      page_title:
        typeof document !== "undefined" ? document.title : "",
      ...properties,
    });
  }

  /** Identify the current user. */
  identify(userId: string, traits?: Record<string, unknown>): void {
    this.user = {
      user_id: userId,
      email: traits?.email as string | undefined,
      name: traits?.name as string | undefined,
      traits,
    };

    this.track("identify", { user_id: userId, ...traits });
  }

  /**
   * Track an AI/LLM API call with token usage and cost.
   * Feeds ClickHouse token_usage_hourly and function_health materialized views.
   *
   * @example
   * whaletools.trackAICall({
   *   model: "gpt-4o",
   *   provider: "openai",
   *   operation: "chat.completion",
   *   prompt_tokens: 150,
   *   completion_tokens: 300,
   *   cost: 0.0045,
   *   duration_ms: 1200,
   *   status: "ok",
   * });
   */
  trackAICall(call: AICallPayload): void {
    const payload: AICallPayload = {
      ...call,
      total_tokens: call.total_tokens ?? ((call.prompt_tokens || 0) + (call.completion_tokens || 0)),
      status: call.status || "ok",
      timestamp: call.timestamp || new Date().toISOString(),
    };
    this.transport.queueAICall(payload);
    addBreadcrumb("ai_call", `${call.provider || "unknown"}/${call.model} (${payload.total_tokens} tokens)`, "info", {
      model: call.model,
      tokens: payload.total_tokens,
      cost: call.cost,
      duration_ms: call.duration_ms,
    });
  }

  /** Add a manual breadcrumb. */
  addBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    addBreadcrumb(category, message, "info", data);
  }

  /** Force flush all queued telemetry. */
  flush(): void {
    this.transport.flush();
  }

  /** Shut down the client. */
  destroy(): void {
    this.transport.stop();
    this.initialized = false;
  }

  // ===========================================================================
  // Internal: Error Handlers
  // ===========================================================================

  private installErrorHandlers(): void {
    // Global unhandled errors
    window.addEventListener("error", (event) => {
      if (event.error) {
        this.buildErrorPayload(event.error, "error").then((p) => {
          if (p) this.transport.queueError(p);
        });
      } else {
        // Script errors without error object
        this.buildErrorPayload(
          new Error(event.message || "Script error"),
          "error",
          {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          },
        ).then((p) => {
          if (p) this.transport.queueError(p);
        });
      }
    });

    // Unhandled promise rejections
    window.addEventListener("unhandledrejection", (event) => {
      const error =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason));
      this.buildErrorPayload(error, "error", {
        type: "unhandledrejection",
      }).then((p) => {
        if (p) this.transport.queueError(p);
      });
    });
  }

  // ===========================================================================
  // Internal: Page Tracking
  // ===========================================================================

  private installPageTracking(): void {
    // Track initial page load
    this.page();

    // Track SPA navigation via history
    const origPush = history.pushState;
    const self = this;
    history.pushState = function (...args) {
      origPush.apply(this, args);
      // Defer to let React update document.title
      setTimeout(() => self.page(), 50);
    };

    window.addEventListener("popstate", () => {
      setTimeout(() => this.page(), 50);
    });
  }

  // ===========================================================================
  // Internal: Web Vitals
  // ===========================================================================

  private installWebVitals(): void {
    if (typeof PerformanceObserver === "undefined") return;

    // Largest Contentful Paint
    this.observeVital("largest-contentful-paint", (entry) => {
      this.reportVital("LCP", entry.startTime);
    });

    // First Input Delay / Interaction to Next Paint
    this.observeVital("first-input", (entry) => {
      const fid = (entry as PerformanceEventTiming).processingStart - entry.startTime;
      this.reportVital("FID", fid);
    });

    // Cumulative Layout Shift
    let clsValue = 0;
    this.observeVital("layout-shift", (entry) => {
      if (!(entry as LayoutShiftEntry).hadRecentInput) {
        clsValue += (entry as LayoutShiftEntry).value;
      }
    });

    // Report CLS on visibility change (when user leaves page)
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && clsValue > 0) {
          this.reportVital("CLS", clsValue);
        }
      });
    }

    // First Contentful Paint
    this.observeVital("paint", (entry) => {
      if (entry.name === "first-contentful-paint") {
        this.reportVital("FCP", entry.startTime);
      }
    });
  }

  private observeVital(
    type: string,
    callback: (entry: PerformanceEntry) => void,
  ): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          callback(entry);
        }
      });
      observer.observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {
      // Observer not supported for this type
    }
  }

  private reportVital(
    name: WebVital["name"],
    value: number,
  ): void {
    const rating = this.rateVital(name, value);
    const vital: WebVital = {
      name,
      value: Math.round(value * 1000) / 1000,
      rating,
      timestamp: new Date().toISOString(),
    };
    this.transport.queueVital(vital);

    if (this.config.debug) {
      console.log(`[whaletools] vital ${name}=${vital.value} (${rating})`);
    }
  }

  private rateVital(
    name: string,
    value: number,
  ): "good" | "needs-improvement" | "poor" {
    // Thresholds from web.dev
    const thresholds: Record<string, [number, number]> = {
      CLS: [0.1, 0.25],
      FID: [100, 300],
      LCP: [2500, 4000],
      INP: [200, 500],
      TTFB: [800, 1800],
      FCP: [1800, 3000],
    };
    const [good, poor] = thresholds[name] || [1000, 3000];
    if (value <= good) return "good";
    if (value <= poor) return "needs-improvement";
    return "poor";
  }

  // ===========================================================================
  // Internal: Helpers
  // ===========================================================================

  private async buildErrorPayload(
    error: Error,
    severity: ErrorPayload["severity"],
    extra?: Record<string, unknown>,
  ): Promise<ErrorPayload | null> {
    const stack = error.stack || "";
    const parsed = parseStack(stack);

    const fingerprint = await computeFingerprint(
      error.name || "Error",
      error.message || "Unknown error",
      `${parsed.file}:${parsed.line}:${parsed.func}`,
    );

    let payload: ErrorPayload = {
      error_type: error.name || "Error",
      error_message: (error.message || "Unknown error").slice(0, 1000),
      stack_trace: stack.slice(0, 8000),
      fingerprint,
      severity,
      source_file: parsed.file,
      source_line: parsed.line,
      source_function: parsed.func,
      tags: {
        environment: this.config.environment,
        service: this.config.serviceName,
      },
      extra: extra || {},
      breadcrumbs: getBreadcrumbs(),
      occurred_at: new Date().toISOString(),
      platform: typeof window !== "undefined" ? "browser" : "node",
    };

    if (this.config.serviceVersion) {
      payload.tags.version = this.config.serviceVersion;
    }

    // beforeSend hook
    if (this.beforeSend) {
      const result = this.beforeSend(payload);
      if (result === false) return null;
      payload = result;
    }

    return payload;
  }

  private getSessionContext(): SessionContext {
    const utm = getUtmParams();
    return {
      session_id: getSessionId(),
      visitor_id: getVisitorId(),
      started_at: getSessionStartedAt(),
      page_url:
        typeof window !== "undefined" ? window.location.href : "",
      referrer:
        typeof document !== "undefined" ? document.referrer : "",
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : "",
      screen_width:
        typeof screen !== "undefined" ? screen.width : 0,
      screen_height:
        typeof screen !== "undefined" ? screen.height : 0,
      device: detectDevice(),
      language:
        typeof navigator !== "undefined"
          ? navigator.language
          : "en",
      ...utm,
    };
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate;
  }
}

// Types used by PerformanceObserver
interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
}

interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}
