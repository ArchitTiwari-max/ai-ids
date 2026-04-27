import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

import { ClerkProvider } from '@clerk/react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const root = createRoot(document.getElementById('root'))

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red' }}>
          <h2>Something went wrong.</h2>
          <pre>{this.state.error && this.state.error.toString()}</pre>
          <pre>{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

if (!PUBLISHABLE_KEY) {
  root.render(
    <div style={{ color: 'red', padding: '20px' }}>
      <h2>Missing Clerk Publishable Key</h2>
      <p>Ensure VITE_CLERK_PUBLISHABLE_KEY is set in your .env file.</p>
    </div>
  )
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
          <App />
        </ClerkProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
}
