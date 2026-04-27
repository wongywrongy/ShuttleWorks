import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-muted">
          <div className="bg-card p-4 rounded shadow max-w-2xl">
            <h1 className="text-xl font-bold text-red-600 mb-3">Something went wrong</h1>
            <p className="text-foreground mb-3 text-sm">{this.state.error?.message}</p>
            <pre className="bg-muted p-3 rounded-sm overflow-auto text-xs">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
