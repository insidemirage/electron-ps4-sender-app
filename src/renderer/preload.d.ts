import { Channels, ServerChannels } from 'main/preload';

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        sendMessage(channel: ServerChannels, args: any): void;
        on(
          channel: Channels,
          func: (...args: any[]) => void
        ): (() => void) | undefined;
        once(channel: Channels, func: (...args: any[]) => void): void;
        removeListener(channel: Channels, func: (...args: any[]) => void): void;
      };
    };
  }
}

export {};
