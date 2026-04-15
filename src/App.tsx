import { Component, type ReactNode, type ErrorInfo } from 'react';
import AppShell from './components/Layout/AppShell';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import './styles/app-shell.css';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Memphant] Uncaught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100dvh',
            background: '#0d0d0d',
            color: '#e0e0e0',
            fontFamily: 'system-ui, sans-serif',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>M</div>
            <h2 style={{ margin: '0 0 0.5rem', color: '#fff' }}>Something went wrong</h2>
            <p style={{ color: '#888', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Memephant hit an unexpected error. Your project data is safe - it&apos;s saved locally
              on your computer.
            </p>
            {this.state.error && (
              <pre
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: 8,
                  padding: '0.75rem',
                  fontSize: '0.75rem',
                  color: '#e57373',
                  textAlign: 'left',
                  overflowX: 'auto',
                  marginBottom: '1.5rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '0.6rem 1.4rem',
                fontSize: '0.9rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AppShell />
      <PWAUpdatePrompt />
    </ErrorBoundary>
  );
}

export default App;