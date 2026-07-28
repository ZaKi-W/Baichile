/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_API_BASE_URL?: string;
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  /** @deprecated 请改用 VITE_ADMIN_API_BASE_URL。 */
  readonly VITE_CLOUDBASE_HTTP_API_URL?: string;
}
