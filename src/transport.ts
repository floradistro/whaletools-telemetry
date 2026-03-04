/**
 * Batched HTTP transport to whale-gateway telemetry ingestion endpoint.
 * Batches errors, events, and vitals — flushes on interval, threshold, or page unload.
 */

import type {
  ErrorPayload,
  AnalyticsEvent,
  WebVital,
  AICallPayload,
  TelemetryBatch,
  SessionContext,
  UserContext,
} from "./types.js";

export interface TransportConfig {
  apiKey: string;
  storeId: string;
  endpoint: string;
  flushInterval: number;
  flushThreshold: number;
  debug: boolean;
  getSession: () => SessionContext;
  getUser: () => UserContext | undefined;
}

export class Transport {
  private errors: ErrorPayload[] = [];
  private events: AnalyticsEvent[] = [];
  private vitals: WebVital[] = [];
  private aiCalls: AICallPayload[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: TransportConfig;

  constructor(config: TransportConfig) {
    this.config = config;
  }

  start(): void {
    this.timer = setInterval(() => this.flush(), this.config.flushInterval);

    // Flush on page unload
    if (typeof window !== "undefined") {
      const onUnload = () => this.flush(true);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") onUnload();
      });
      window.addEventListener("pagehide", onUnload);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush(true);
  }

  queueError(error: ErrorPayload): void {
    this.errors.push(error);
    this.checkThreshold();
  }

  queueEvent(event: AnalyticsEvent): void {
    this.events.push(event);
    this.checkThreshold();
  }

  queueVital(vital: WebVital): void {
    this.vitals.push(vital);
    // Don't auto-flush for vitals (they come in small numbers)
  }

  queueAICall(call: AICallPayload): void {
    this.aiCalls.push(call);
    this.checkThreshold();
  }

  private checkThreshold(): void {
    const total = this.errors.length + this.events.length + this.aiCalls.length;
    if (total >= this.config.flushThreshold) {
      this.flush();
    }
  }

  flush(useBeacon = false): void {
    if (
      this.errors.length === 0 &&
      this.events.length === 0 &&
      this.vitals.length === 0 &&
      this.aiCalls.length === 0
    ) {
      return;
    }

    const batch: TelemetryBatch = {
      session: this.config.getSession(),
      user: this.config.getUser(),
      errors: this.errors.splice(0),
      events: this.events.splice(0),
      vitals: this.vitals.splice(0),
      ai_calls: this.aiCalls.splice(0),
    };

    const url = `${this.config.endpoint}/v1/stores/${this.config.storeId}/telemetry/ingest`;
    const body = JSON.stringify(batch);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
    };

    if (this.config.debug) {
      console.log("[whaletools] flush", {
        errors: batch.errors.length,
        events: batch.events.length,
        vitals: batch.vitals.length,
        ai_calls: batch.ai_calls.length,
      });
    }

    // Use sendBeacon on page unload (more reliable)
    if (useBeacon && typeof navigator?.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url + `?api_key=${this.config.apiKey}`, blob);
      return;
    }

    // Normal fetch (fire-and-forget)
    fetch(url, { method: "POST", headers, body, keepalive: true }).catch(
      (err) => {
        if (this.config.debug) {
          console.error("[whaletools] flush failed:", err);
        }
      },
    );
  }
}
