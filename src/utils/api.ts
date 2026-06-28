/**
 * Helper to determine the API Base URL in sandboxed / iframe environments
 */
export function getApiBaseUrl(): string {
  // 0. Use server-injected base URL if present (extremely reliable under iframe sandboxing)
  if (typeof window !== "undefined" && (window as any).__API_BASE_URL__) {
    const injected = (window as any).__API_BASE_URL__;
    if (injected) {
      const isClientLocal = window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "0.0.0.0");
      const isInjectedLocal = injected.includes("localhost") || injected.includes("127.0.0.1") || injected.includes("0.0.0.0");
      if (isClientLocal || !isInjectedLocal) {
        return injected;
      }
    }
  }

  // Direct helper to extract an origin from a URL string without applying CDN filters.
  // This is safe to use for page level URLs (like window.location.href or document.baseURI),
  // as the page itself can never be an external CDN.
  const extractOriginDirect = (str: string): string | null => {
    if (!str) return null;
    try {
      const match = str.match(/(https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?)/);
      if (match) {
        return match[1];
      }
    } catch (e) {}
    return null;
  };

  // Helper with filter logic for resource/CDN URLs to avoid choosing them as base API URLs.
  const extractOriginWithFilter = (str: string): string | null => {
    const origin = extractOriginDirect(str);
    if (!origin) return null;
    const lower = origin.toLowerCase();
    
    // Check for standard CDN and API platforms to filter out.
    // We make "google.com" check more specific to allow googleusercontent.com (which often hosts preview pages).
    if (
      lower.includes("ai.studio") ||
      lower.includes("apis.google.com") ||
      lower.includes("maps.google.com") ||
      lower.includes("googleapis.com") ||
      lower.includes("google-analytics.com") ||
      lower.includes("unpkg.com") ||
      lower.includes("cdnjs.cloudflare.com") ||
      lower.includes("jsdelivr.net") ||
      lower.includes("github.com")
    ) {
      return null;
    }
    return origin;
  };

  // 1. Direct window.location protocol and host check
  // Even if window.location.origin is "null" in a sandboxed iframe,
  // window.location.protocol and window.location.host retain their original values.
  if (typeof window !== "undefined" && window.location) {
    try {
      const protocol = window.location.protocol;
      const host = window.location.host;
      if ((protocol === "http:" || protocol === "https:") && host && host !== "null" && host !== "") {
        return `${protocol}//${host}`;
      }
    } catch (e) {}

    // 1b. If it is a blob or restricted URL, window.location.href might contain the parent/underlying HTTP origin.
    try {
      if (window.location.href) {
        const origin = extractOriginDirect(window.location.href);
        if (origin) return origin;
      }
    } catch (e) {}
  }

  // 2. Check document.baseURI
  if (typeof document !== "undefined" && document.baseURI) {
    try {
      const origin = extractOriginDirect(document.baseURI);
      if (origin) return origin;
    } catch (e) {}
  }

  // 2b. Check performance navigation entries (contains the actual loaded page URL)
  if (typeof performance !== "undefined" && typeof performance.getEntriesByType === "function") {
    try {
      const navEntries = performance.getEntriesByType("navigation");
      if (navEntries && navEntries.length > 0 && navEntries[0].name) {
        const origin = extractOriginDirect(navEntries[0].name);
        if (origin) return origin;
      }
    } catch (e) {}
  }

  // 3. Check import.meta.url (reliable for ES modules, even if compiled as blob URLs in sandboxed/iframe environments)
  if (typeof import.meta !== "undefined" && import.meta.url) {
    try {
      const origin = extractOriginWithFilter(import.meta.url);
      if (origin) return origin;
    } catch (e) {}
  }

  // 3b. Check performance resource timing entries (very robust under sandboxed iframes)
  if (typeof performance !== "undefined" && typeof performance.getEntries === "function") {
    try {
      const entries = performance.getEntries();
      for (let i = 0; i < entries.length; i++) {
        const name = entries[i].name;
        if (name) {
          const origin = extractOriginWithFilter(name);
          if (origin) return origin;
        }
      }
    } catch (e) {}
  }

  // 4. Check document script/link tags
  if (typeof document !== "undefined") {
    try {
      if (document.currentScript && (document.currentScript as HTMLScriptElement).src) {
        const origin = extractOriginWithFilter((document.currentScript as HTMLScriptElement).src);
        if (origin) return origin;
      }

      const scripts = document.getElementsByTagName("script");
      for (let i = 0; i < scripts.length; i++) {
        const origin = extractOriginWithFilter(scripts[i].src);
        if (origin) return origin;
      }

      const links = document.getElementsByTagName("link");
      for (let i = 0; i < links.length; i++) {
        const origin = extractOriginWithFilter(links[i].href);
        if (origin) return origin;
      }
    } catch (e) {}
  }

  // 5. Try the compile-time injected APP_URL if available
  try {
    const injectedUrl = process.env.APP_URL;
    const origin = extractOriginWithFilter(injectedUrl || "");
    if (origin) return origin;
  } catch (e) {}

  // 6. Direct fallback to window.location.origin
  if (typeof window !== "undefined" && window.location && window.location.origin && window.location.origin !== "null" && window.location.origin !== "about:") {
    return window.location.origin;
  }

  return "";
}

/**
 * Drop-in wrapper for standard fetch that automatically prepends
 * the correct API Base URL if the path starts with /api/
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  let finalInput = input;
  
  if (typeof input === "string" && input.startsWith("/api/")) {
    finalInput = baseUrl ? `${baseUrl}${input}` : input;
  } else if (input instanceof URL && input.pathname.startsWith("/api/")) {
    // If it's a URL object, we can construct a new one with the correct base if needed
    if (baseUrl && (input.origin === window.location.origin || input.origin === "null")) {
      const updatedUrl = new URL(input.pathname + input.search + input.hash, baseUrl);
      finalInput = updatedUrl;
    }
  }
  
  return fetch(finalInput, init);
}

