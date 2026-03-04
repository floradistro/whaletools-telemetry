/**
 * React integration for @whaletools/telemetry.
 *
 * Usage:
 *   import { WhaleTelemetry, WhaleErrorBoundary } from '@whaletools/telemetry/react'
 *
 *   <WhaleTelemetry apiKey="wk_live_..." storeId="...">
 *     <WhaleErrorBoundary fallback={<p>Something went wrong</p>}>
 *       <App />
 *     </WhaleErrorBoundary>
 *   </WhaleTelemetry>
 */

import { Component, useEffect, type ReactNode } from "react";
import { whaletools, type WhaleToolsConfig } from "./index.js";

// ============================================================================
// Provider — initializes the SDK
// ============================================================================

interface WhaleTelemetryProps extends WhaleToolsConfig {
  children: ReactNode;
}

export function WhaleTelemetry({
  children,
  ...config
}: WhaleTelemetryProps): ReactNode {
  useEffect(() => {
    whaletools.init(config);
    return () => whaletools.destroy();
  }, [config.apiKey, config.storeId]);

  return children;
}

// ============================================================================
// Error Boundary — catches React render errors
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error) => ReactNode);
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class WhaleErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }): void {
    // Report to WhaleTools
    whaletools.captureError(error, {
      componentStack: errorInfo.componentStack,
      type: "react_error_boundary",
    });

    this.props.onError?.(error, {
      componentStack: errorInfo.componentStack || "",
    });
  }

  render(): ReactNode {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === "function") {
        return fallback(this.state.error);
      }
      return fallback ?? null;
    }
    return this.props.children;
  }
}

// Re-export core for convenience
export { whaletools } from "./index.js";
export type { WhaleToolsConfig } from "./types.js";
