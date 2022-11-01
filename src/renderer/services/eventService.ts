import { ErrorPayload } from '../types/messages';
import { notify } from './utils';

window.electron.ipcRenderer.on('notify', (payload: ErrorPayload) => {
  const { message, description, type } = payload;
  notify(type, message, description);
});
