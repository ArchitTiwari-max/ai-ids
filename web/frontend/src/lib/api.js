// dashboard/src/lib/api.js

/**
 * Normalises VITE_BACKEND_HOST to a full https URL (no trailing slash).
 * Accepts any of:
 *   "ai-ids-iawg.onrender.com"
 *   "https://ai-ids-iawg.onrender.com"
 *   "localhost:8000"
 */
export function getApiBase() {
  let cfg = import.meta.env.VITE_BACKEND_HOST || 'localhost:8000';
  cfg = cfg.trim().replace(/\/$/, '');

  // Already a full URL
  if (/^https?:\/\//i.test(cfg)) {
    return cfg.replace(/\/$/, '');
  }

  // Bare host[:port] — choose protocol by locality
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(cfg);
  const proto = isLocal ? window.location.protocol : 'https:';
  return `${proto}//${cfg}`;
}

/**
 * Derives the WebSocket URL from the same VITE_BACKEND_HOST setting.
 * https → wss, http → ws.
 */
export function getWsUrl() {
  const base = getApiBase(); // e.g. "https://ai-ids-iawg.onrender.com"
  const wsUrl = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  return `${wsUrl}/ws/alerts`;
}
