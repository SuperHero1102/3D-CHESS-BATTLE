import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0D1017] text-[#F3EFE6] p-6">
          <div className="max-w-md w-full rounded-xl bg-[#161B26] border border-[#D4AF37]/30 p-6 text-center space-y-4">
            <h2 className="font-display text-xl text-[#D4AF37]">3D CHESS BATTLE</h2>
            <p className="text-sm text-[#9AA3B2] break-words">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-lg bg-[#D4AF37] text-[#0D1017] font-semibold text-sm hover:bg-[#e5c150] transition-colors"
            >
              Tải lại trò chơi / Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
