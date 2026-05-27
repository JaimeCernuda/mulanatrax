export interface AppConfig {
  appName: string;
  gameName: string;
  databaseName: string;
}

declare global {
  interface Window {
    __GAMETRAX_CONFIG__?: {
      appName?: string;
      databaseName?: string;
      gameName?: string;
      screenshotPresets?: unknown;
    };
  }
}

export const runtimeConfig = typeof window === 'undefined' ? {} : (window.__GAMETRAX_CONFIG__ ?? {});

export const appConfig: AppConfig = {
  appName: runtimeConfig.appName ?? import.meta.env.VITE_APP_NAME ?? 'GameTrax',
  gameName: runtimeConfig.gameName ?? import.meta.env.VITE_GAME_NAME ?? 'your game',
  databaseName: runtimeConfig.databaseName ?? import.meta.env.VITE_DB_NAME ?? 'gametraxdb',
};
