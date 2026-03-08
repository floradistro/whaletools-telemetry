<p align="center">
  <img src="whale-logo.png" alt="WhaleTools" width="80" />
</p>

<h1 align="center">@neowhale/telemetry</h1>

<p align="center">
  Error tracking, analytics, Web Vitals, and AI/LLM call monitoring for WhaleTools stores.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@neowhale/telemetry"><img src="https://img.shields.io/npm/v/@neowhale/telemetry.svg" alt="npm version" /></a>
  <a href="https://whaletools.dev/docs"><img src="https://img.shields.io/badge/docs-whaletools.dev-blue" alt="docs" /></a>
  <a href="https://github.com/neowhale/telemetry/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@neowhale/telemetry" alt="license" /></a>
</p>

Zero dependencies. Works in the browser and on the server.

## Install

```bash
npm install @neowhale/telemetry
```

Peer dependencies: `react >=18` (optional -- only needed for `@neowhale/telemetry/react`).

## Quick Start

### Browser (React)

```tsx
import { WhaleTelemetry, WhaleErrorBoundary } from '@neowhale/telemetry/react'

export default function App() {
  return (
    <WhaleTelemetry apiKey="wk_live_..." storeId="your-store-uuid">
      <WhaleErrorBoundary fallback={<p>Something went wrong.</p>}>
        <YourApp />
      </WhaleErrorBoundary>
    </WhaleTelemetry>
  )
}
```

`WhaleTelemetry` calls `init()` on mount and `destroy()` on unmount. In the browser it automatically captures:

- Unhandled errors and promise rejections
- Page views (initial load and SPA navigation)
- Web Vitals (LCP, FID, CLS, FCP)
- Breadcrumbs (clicks, navigation, console warnings/errors, fetch)

### Browser (Vanilla)

```ts
import { whaletools } from '@neowhale/telemetry'

whaletools.init({ apiKey: 'wk_live_...', storeId: 'your-store-uuid' })

whaletools.track('add_to_cart', { product_id: 'abc', price: 29.99 })
whaletools.captureError(new Error('Payment failed'))
```

### Server (Next.js App Router)

```ts
import { withTelemetry } from '@neowhale/telemetry/server'

const config = { apiKey: 'wk_live_...', storeId: 'your-store-uuid' }

export const GET = withTelemetry(async (req) => {
  return Response.json({ ok: true })
}, config)
```

### Server (Manual Error Reporting)

```ts
import { reportServerError } from '@neowhale/telemetry/server'

const config = { apiKey: 'wk_live_...', storeId: 'your-store-uuid' }

try {
  await riskyOperation()
} catch (err) {
  await reportServerError(err as Error, config, { context: 'cron_job' })
}
```

### Server (AI/LLM Call Tracking)

```ts
import { reportAICall } from '@neowhale/telemetry/server'

const config = { apiKey: 'wk_live_...', storeId: 'your-store-uuid' }

const start = Date.now()
const response = await openai.chat.completions.create({ model: 'gpt-4o', messages })

await reportAICall({
  model: 'gpt-4o',
  provider: 'openai',
  prompt_tokens: response.usage?.prompt_tokens,
  completion_tokens: response.usage?.completion_tokens,
  duration_ms: Date.now() - start,
  status: 'ok',
}, config)
```

---

## Configuration

### `WhaleToolsConfig` (browser)

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | **required** | API key (`wk_live_...` or `wk_test_...`) |
| `storeId` | `string` | **required** | Store UUID |
| `endpoint` | `string` | `"https://whale-gateway.fly.dev"` | Gateway URL |
| `errors` | `boolean` | `true` | Auto-capture unhandled errors |
| `analytics` | `boolean` | `true` | Auto-capture page views |
| `vitals` | `boolean` | `true` | Collect Web Vitals |
| `breadcrumbs` | `boolean` | `true` | Auto-collect breadcrumbs |
| `environment` | `string` | `"production"` | Environment tag |
| `serviceName` | `string` | `"store_client"` | Service name tag |
| `serviceVersion` | `string` | `""` | Service version tag |
| `flushInterval` | `number` | `5000` | Flush interval in ms |
| `flushThreshold` | `number` | `10` | Max queued items before auto-flush |
| `debug` | `boolean` | `false` | Log telemetry to console |
| `sampleRate` | `number` | `1` | Analytics sample rate (0--1) |
| `beforeSend` | `(error: ErrorPayload) => ErrorPayload \| false` | -- | Mutate or drop errors before send |

### `ServerConfig` (server)

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | **required** | API key |
| `storeId` | `string` | **required** | Store UUID |
| `endpoint` | `string` | `"https://whale-gateway.fly.dev"` | Gateway URL |
| `serviceName` | `string` | `"store_server"` | Service name tag |
| `environment` | `string` | `"production"` | Environment tag |

---

## API Reference

### Core -- `@neowhale/telemetry`

The default export provides a pre-initialized `whaletools` singleton of type `WhaleToolsClient`.

```ts
import { whaletools } from '@neowhale/telemetry'
```

#### `whaletools.init(config: WhaleToolsConfig): void`

Initialize the client. Must be called once before other methods. In the browser, automatically installs error handlers, page view tracking, Web Vitals collection, and breadcrumb capture based on config flags.

#### `whaletools.captureError(error: Error | string, extra?: Record<string, unknown>): void`

Manually capture an error. Generates a SHA-256 fingerprint, attaches breadcrumbs, and queues for delivery.

#### `whaletools.captureMessage(message: string, severity?: Severity, extra?: Record<string, unknown>): void`

