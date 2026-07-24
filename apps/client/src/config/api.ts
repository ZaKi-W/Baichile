const testMode = import.meta.env.MODE === 'test';

export const CLOUDBASE_ENV_ID = import.meta.env.VITE_CLOUDBASE_ENV_ID || (testMode ? 'test-cloudbase-env' : '');
export const CLOUDBASE_REGION = import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai';
export const CLOUDBASE_ACCESS_KEY = import.meta.env.VITE_CLOUDBASE_ACCESS_KEY || (testMode ? 'test-publishable-key' : '');

export const USE_CLOUDBASE_API = true;
export const CLOUDBASE_API_FUNCTION = import.meta.env.VITE_CLOUDBASE_API_FUNCTION || 'api';
