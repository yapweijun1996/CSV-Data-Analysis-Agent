
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { IconWarning } from '../icons/IconWarning';
import { getTranslation } from '../utils/localization';

interface Props {
  children: ReactNode;
  language?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * A generic error boundary component for catching rendering errors in its children,
 * and displaying a fallback UI instead of crashing the entire application.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Readonly<Props>;

  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error in component:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const { language } = this.props;
      return (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 shadow-sm text-red-800">
          <div className="flex items-center mb-2">
            <IconWarning className="w-5 h-5 mr-2" />
            <h3 className="font-semibold text-sm uppercase tracking-wide">
              {getTranslation('error_boundary_title', language)}
            </h3>
          </div>
          <p className="text-sm">
            {getTranslation('error_boundary_message', language)}
          </p>
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
