import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { APP_VERSION, APP_BUILD_NUMBER } from './version';
import './index.css';

console.log(
  `%c[TMDB Streamer] Running v${APP_VERSION} (Build #${APP_BUILD_NUMBER})`,
  'background: #7828c8; color: #00f0ff; font-weight: bold; padding: 4px 8px; border-radius: 4px;'
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
