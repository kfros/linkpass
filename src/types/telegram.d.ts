export {};

declare global {
  interface TelegramWebApp {
    ready?: () => void;
    // add fields later as needed, e.g. initData, expand, close, etc.
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
