/**
 * Helper to determine the API Base URL in sandboxed / iframe environments
 */
export function getApiBaseUrl(): string {
  // 0. Use the compile-time injected APP_URL if available
  try {
    const injectedUrl = process.env.APP_URL;
    if (injectedUrl && injectedUrl.startsWith("http")) {
      return injectedUrl;
    }
  } catch (e) {}

  // 1. Try to parse import.meta.url first (most reliable for ES modules in sandboxed/iframe environments)
  if (typeof import.meta !== "undefined" && import.meta.url) {
    try {
      const origin = new URL(import.meta.url).origin;
      if (origin && origin.startsWith("http") && origin !== "null") {
        return origin;
      }
    } catch (e) {}
  }

  // 2. Try to parse window.location.href if protocol is http/https
  if (typeof window !== "undefined" && window.location) {
    const href = window.location.href;
    if (href && href.startsWith("http")) {
      try {
        const origin = new URL(href).origin;
        if (origin && origin !== "null") {
          return origin;
        }
      } catch (e) {}
    }
  }

  // Fallback to checking document script tags
  if (typeof document !== "undefined") {
    // Check currentScript
    if (document.currentScript && (document.currentScript as HTMLScriptElement).src) {
      const src = (document.currentScript as HTMLScriptElement).src;
      if (src && src.startsWith("http")) {
        try {
          const origin = new URL(src).origin;
          if (origin && origin !== "null") return origin;
        } catch (e) {}
      }
    }

    // Traverse all script tags
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src;
      if (src && src.startsWith("http")) {
        try {
          const origin = new URL(src).origin;
          if (origin && origin !== "null") return origin;
        } catch (e) {}
      }
    }

    // Traverse all link tags
    const links = document.getElementsByTagName("link");
    for (let i = 0; i < links.length; i++) {
      const href = links[i].href;
      if (href && href.startsWith("http")) {
        try {
          const origin = new URL(href).origin;
          if (origin && origin !== "null") return origin;
        } catch (e) {}
      }
    }
  }

  // If we still didn't find any, use window.location.origin only if it is not "null"
  if (typeof window !== "undefined" && window.location && window.location.origin && window.location.origin !== "null") {
    return window.location.origin;
  }

  return "";
}
