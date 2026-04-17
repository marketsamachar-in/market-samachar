import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Market Samachar] Uncaught error:', error);
    console.error('[Market Samachar] Component stack:', info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: '#07070e',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'DM Sans', sans-serif",
            color: '#e8eaf0',
          }}
        >
          <div
            style={{
              background: '#0d0d1e',
              border: '1px solid #1e1e2e',
              borderRadius: 12,
              padding: '48px 40px',
              maxWidth: 440,
              width: '90%',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 48,
                marginBottom: 16,
                lineHeight: 1,
              }}
            >
              &#x26A0;
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 500,
                margin: '0 0 8px',
                color: '#e8eaf0',
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: 14,
                color: '#888899',
                margin: '0 0 24px',
                lineHeight: 1.6,
              }}
            >
              An unexpected error occurred. Please try reloading the page.
            </p>
            {this.state.error && (
              <pre
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 12,
                  color: '#ff4466',
                  background: '#07070e',
                  border: '1px solid #1e1e2e',
                  borderRadius: 8,
                  padding: '12px 16px',
                  margin: '0 0 24px',
                  textAlign: 'left',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 120,
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              style={{
                background: '#00ff88',
                color: '#07070e',
                border: 'none',
                borderRadius: 8,
                padding: '12px 32px',
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