Capture a message as an error event. Severity is one of `"debug" | "info" | "warning" | "error" | "fatal"` (default `"info"`).

#### `whaletools.track(eventName: string, properties?: Record<string, unknown>): void`

Track a custom analytics event. Automatically enriched with `page_url` and `page_title`. Subject to `sampleRate`.

#### `whaletools.page(properties?: Record<string, unknown>): void`

Track a page view. Enriched with `page_url`, `page_path`, and `page_title`. Called automatically on init and SPA navigation when `analytics` is enabled.

#### `whaletools.identify(userId: string, traits?: Record<string, unknown>): void`

Set user context. Traits such as `email` and `name` are attached to subsequent telemetry payloads.

#### `whaletools.trackAICall(call: AICallPayload): void`

Track an AI/LLM API call. Automatically calculates `total_tokens` from `prompt_tokens + completion_tokens` if omitted.

#### `whaletools.addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void`

Add a manual breadcrumb to the ring buffer (max 25).

#### `whaletools.flush(): void`

Force-flush all queued errors, events, vitals, and AI calls to the gateway.

#### `whaletools.destroy(): void`

Stop the flush timer, perform a final flush, and reset the initialized state.

#### `addBreadcrumb(category, message, level?, data?)` (standalone)

```ts
import { addBreadcrumb } from '@neowhale/telemetry'

addBreadcrumb('checkout', 'User entered payment info', 'info', { step: 3 })
```

Add a breadcrumb directly to the global ring buffer without going through the client instance.

---

### React -- `@neowhale/telemetry/react`

```ts
import { WhaleTelemetry, WhaleErrorBoundary } from '@neowhale/telemetry/react'
```

#### `<WhaleTelemetry {...config} />`

Provider component. Accepts all `WhaleToolsConfig` props plus `children`. Calls `whaletools.init()` on mount and `whaletools.destroy()` on unmount.

#### `<WhaleErrorBoundary />`

React error boundary that reports caught render errors to WhaleTools.

| Prop | Type | Description |
|---|---|---|
| `children` | `ReactNode` | Child components to wrap |
| `fallback` | `ReactNode \| (error: Error) => ReactNode` | Fallback UI on error |
| `onError` | `(error: Error, errorInfo: { componentStack: string }) => void` | Callback on error |

---

### Server -- `@neowhale/telemetry/server`

```ts
import { withTelemetry, reportServerError, reportAICall, reportAICallBatch } from '@neowhale/telemetry/server'
```

#### `withTelemetry(handler, config): handler`

Wraps a route handler (Next.js App Router, etc.) with automatic error capture. Catches unhandled errors, reports them to the gateway, and re-throws so the framework can handle the response.

#### `reportServerError(error: Error, config: ServerConfig, extra?: Record<string, unknown>): Promise<void>`

Manually report a server-side error. Use in `catch` blocks where `withTelemetry` is not applicable.

#### `reportAICall(call: AICallReport, config: ServerConfig): Promise<void>`

Report a single AI/LLM API call. `total_tokens` is auto-calculated from `prompt_tokens + completion_tokens` if omitted.

#### `reportAICallBatch(calls: AICallReport[], config: ServerConfig): Promise<void>`

Report multiple AI/LLM calls in a single request.

---

## Types

### `ErrorPayload`

```ts
interface ErrorPayload {
  error_type: string
  error_message: string
  stack_trace: string
  fingerprint: string
  severity: 'debug' | 'info' | 'warning' | 'error' | 'fatal'
  source_file: string
  source_line: number
  source_function: string
  tags: Record<string, string>
  extra: Record<string, unknown>
  breadcrumbs: Breadcrumb[]
  occurred_at: string
  platform: string
}
```

### `Breadcrumb`

```ts
interface Breadcrumb {
  timestamp: string
  category: string
  message: string
  level: 'debug' | 'info' | 'warning' | 'error'
  data?: Record<string, unknown>
}
```

### `AnalyticsEvent`

```ts
interface AnalyticsEvent {
  event_name: string
  properties: Record<string, unknown>
  timestamp: string
}
```

### `WebVital`

```ts
interface WebVital {
  name: 'CLS' | 'FID' | 'LCP' | 'INP' | 'TTFB' | 'FCP'
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  timestamp: string
}
```

### `AICallPayload`

```ts
interface AICallPayload {
  model: string               // required
  provider?: string
  operation?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cost?: number
  duration_ms?: number
  status?: 'ok' | 'error'
  error_message?: string
  http_status?: number
  agent_id?: string
  conversation_id?: string
  tool_name?: string
  parent_span_id?: string
  attributes?: Record<string, unknown>
  timestamp?: string
}
```

---

## Internals

**Transport** -- Telemetry is batched and sent via HTTP POST to `/v1/stores/{storeId}/telemetry/ingest`. On page unload, the client falls back to `navigator.sendBeacon` to avoid data loss.

**Sessions** -- `visitor_id` is persisted in `localStorage` (`wt_vid`). `session_id` (`wt_sid`) resets after 30 minutes of inactivity.

**Fingerprinting** -- Errors are deduplicated using a SHA-256 hash of `type|message|source`. Falls back to djb2 when SubtleCrypto is unavailable.

**Breadcrumbs** -- Automatically collected categories: `ui.click`, `navigation`, `console.warn`, `console.error`, `fetch`. Stored in a ring buffer (max 25 entries) and attached to error payloads.

**Web Vitals** -- LCP, FID, CLS, and FCP are measured via `PerformanceObserver`. Ratings follow web.dev thresholds.

## License

MIT
