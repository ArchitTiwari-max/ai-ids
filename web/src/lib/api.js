// dashboard/src/lib/api.js

/**
 * Normalises VITE_BACKEND_HOST to a full https URL (no trailing slash).
 * Accepts any of:
 *   "ai-ids-iawg.onrender.com"
 *   "https://ai-ids-iawg.onrender.com"
 *   "localhost:8000"
 */
export function getApiBase() {
  const cfg = import.meta.env.VITE_BACKEND_HOST;
  if (!cfg) return import.meta.env.PROD ? '/api' : 'http://localhost:8000';

  const clean = cfg.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(clean)) return clean;

  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(clean);
  const proto = isLocal ? window.location.protocol : 'https:';
  return `${proto}//${clean}`;
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
