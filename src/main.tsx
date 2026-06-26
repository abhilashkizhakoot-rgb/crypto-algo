import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getApiBaseUrl } from './utils/api.ts';

// Global Patch for window.fetch to handle relative requests under sandboxed iframes
const originalFetch = window.fetch;
if (originalFetch) {
  try {
    const patchedFetch = function (input: RequestInfo | URL, init?: RequestInit) {
      let resolvedInput = input;
      if (typeof input === "string" && input.startsWith("/")) {
        const baseUrl = getApiBaseUrl();
        if (baseUrl) {
          resolvedInput = baseUrl + input;
        }
      } else if (input instanceof URL && input.pathname.startsWith("/")) {
        const baseUrl = getApiBaseUrl();
        if (baseUrl && (input.protocol === "about:" || input.origin === "null")) {
          resolvedInput = new URL(input.pathname + input.search, baseUrl).href;
        }
      } else if (input instanceof Request) {
        const requestUrl = input.url;
        if (requestUrl.startsWith("/")) {
          const baseUrl = getApiBaseUrl();
          if (baseUrl) {
            resolvedInput = new Request(baseUrl + requestUrl, input);
          }
        }
      }
      return originalFetch.call(this, resolvedInput, init);
    };

    try {
      Object.defineProperty(window, "fetch", {
        value: patchedFetch,
        writable: true,
        configurable: true,
      });
    } catch (e) {
      window.fetch = patchedFetch;
    }
  } catch (err) {
    console.warn("Failed to patch window.fetch globally:", err);
  }
}

// Global Patch for EventSource to handle relative streams under sandboxed iframes
const OriginalEventSource = window.EventSource;
if (OriginalEventSource) {
  try {
    class PatchedEventSource extends OriginalEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        let resolvedUrl = url;
        if (typeof url === "string" && url.startsWith("/")) {
          const baseUrl = getApiBaseUrl();
          if (baseUrl) {
            resolvedUrl = baseUrl + url;
          }
        } else if (url instanceof URL && url.pathname.startsWith("/")) {
          const baseUrl = getApiBaseUrl();
          if (baseUrl && (url.protocol === "about:" || url.origin === "null")) {
            resolvedUrl = new URL(url.pathname + url.search, baseUrl);
          }
        }
        super(resolvedUrl, eventSourceInitDict);
      }
    }

    try {
      Object.defineProperty(window, "EventSource", {
        value: PatchedEventSource,
        writable: true,
        configurable: true,
      });
    } catch (e) {
      (window as any).EventSource = PatchedEventSource;
    }
  } catch (err) {
    console.warn("Failed to patch EventSource globally:", err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
