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
  getTempFileURL(options: {
    fileList: string[];
  }): Promise<{
    fileList: Array<{
      fileID: string;
      tempFileURL: string;
      status?: number;
      errMsg?: string;
    }>;
  }>;
  callFunction(options: {
    name: string;
    data?: Record<string, unknown>;
    success?: (result: WxCloudCallFunctionResult) => void;
    fail?: (error: unknown) => void;
  }): Promise<WxCloudCallFunctionResult>;
}

interface WxFileSystemManager {
  readFile(options: {
    filePath: string;
    encoding: 'base64';
    success: (result: { data: string | ArrayBuffer }) => void;
    fail: (error: unknown) => void;
  }): void;
}

declare const wx: {
  cloud?: WxCloud;
  getFileSystemManager(): WxFileSystemManager;
  compressImage(options: {
    src: string;
    quality?: number;
    success: (result: { tempFilePath: string }) => void;
    fail: (error: unknown) => void;
  }): void;
} | undefined;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
