const DEVELOPMENT_API_BASE = 'http://127.0.0.1:3000';

export const CLOUDBASE_ENV_ID = import.meta.env.VITE_CLOUDBASE_ENV_ID || '';

export const USE_CLOUDBASE_API = Boolean(CLOUDBASE_ENV_ID)
  && (import.meta.env.VITE_USE_CLOUDBASE_API === '1'
    || import.meta.env.VITE_USE_CLOUDBASE_API === 'true'
    || import.meta.env.PROD);

export const API_BASE = USE_CLOUDBASE_API
  ? ''
  : import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? DEVELOPMENT_API_BASE : '');

export const CLOUDBASE_API_FUNCTION = import.meta.env.VITE_CLOUDBASE_API_FUNCTION || 'api';
