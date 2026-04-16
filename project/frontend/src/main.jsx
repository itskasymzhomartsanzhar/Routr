import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PipProvider } from './contexts/PipContext';
import { AppDataProvider } from './contexts/AppDataContext';
import './styles/global.scss';
import App from './App';
import { initTelegramWebApp } from './utils/telegram.js';

const enforceHttpsUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  if (!/^http:\/\//i.test(trimmed)) return rawUrl;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(trimmed)) return rawUrl;
  return trimmed.replace(/^http:\/\//i, 'https://');
};

const patchNodeAttributes = (node) => {
  if (!node || node.nodeType !== 1) return;
  const element = node;
  ['src', 'href', 'poster'].forEach((attr) => {
    if (!element.hasAttribute(attr)) return;
    const current = element.getAttribute(attr);
    const secure = enforceHttpsUrl(current);
    if (secure && secure !== current) {
      element.setAttribute(attr, secure);
    }
  });
};

const enforceHttpsInDom = () => {
  document.querySelectorAll('[src], [href], [poster]').forEach(patchNodeAttributes);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') {
        patchNodeAttributes(mutation.target);
        return;
      }
      if (mutation.type !== 'childList') return;
      mutation.addedNodes.forEach((added) => {
        patchNodeAttributes(added);
        if (added?.querySelectorAll) {
          added.querySelectorAll('[src], [href], [poster]').forEach(patchNodeAttributes);
        }
      });
    });
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'href', 'poster'],
  });
};

initTelegramWebApp();
enforceHttpsInDom();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppDataProvider>
          <PipProvider>
            <App />
          </PipProvider>
        </AppDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
); 
