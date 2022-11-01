import _axios from 'axios';
import { TaskData } from '../types/task';
// Api is always hosted on local machine
// TODO: changable port
const baseURL = 'http://localhost:8731';

const axios = _axios.create({
  baseURL,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
});

export const apiInstallPackages = async (data: TaskData[]) => {
  for (const item of data) {
    window.electron.ipcRenderer.sendMessage('installPackage', item);
  }
};

export const stopTask = async (data: Omit<TaskData, 'status'>[]) => {};
