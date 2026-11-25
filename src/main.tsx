import {createRoot} from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';

if (import.meta.env.DEV && typeof navigator !== 'undefined') {
  try {
    navigator.serviceWorker?.getRegistrations?.().then((regs) => {
      for (const reg of regs) {
        if (reg.active?.scriptURL.includes('dev-sw.js')) {
          void reg.unregister();
        }
      }
    }).catch(() => {});
  } catch {
    // Ignore SecurityError in restricted iframes / Incognito
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
