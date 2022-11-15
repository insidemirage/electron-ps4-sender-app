import { ipcMain } from 'electron';
import ipService from 'ip';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import cors from 'cors';
import { readContentIdFromFile, generateId } from './util';
import PS4 from './ps4';
import TasksHolder from './TasksHolder';
import { addPackagesSchema, packageSchema } from './schemas';
import { TaskData } from '../renderer/types/task';
import { Server } from 'http';

interface ApiTickets {
  [key: string]: { retry?: number };
}

const apiCalls: ApiTickets = {};

const ps4 = new PS4();

const tasksHolder = new TasksHolder();

const titleIdRegexp = /CUSA\d+/gm;

// Sync of tasks infos (do not ask the same time causes crash)
let ASKING_TASK_INFO = false;

const app = express();

let server: Server | null = null;

app.use(cors());

const sharedPackagesMap: Record<string, string> = {};

const errorTasks: Record<string, number> = {};

let tasksData: Array<TaskData> = [];

const apiPath = 'http://192.168.31.116:8731/';

const isPlayStation = (str: string | undefined) =>
  str ? !!str.match(/PlayStation 4/) : false;

const createExpressServer = (port = 8731) => {
  server = app.listen(port, () => {
    console.log(`express has started on ${ipService.address()}:${port}`);
  });
};

app.get('/alive', (req, res) => {
  res.json({ alive: true, psServiceEnabled: !!ps4 });
});

app.get('/package/:name', express.json({ type: '*/*' }), async (req, res) => {
  const task = tasksHolder.getTask('name', req.params.name);
  const { lengthTotal } = task;
  const packagePath = task ? task.path : null;
  const { range } = req.headers;
  if (
    range &&
    req.headers['user-agent'] &&
    isPlayStation(req.headers['user-agent']) &&
    task &&
    task.askedApi &&
    lengthTotal
  ) {
    if (!req.headers.range) return;
    const transferred = range.replace('bytes=', '').split('-');
    const transferredTotal = parseInt(
      transferred.length === 2 ? transferred[1] : transferred[0],
      10
    );
    const removeTime = Date.now() + 1000 * 40;
    tasksHolder.updateTask(
      {
        // Equals but -8 bit because of taskcalc errors
        status: transferredTotal >= lengthTotal - 8 ? 'success' : 'loading',
        transferredTotal,
        removeTime,
      },
      'name',
      req.params.name
    );
  }
  if (packagePath) {
    res.sendFile(packagePath);
  } else {
    res.json({
      status: 'fail',
      message: 'Content not found in content map.',
    });
  }
});

interface SyncSettingsPayload {
  ip: string;
  port: number;
}

ipcMain.on('syncSettings', (event, payload: SyncSettingsPayload) => {
  if (server) {
    server.close();
  }
  if (ps4) {
    const { ip, port } = payload;
    console.log('ps IP: ', ip);
    ps4.setPlayStationIp(ip);
    ps4.serverPort = port;
    createExpressServer(port);
  }
});

ipcMain.on('removeTask', (event, name: string) => {
  const result = tasksHolder.removeTask('name', name);
  if (result) {
    event.reply('notify', { type: 'success', message: 'Task removed' });
    event.reply('removeTask', name);
  } else {
    event.reply('notify', { type: 'error', message: 'Task not removed' });
  }
});

ipcMain.on('addPackages', async (event, data: TaskData[]) => {
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
    const identicalTask = tasksHolder.checkIndentialByName(item.name);
    if (identicalTask) {
      if (item.noNotify) {
        event.reply('notify', {
          type: 'error',
          message: 'Task exists',
          description: `Task with name ${item.name} exists.`,
        });
      }
    } else {
      event.reply('notify', {
        type: 'success',
        message: `Success`,
        description: `Package ${item.name} added to the list of packages.`,
      });
      const contentId = await readContentIdFromFile(item.path);
      const titleId = contentId.match(titleIdRegexp);
      if (item.noNotify) {
        delete item.noNotify;
      }
      const newTask = {
        ...item,
        id: generateId(),
        status: 'pause',
        contentId: await readContentIdFromFile(item.path),
        titleId: titleId ? titleId[0] : null,
      };
      tasksHolder.addTask(newTask);
      successTasks.push(newTask);
    }
  }
  return event.reply('addTasks', successTasks);
});

ipcMain.on('getTaskInfo', async (event, data: TaskData) => {
  let task = tasksHolder.getTask('name', data.name);
  if (!task) return;
  if (task && task.askedApi) {
    return event.reply('updateTask', task);
  } else {
    // if (!task.taskId) return;
    if (ASKING_TASK_INFO) return;
    ASKING_TASK_INFO = true;
    const result = await ps4.getTaskInfo(data);
    ASKING_TASK_INFO = false;
    if (result.status === 'success') {
      if (!result.length_total) return;
      const resultData = {
        ...data,
        lengthTotal: result.length_total,
        transferredTotal: result.transferred_total,
        restSec: result.rest_sec_total,
        askedApi: true,
        status: result.error === 0 || !result.error ? data.status : 'error',
      };
      tasksHolder.updateTask(resultData, 'name', resultData.name);
      return event.reply('updateTask', resultData);
    }
    const resolveErrorStatus = (status: string) =>
      status === 'pause' || status === 'success' ? status : 'error';
    const error =
      result.error && result.error === 0
        ? task.status
        : resolveErrorStatus(task.status || 'pause');
    return event.reply('updateTask', {
      ...task,
      status: error,
    });
  }
});

ipcMain.on('stopTask', async (event, data: TaskData) => {
  const { taskId } = data;
  if (typeof taskId !== 'number') {
    event.reply('notify', {
      type: 'error',
      message: `Error`,
      description: `taskId not found`,
    });
    return;
  }
  const result = await ps4.stopTask(taskId);
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

ipcMain.on('installPackage', async (event, data: TaskData) => {
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
    [`http://${ipService.address()}:${ps4.serverPort}/package/${data.name}`],
    data
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

ipcMain.on('syncTasks', (event, data) => {
  event.reply('syncTasks', tasksHolder.tasksData);
});
