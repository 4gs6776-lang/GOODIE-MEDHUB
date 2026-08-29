import { Component } from 'react'

// Catches render/lifecycle errors anywhere below it in the tree and shows
// a recoverable screen instead of letting React unmount the whole app to
// a blank white page. Does NOT catch errors in event handlers, async code,
// or server-side rendering — those still need their own try/catch.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Centralized log point — swap/add a real error-monitoring call here
    // (e.g. Sentry.captureException(error)) once one is wired up.
    console.error('[ErrorBoundary] caught:', error, info?.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: 32, background: '#0a0f1a', color: '#f5f0e6', fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 14, color: '#9aa5b1', maxWidth: 420, marginBottom: 24 }}>
          {this.props.fallbackMessage || 'This part of the app hit an unexpected error. Your data is safe — try reloading the page.'}
        </div>
        <button
          onClick={this.handleReload}
          style={{
            background: '#2f9e8f', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Reload page
        </button>
        {import.meta.env.DEV && this.state.error && (
          <pre style={{
            marginTop: 24, maxWidth: '90vw', overflow: 'auto', textAlign: 'left',
            fontSize: 11, color: '#e16851', background: 'rgba(225,104,94,0.08)',
            padding: 12, borderRadius: 8, border: '1px solid rgba(225,104,94,0.3)',
          }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        )}
      </div>
    )
  }
}
