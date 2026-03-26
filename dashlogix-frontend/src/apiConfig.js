/**
 * API base path. In Vite dev, defaults to "/api" (proxied to the backend).
 * Set VITE_API_URL to full origin if needed, e.g. http://127.0.0.1:5001 (no /api).
 */
const explicit = import.meta.env.VITE_API_URL;
const trimmed =
  explicit !== undefined &&
  explicit !== null &&
  String(explicit).trim() !== ""
    ? String(explicit).trim().replace(/\/$/, "")
    : null;

export const API_BASE =
  trimmed != null
    ? `${trimmed}/api`
    : import.meta.env.DEV
      ? "/api"
      : "http://127.0.0.1:5001/api";
