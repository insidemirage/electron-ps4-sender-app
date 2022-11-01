import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import fetch from 'electron-fetch';
import yup from 'yup';
import { addPackagesSchema, packageSchema } from './schemas';

const PS4_USER_AGENT = 'libhttp/9.00 (PlayStation 4)';
// const fetch = import('node-fetch').catch((e) => {console.log('Failed to import fetch: ', e); exit();})

const hexRegexp = /0[xX][0-9a-fA-F]+/gm;

const titleIdRegexp = /CUSA\d+/gm;

const PLAYSTATION_IP = '192.168.31.170';

const CONTENT_ID_OFFSET = parseInt('00000040', 16);

// Sync of tasks infos (do not ask the same time causes crash)
let ASKING_TASK_INFO = false;

const app = express();

app.use(cors());

interface ContentData {
  [key: string]: {
    contentId: string;
    path: string;
    taskId: number | null;
  };
}

interface TasksData {
  [key: number]: {
    path: string;
    name: string;
    contentId: string;
    length: number;
    loaded: number;
  };
}

const sharedPackagesMap: Record<string, string> = {};

let errorTasks: Record<string, number> = {};

let tasksData: Array<Record<string, any>> = [];

const apiPath = 'http://192.168.31.116:8731/';

class PsApi {
  baseUrl = `http://${PLAYSTATION_IP}:12800/api`;

  installLink = '/install';

  taskInfoLink = '/get_task_progress';

  removeTaskLink = '/unregister_task';

  stopTaskLink = '/stop_task';

  resumeTaskLink = '/resume_task';

  jsonParser(data: string) {
    let result = data;
    const hexValues = data.match(hexRegexp);
    if (!hexValues) {
      try {
        return JSON.parse(data);
      } catch {
        return { status: 'fail', message: 'cannot parse data' };
      }
    }
    for (const item of hexValues) {
      try {
        result = result.replace(item, parseInt(item, 16).toString());
      } catch (e) {
        result = result.replace(item, 'null');
      }
    }
    result = JSON.parse(result);
    return result;
  }

  async sendResponse(link: string, requestData: Record<string, any>) {
    try {
      const response = await fetch(`${this.baseUrl}${link}`, {
        method: 'post',
        body: JSON.stringify(requestData),
        timeout: 20000,
      });
      const data = await response.text();
      return this.jsonParser(data);
    } catch (e) {
      console.log('e', e);
      return { status: 'fail', message: 'Failed to send request!' };
    }
  }

  async install(packages: Array<string>, taskId?: string) {
    if (taskId) {
      const res = await this.sendResponse(this.resumeTaskLink, {
        task_id: taskId,
      });
      if (res.status === 'success') {
        return { status: 'success', task_id: taskId };
      }
    }
    const data = { type: 'direct', packages };
    const response = await this.sendResponse(this.installLink, data);
    return response;
  }

  async getTaskInfo(taskId: number) {
    const data = { task_id: taskId };
    const response = await this.sendResponse(this.taskInfoLink, data);
    return response;
  }

  async removeTask(taskId: number) {
    const data = { task_id: taskId };
    const response = await this.sendResponse(this.removeTaskLink, data);
    return response;
  }

  async stopTask(taskId: number) {
    const data = { task_id: taskId };
    const response = await this.sendResponse(this.stopTaskLink, data);
    return response;
  }
}

const ps4 = new PsApi();

const usedIds: string[] = [];

const generateId = (): string => {
  const id = uuidv4();
  if (usedIds.indexOf(id) !== -1) {
    return generateId();
  }
  usedIds.push(id);
  return id;
};

const getPackageInfo = (name: string) => {
  return sharedPackagesMap[name] || null;
};

const readContentIdFromFile = (file: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(file, {
      highWaterMark: 256,
      start: CONTENT_ID_OFFSET,
    });
    fileStream
      .on('error', (err) => reject(err))
      .on('data', (chunk) => {
        try {
          fileStream.destroy();
          resolve(chunk.toString(undefined, undefined, chunk.indexOf(0)));
        } catch (e) {
          fileStream.destroy();
          reject(e);
        }
      });
  });
};

const checkTasksAlive = () => {
  const keysDelete = [];
  for (const [key, value] of Object.entries(errorTasks)) {
    if (Date.now() > value) {
      const currentTask = tasksData.findIndex((v) => v.name === key);
      if (currentTask !== -1) {
        if (
          tasksData[currentTask].lengthTotal !==
          tasksData[currentTask].transferredTotal
        ) {
          keysDelete.push(key);
          tasksData[currentTask] = {
            ...tasksData[currentTask],
            status: 'error',
          };
        }
      }
    }
  }
  for (const item of keysDelete) {
    delete errorTasks[item];
  }
};

