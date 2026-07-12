/// <reference types="@dcloudio/types" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  readonly VITE_CLOUDBASE_API_FUNCTION?: string;
  readonly VITE_TENCENT_MAP_KEY?: string;
}

interface WxCloudCallFunctionResult {
  result?: unknown;
}

interface WxCloud {
  init(options: { env: string; traceUser?: boolean }): void;
  uploadFile(options: {
    cloudPath: string;
    filePath: string;
  }): Promise<{ fileID: string }>;
  downloadFile(options: {
    fileID: string;
  }): Promise<{ tempFilePath: string; statusCode?: number }>;
  callFunction(options: {
    name: string;
    data?: Record<string, unknown>;
    success?: (result: WxCloudCallFunctionResult) => void;
    fail?: (error: unknown) => void;
  }): Promise<WxCloudCallFunctionResult>;
}

declare const wx: { cloud?: WxCloud } | undefined;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
