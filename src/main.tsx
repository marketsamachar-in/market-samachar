import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './hooks/useAuth';
import './index.css';

// Code-split: only load the page the user actually visits
const App              = lazy(() => import('./App.tsx'));
const LandingPage      = lazy(() => import('./pages/LandingPage.tsx').then(m => ({ default: m.LandingPage })));
const IPOCalendarPage  = lazy(() => import('./pages/IPOCalendarPage.tsx').then(m => ({ default: m.IPOCalendarPage })));

const path  = window.location.pathname;
const isIPO = path.startsWith('/ipo-calendar') || path.startsWith('/ipo');
const isApp =
  path.startsWith('/app')           ||
  path.startsWith('/terminal')      ||
  path.startsWith('/paper-trading') ||
  path.startsWith('/predict')       ||
  path.startsWith('/rewards')       ||
  path.startsWith('/quiz');

const Root = isIPO ? IPOCalendarPage : isApp ? App : LandingPage;

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
