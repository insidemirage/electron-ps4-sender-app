import fetch from 'electron-fetch';
import { TaskData } from '../renderer/types/task';

export const PLAYSTATION_IP = '192.168.31.170';
const hexRegexp = /0[xX][0-9a-fA-F]+/gm;

enum Ps4Urls {
  installLink = '/install',
  taskInfoLink = '/get_task_progress',
  removeTaskLink = '/unregister_task',
  stopTaskLink = '/stop_task',
  resumeTaskLink = '/resume_task',
  findTask = '/find_task',
}

interface CallStack {
  [key: string]: {
    retry: number;
    timeout: number | null;
  };
}

export default class PS4 {
  baseUrl = `http://${PLAYSTATION_IP}:12800/api`;

  callStack: CallStack = {};

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
    console.log(
      `send response ${link} requestData ${JSON.stringify(requestData)}`
    );
    try {
      const response = await fetch(`${this.baseUrl}${link}`, {
        method: 'post',
        body: JSON.stringify(requestData),
        timeout: 2000,
      });
      const data = await response.text();
      return this.jsonParser(data);
    } catch (e) {
      return { status: 'fail', message: 'Failed to send request!' };
    }
  }

  async install(packages: Array<string>, data: TaskData) {
    const { taskId, contentId } = data;
    // Try to resume task from taskId
    if (taskId) {
      const res = await this.sendResponse(Ps4Urls.resumeTaskLink, {
        task_id: taskId,
      });
      if (res.status === 'success') {
        return { status: 'success', task_id: taskId };
      }
    }
    const result = { type: 'direct', packages };
    const response = await this.sendResponse(Ps4Urls.installLink, result);
    // Try to find task and resume it
    if (response.status === 'fail' && contentId) {
      // Check any types of tasks
      // Game=6, AC=7, Patch=8, License=9
      const taskTypes = new Array(4)
        .fill(0)
        .map((v, i) => ({ content_id: contentId, sub_type: 6 + i }));
      for (const type of taskTypes) {
        const resumeResult = await this.sendResponse(Ps4Urls.findTask, type);
        if (resumeResult.status === 'success' && resumeResult.task_id) {
          const resp = await this.sendResponse(Ps4Urls.resumeTaskLink, {
            task_id: resumeResult.task_id,
          });
          if (resp.status === 'success') {
            return { status: 'success', task_id: resumeResult.task_id };
          }
        }
      }
    }
    return response;
  }

  async getTaskInfo({ taskId, name }: TaskData) {
    if (!taskId) return { status: 'fail', message: 'No task id' };
    const data = { task_id: taskId };
    const { timeout = null } = this.callStack[name] || {};
    if (timeout !== null) {
      if (timeout > Date.now()) {
        return { status: 'fail', message: 'TimedOut' };
      }
      this.callStack[name] = { retry: 0, timeout: null };
    }
    const response = await this.sendResponse(Ps4Urls.taskInfoLink, data);

    if (response.status === 'fail') {
      const currentRetry = this.callStack[name]
        ? this.callStack[name].retry || 0
        : 0;
      const retry = currentRetry + 1;
      this.callStack[name] = {
        retry,
        timeout: retry > 3 ? Date.now() + 40 * 1000 : null,
      };
    } else {
      this.callStack[name] = {
        retry: 0,
        timeout: null,
      };
    }
    return response;
  }

  async removeTask(taskId: number) {
    const data = { task_id: taskId };
    const response = await this.sendResponse(Ps4Urls.removeTaskLink, data);
    return response;
  }

  async stopTask(taskId: number) {
    const data = { task_id: taskId };
    const response = await this.sendResponse(Ps4Urls.stopTaskLink, data);
    return response;
  }
}
