
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { IconWarning } from '../../icons/IconWarning';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * A shared error boundary that isolates rendering failures in child components
 * and shows fallback UI instead of crashing the entire app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Readonly<Props>;

  public state: State = { hasError: false };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render shows the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // This is also a good place to report errors to observability tooling.
    console.error("Uncaught error in component:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 shadow-sm text-red-800">
            <div className="flex items-center mb-2">
                <IconWarning className="w-5 h-5 mr-2" />
                <h3 className="font-semibold text-sm uppercase tracking-wide">Analysis Card Failed to Render</h3>
            </div>
            <p className="text-sm">This specific chart could not be displayed due to an unexpected error.</p>
            {this.state.error && (
                <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto">
                    {this.state.error.name}: {this.state.error.message}
                </pre>
            )}
        </div>
      );
    }

    return this.props.children;
  }
}
