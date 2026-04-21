import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; name?: string; }
interface State { error: Error | null; info: string; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name ?? 'unknown'}]`, error, info);
    this.setState({ info: info.componentStack ?? '' });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-lg w-full bg-[var(--card-bg)] rounded-2xl border border-rose-500/20 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {this.props.name ?? '元件'} 發生錯誤
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                頁面已停止渲染以防止應用程式崩潰
              </p>
            </div>
          </div>

          <div className="bg-black/30 rounded-xl p-3 mb-4 overflow-auto max-h-32">
            <code className="text-xs text-rose-300 font-mono leading-relaxed whitespace-pre-wrap">
              {this.state.error.message}
            </code>
          </div>

          <button
            onClick={() => this.setState({ error: null, info: '' })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30 hover:bg-indigo-500/30 transition-all"
          >
            <RefreshCw size={12} /> 重試
          </button>
        </div>
      </div>
    );
  }
}
