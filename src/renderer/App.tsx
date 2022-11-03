import React, { useEffect } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { DownloadOutlined } from '@ant-design/icons';
import { Layout, Button } from 'antd';
import AppSenderPage from './AppSenderPage';
import 'antd/dist/antd.css';
import './App.css';
import { ChangeEvent, useRef, useState } from 'react';
import { apiInstallPackages } from './services/api';
import { TaskData } from './types/task';
import { notify } from './services/utils';

const { Header, Content } = Layout;

export interface MainContextObject {
  removeTask?: (taskName: string) => void;
  resumeTask?: (taskId: string | undefined) => void;
  stopTask?: (taskId: string | undefined) => void;
}

export const MainScreenContext = React.createContext<MainContextObject>({});

const MainScreen = () => {
  const uploaderInputRef = useRef<HTMLInputElement>(null);

  const [tasks, setTasks] = useState<TaskData[]>([]);
  const tasksRef = useRef<TaskData[]>([]);
  const didMountRef = useRef<boolean>(false);

  const updateTaskStatus = (data: TaskData) => {};

  const addTasksHandler = (data: TaskData[]) => {
    setTasks((v) => [...v, ...data]);
  };

  const updateTaskHandler = (data: TaskData) => {
    const { name } = data;
    if (name) {
      const currentTasks = tasksRef.current || [];
      const taskIndex = currentTasks.findIndex((v) => v.name === name);
      currentTasks[taskIndex] = data;
      if (taskIndex !== -1) {
        setTasks((v) => [...currentTasks]);
      }
    }
  };

  const setupTasks = (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files || files.length === 0) return;
    const result: TaskData[] = [];
    const taskNames = tasks.map((v) => v.name);
    for (const { name, path } of files) {
      if (taskNames.indexOf(name) !== -1) {
        notify(
          'error',
          'Task exists.',
          `Task ${name} already in list of tasks, remove it or try to resume.`
        );
        continue;
      }
      result.push({ name, path, status: 'pause' });
    }
    event.target.value = '';
    if (result.length > 0) {
      window.electron.ipcRenderer.sendMessage('addPackages', result);
    }
  };

  // TODO: replace name with id
  const removeTask = (taskName: string) => {
    window.electron.ipcRenderer.sendMessage('removeTask', taskName);
  };

  const removeTaskHandler = (taskName: string) => {
    setTasks((v) => v.filter((v) => v.name !== taskName));
  };

  const findTask = (taskName: string) => {
    if (!tasksRef.current) return;
    const currentTaskIndex = tasksRef.current.findIndex(
      (v) => v.name === taskName
    );
    if (currentTaskIndex !== -1) {
      return { taskItem: tasksRef.current[currentTaskIndex], currentTaskIndex };
    }
    return null;
  };

  const resumeTask = async (taskId: string | undefined) => {
    if (!taskId) {
      notify('warning', 'Task not found', `Failed to resume task`);
      return;
    }
    const currentTasks = tasksRef.current || [];
    const currentTask = currentTasks.filter((v) => v?.id === taskId)[0];

    if (!currentTask) {
      notify('warning', 'Task not found', `Failed to resume task`);
      return;
    }
    await apiInstallPackages([currentTask]);
  };

  const stopTask = (taskId: string) => {
    if (!taskId) {
      notify('warning', 'Task not found', `Failed to pause`);
      return;
    }
    const currentTasks = tasksRef.current || [];
    const task = currentTasks.filter((v) => v.id === taskId)[0];
    if (!task) {
      notify('warning', 'Task not found', `Failed to pause`);
      return;
    }
    window.electron.ipcRenderer.sendMessage('stopTask', task);
  };

  const uploadHandler = () => {
    if (!uploaderInputRef.current) return;
    uploaderInputRef.current?.click();
  };

  const syncTasks = (data: TaskData[]) => {
    const storageTasks = localStorage.getItem('tasks');
    setTasks((v) => [...v, ...data]);
    if (storageTasks) {
      const parsedTasks = JSON.parse(storageTasks);
      if (Array.isArray(JSON.parse(storageTasks))) {
        window.electron.ipcRenderer.sendMessage(
          'addPackages',
          parsedTasks.map((v) => ({ ...v, noNotify: true }))
        );
      }
    }
  };

  useEffect(() => {
    tasksRef.current = tasks;
    if (didMountRef.current) {
      const tasksToSave = (tasksRef.current || []).map((v) =>
        v.status === 'loading' ? { ...v, status: 'pause' } : v
      );
      localStorage.setItem('tasks', JSON.stringify(tasksToSave));
    }
    didMountRef.current = true;
  }, [tasks]);

  useEffect(() => {
    const storageTasks = localStorage.getItem('tasks');
    if (storageTasks) {
      window.electron.ipcRenderer.sendMessage('syncTasks', []);
    }
    window.electron.ipcRenderer.on('addTasks', addTasksHandler);
    window.electron.ipcRenderer.on('updateTask', updateTaskHandler);
    window.electron.ipcRenderer.on('syncTasks', syncTasks);
    window.electron.ipcRenderer.on('removeTask', removeTaskHandler);
    return () => {
      window.electron.ipcRenderer.removeListener('addTasks', addTasksHandler);
      window.electron.ipcRenderer.removeListener(
        'updateTask',
        updateTaskHandler
      );
      window.electron.ipcRenderer.removeListener('syncTasks', syncTasks);
      window.electron.ipcRenderer.removeListener(
        'removeTask',
        removeTaskHandler
      );
    };
  }, []);

  const contextObject = {
    removeTask,
    resumeTask,
    stopTask,
  };

  return (
    <MainScreenContext.Provider value={contextObject}>
      <Layout className="layout">
        <Header
          style={{
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 10px',
          }}
        >
          <input
            type="file"
            id="myFileInput"
            multiple
            style={{ display: 'none ' }}
            ref={uploaderInputRef}
            onChange={setupTasks}
          />
          <Button
            type="primary"
            shape="round"
            icon={<DownloadOutlined />}
            onClick={uploadHandler}
          />
        </Header>
        <Content>
          <AppSenderPage tasks={tasks} />
        </Content>
      </Layout>
    </MainScreenContext.Provider>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainScreen />} />
      </Routes>
    </Router>
  );
}
