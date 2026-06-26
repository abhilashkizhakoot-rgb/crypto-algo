/**
 * Helper to determine the API Base URL in sandboxed / iframe environments
 */
export function getApiBaseUrl(): string {
  // 1. Direct window.location protocol and host check
  // Even if window.location.origin is "null" in a sandboxed iframe,
  // window.location.protocol and window.location.host retain their original values.
  if (typeof window !== "undefined" && window.location) {
    const protocol = window.location.protocol;
    const host = window.location.host;
    if ((protocol === "http:" || protocol === "https:") && host && host !== "null") {
      return `${protocol}//${host}`;
    }
  }

  // Fallback helper to extract origin from full URLs
  const extractOrigin = (str: string): string | null => {
    if (!str) return null;
    try {
      const match = str.match(/(https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?)/);
      if (match) {
        const origin = match[1];
        const lower = origin.toLowerCase();
        // Filter out parent frames and standard public CDNs/APIs
        if (
          lower.includes("ai.studio") ||
          lower.includes("google.com") ||
          lower.includes("unpkg.com") ||
          lower.includes("cdnjs.cloudflare.com") ||
          lower.includes("jsdelivr.net") ||
          lower.includes("googleapis.com") ||
          lower.includes("google-analytics.com") ||
          lower.includes("github.com")
        ) {
          return null;
        }
        return origin;
      }
    } catch (e) {}
    return null;
  };

  // 2. Check document.baseURI
  if (typeof document !== "undefined" && document.baseURI) {
    const origin = extractOrigin(document.baseURI);
    if (origin) return origin;
  }

  // 3. Check import.meta.url (reliable for ES modules, even if compiled as blob URLs in sandboxed/iframe environments)
  if (typeof import.meta !== "undefined" && import.meta.url) {
    const origin = extractOrigin(import.meta.url);
    if (origin) return origin;
  }

  // 3b. Check performance resource timing entries (very robust under sandboxed iframes)
  if (typeof performance !== "undefined" && typeof performance.getEntriesByType === "function") {
    try {
      const resources = performance.getEntriesByType("resource");
      for (let i = 0; i < resources.length; i++) {
        const name = resources[i].name;
        if (name) {
          const origin = extractOrigin(name);
          if (origin) return origin;
        }
      }
    } catch (e) {}
  }

  // 4. Check document script/link tags
  if (typeof document !== "undefined") {
    if (document.currentScript && (document.currentScript as HTMLScriptElement).src) {
      const origin = extractOrigin((document.currentScript as HTMLScriptElement).src);
      if (origin) return origin;
    }

    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const origin = extractOrigin(scripts[i].src);
      if (origin) return origin;
    }

    const links = document.getElementsByTagName("link");
    for (let i = 0; i < links.length; i++) {
      const origin = extractOrigin(links[i].href);
      if (origin) return origin;
    }
  }

  // 5. Try the compile-time injected APP_URL if available
  try {
    const injectedUrl = process.env.APP_URL;
    const origin = extractOrigin(injectedUrl || "");
    if (origin) return origin;
  } catch (e) {}

  // 6. Direct fallback to window.location.origin
  if (typeof window !== "undefined" && window.location && window.location.origin && window.location.origin !== "null" && window.location.origin !== "about:") {
    return window.location.origin;
  }

  return "";
}
