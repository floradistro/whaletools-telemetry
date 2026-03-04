/**
 * @whaletools/telemetry — Error tracking, analytics & Web Vitals for WhaleTools stores.
 *
 * Usage:
 *   import { whaletools } from '@whaletools/telemetry'
 *
 *   whaletools.init({ apiKey: 'wk_live_...', storeId: '...' })
 *   whaletools.track('purchase', { amount: 49.99 })
 *   whaletools.captureError(new Error('Something broke'))
 */

import { WhaleToolsClient } from "./client.js";

// Singleton instance
export const whaletools = new WhaleToolsClient();

// Named exports for tree-shaking
export { WhaleToolsClient } from "./client.js";
export { addBreadcrumb } from "./breadcrumbs.js";
export type {
  WhaleToolsConfig,
  ErrorPayload,
  AnalyticsEvent,
  WebVital,
  AICallPayload,
  Breadcrumb,
  TelemetryBatch,
  SessionContext,
  UserContext,
} from "./types.js";
