const DEVELOPMENT_API_BASE = 'http://192.168.2.245:3000';

export const API_BASE = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? DEVELOPMENT_API_BASE : '');
