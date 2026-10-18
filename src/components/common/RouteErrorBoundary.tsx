import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RouteErrorBoundary] Uncaught route error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-hbo-dark text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6 shadow-lg shadow-red-500/10">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-display tracking-wide mb-2">
            Something Went Wrong
          </h1>
          <p className="text-sm text-gray-400 max-w-md mb-8">
            An unexpected error occurred while loading this view. You can retry loading or return to the home screen.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-sm font-semibold transition-all border border-white/10"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan hover:opacity-90 active:scale-95 text-white text-sm font-semibold transition-all shadow-hbo-glow"
            >
              <Home className="w-4 h-4" />
              <span>Go Home</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
