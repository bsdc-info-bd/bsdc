/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import i18n from './i18n/i18n';
import './index.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import 'yet-another-react-lightbox/styles.css';

void i18n;

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
