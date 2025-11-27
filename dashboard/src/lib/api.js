// dashboard/src/lib/api.js
export function getApiBase() {
  const cfg = import.meta.env.VITE_BACKEND_HOST || 'localhost:8000';
  const isFull = /^https?:\/\//.test(cfg);
  if (isFull) return cfg.replace(/\/$/, '');
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(cfg);
  // For non-local hosts, default to https
  const proto = isLocal ? window.location.protocol : 'https:';
  return `${proto}//${cfg}`;
}

export function getWsUrl() {
  const cfg = import.meta.env.VITE_BACKEND_HOST || 'localhost:8000';
  const isFull = /^https?:\/\//.test(cfg);
  let host;
  let wsProto;
  if (isFull) {
    const url = new URL(cfg);
    host = url.host;
    wsProto = url.protocol === 'https:' ? 'wss' : 'ws';
  } else {
    host = cfg;
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    // For remote hosts, force wss to avoid 301 redirects from ws -> https
    wsProto = isLocal ? (window.location.protocol === 'https:' ? 'wss' : 'ws') : 'wss';
  }
  return `${wsProto}://${host}/ws/alerts`;
}
