import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './hooks/useAuth';
import { captureIncomingReferral } from './lib/referral';
import './index.css';

// If the URL is ?ref=CODE, log the click and stash the code for later signup.
captureIncomingReferral();

// Code-split: only load the page the user actually visits
const App              = lazy(() => import('./App.tsx'));
const IPOCalendarPage  = lazy(() => import('./pages/IPOCalendarPage.tsx').then(m => ({ default: m.IPOCalendarPage })));

const path  = window.location.pathname;
const isIPO = path.startsWith('/ipo-calendar') || path.startsWith('/ipo');

// Redirect /app → / so the canonical URL is always marketsamachar.in
if (path === '/app' || path === '/app/') {
  window.history.replaceState({}, '', '/');
}

// / and /app both load the main App — LandingPage is retired
const Root = isIPO ? IPOCalendarPage : App;

const Loader = () => (
  <div style={{
    background: '#07070e', display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', color: '#00ff88', fontFamily: "'DM Mono', monospace", fontSize: 14,
  }}>
    Loading...
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={<Loader />}>
          <Root />
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
