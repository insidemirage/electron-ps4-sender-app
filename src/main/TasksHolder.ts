import { TaskData } from '../renderer/types/task';

interface ServerTaskData extends TaskData {
  removeTime?: number;
  askedApi?: boolean;
}

export default class TasksHolder {
  tasksData: ServerTaskData[] = [];

  constructor() {}

  private findElementIndex = (
    searchParam: keyof ServerTaskData,
    searchValue: unknown
  ) => {
    const elementIndex = this.tasksData.findIndex(
      (v) => v[searchParam] === searchValue
    );
    if (elementIndex === -1) return false;
    return elementIndex;
  };

  checkIndentialByName = (name: string) => {
    return !(this.tasksData.findIndex((v) => v.name === name) === -1);
  };

  addTask = (data: ServerTaskData) => {
    this.tasksData.push(data);
  };

  updateTask = (
    data: Partial<ServerTaskData>,
    parameter: keyof ServerTaskData,
    parameterValue: unknown
  ) => {
    const elementIndex = this.findElementIndex(parameter, parameterValue);
    if (typeof elementIndex === 'number') {
      const newTask = {
        ...this.tasksData[elementIndex],
        ...data,
      };
      this.tasksData[elementIndex] = newTask;

      return true;
    }
    return false;
  };

  removeTask = (searchParam: keyof ServerTaskData, searchValue: unknown) => {
    const elementIndex = this.findElementIndex(searchParam, searchValue);
    if (typeof elementIndex === 'number') {
      this.tasksData.splice(elementIndex, 1);
      return true;
    }
    return false;
  };

  tasksCleanup = () => {
    const tasks = this.tasksData;
    for (let i = 0; i < tasks.length; i++) {
      const item = tasks[i];
      if (item.removeTime && Date.now() > item.removeTime) {
        if (item.lengthTotal === item.transferredTotal) {
          this.updateTask({ status: 'success' }, 'taskId', item.taskId);
        } else {
          this.tasksData.splice(i, 1);
        }
      }
    }
  };

  getTask = (
    searchParam: keyof ServerTaskData,
    searchValue: unknown
  ): ServerTaskData | false => {
    const elementIndex = this.findElementIndex(searchParam, searchValue);
    return typeof elementIndex === 'number'
      ? this.tasksData[elementIndex]
      : elementIndex;
  };
}
