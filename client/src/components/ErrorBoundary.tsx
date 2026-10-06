import { Component, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-100 p-6 text-center">
          <p className="text-lg font-bold text-ink-900">Something went wrong.</p>
          <p className="max-w-md break-words text-xs text-ink-500">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            onClick={() => window.location.reload()}
          >
            <RotateCcw className="h-4 w-4" /> Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}