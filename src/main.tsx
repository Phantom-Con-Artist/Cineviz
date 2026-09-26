import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';

/** Developer tool: ?reference opens the motion reference viewer instead of the app */
const ReferenceViewer = lazy(() => import('./dev/ReferenceViewer'));
const reference = new URLSearchParams(window.location.search).has('reference');

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found in document.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {reference ? (
      <Suspense fallback={null}>
        <ReferenceViewer />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