app.get('/package/:name', express.json({ type: '*/*' }), async (req, res) => {
  const packagePath = sharedPackagesMap[req.params.name] || null;
  if (req.headers?.range && req.ip) {
    const playstation = req.ip.replace('::', '').split(':');
    if (playstation[1] && playstation[1].trim() === PLAYSTATION_IP.trim()) {
      const resultTasks = tasksData.map((v) => {
        if (v.name === req.params.name && req.headers.range) {
          try {
            const transfered = req.headers.range
              .replace('bytes=', '')
              .split('-');
            const transferredTotal = parseInt(
              transfered.length === 2 ? transfered[1] : transfered[0],
              10
            );
            return {
              ...v,
              status:
                transferredTotal === v.lengthTotal ? 'success' : 'loading',
              transferredTotal,
            };
          } catch (e) {
            return v;
          }
        }
        return v;
      });
      tasksData = resultTasks;
    }
  }
  errorTasks[req.params.name] = Date.now() + 1000 * 40;
  if (packagePath) {
    res.sendFile(packagePath);
  } else {
    res.json({
      status: 'fail',
      message: 'Content not found in content map.',
    });
  }
});

// TODO: check task id exists
app.get('/task/info/:id', async (req, res) => {
  res.json(await ps4.getTaskInfo(parseInt(req.params.id, 10)));
});

app.get('/task/resume/:id', (req, res) => {
  res.send('Not implemented yet.');
});

app.get('/task/stop/:id', async (req, res) => {
  res.json(await ps4.stopTask(parseInt(req.params.id, 10)));
});

app.get('/task/remove/:id', async (req, res) => {
  res.json(await ps4.removeTask(parseInt(req.params.id, 10)));
});

ipcMain.on('addPackages', async (event, data) => {
  try {
    await addPackagesSchema.validate(data);
  } catch (e) {
    return event.reply('notify', {
      type: 'error',
      message: 'Client sent invalid data.',
      description: String(e),
    });
  }
  const successTasks = [];
  for (const item of data) {
    sharedPackagesMap[item.name] = item.path;
    event.reply('notify', {
      type: 'success',
      message: `Success`,
      description: `Package ${item.name} added to the list of packages.`,
    });
    const contentId = await readContentIdFromFile(item.path);
    const titleId = contentId.match(titleIdRegexp);
    successTasks.push({
      ...item,
      id: generateId(),
      status: 'pause',
      contentId: await readContentIdFromFile(item.path),
      titleId: titleId ? titleId[0] : null,
    });
  }
  return event.reply('addTasks', successTasks);
});

ipcMain.on('getTaskInfo', async (event, data) => {
  if (!data.taskId) return;
  const filtredTask = tasksData.filter((v) => v?.taskId === data.taskId);
  if (filtredTask.length > 0) {
    const currentTask = filtredTask[0];
    const resultData = {
      ...data,
      lengthTotal: currentTask.lengthTotal,
      transferredTotal: currentTask.transferredTotal,
      restSec: currentTask.restSec,
      status:
        currentTask.lengthTotal === currentTask.transferredTotal
          ? 'success'
          : currentTask.status,
    };
    return event.reply('updateTask', resultData);
  } else {
    ASKING_TASK_INFO = true;
    const result = await ps4.getTaskInfo(data.taskId);
    ASKING_TASK_INFO = false;
    if (result.status === 'success') {
      if (!result.length_total) return;
      const resultData = {
        ...data,
        lengthTotal: result.length_total,
        transferredTotal: result.transferred_total,
        restSec: result.rest_sec_total,
        status: result.error === 0 || !result.error ? data.status : 'error',
      };
      if (result.length_total) {
        tasksData.push(resultData);
      }
      return event.reply('updateTask', resultData);
    }
    return event.reply('updateTask', {
      ...data,
      status: result.error === 0 ? data.status : 'error',
    });
  }
});

ipcMain.on('stopTask', async (event, data) => {
  if (!data.taskId) {
    event.reply('notify', {
      type: 'error',
      message: `Error`,
      description: `taskId not found`,
    });
  }
  const result = await ps4.stopTask(data.taskId);
  if (result.status === 'fail') {
    event.reply('notify', {
      type: 'error',
      message: `Error`,
      description: `Failed to stop the task.`,
    });
  }
  delete errorTasks[data.name];
  event.reply('notify', {
    type: 'success',
    message: `Success`,
    description: `Stoped task.`,
  });
  return event.reply('updateTask', {
    ...data,
    status: 'pause',
  });
});

ipcMain.on('installPackage', async (event, data) => {
  try {
    await packageSchema.validate(data);
  } catch (e) {
    return event.reply('notify', {
      type: 'error',
      message: 'Client sent invalid data.',
      description: String(e),
    });
  }
  if (!sharedPackagesMap[data.name]) {
    sharedPackagesMap[data.name] = data.path;
  }
  const result = await ps4.install(
    [`${apiPath}package/${data.name}`],
    data?.taskId
  );
  if (result.status === 'fail') {
    return event.reply('notify', {
      type: 'error',
      message: 'Api fail',
      description: 'PS4 api is unreachable.',
    });
  } else {
    event.reply('notify', {
      type: 'success',
      message: 'Success',
      description: `Started loading ${data.name}`,
    });
    return event.reply('updateTask', {
      ...data,
      taskId: result.task_id,
      status: 'loading',
    });
  }
});

setInterval(checkTasksAlive, 3000);

app.listen(8731, () => {
  console.log('express has started on port 3000');
});
