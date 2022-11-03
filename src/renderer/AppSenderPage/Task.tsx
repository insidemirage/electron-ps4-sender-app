import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { Progress, Button } from 'antd';
import styled from 'styled-components';
import { TaskData } from 'renderer/types/task';
import { MainScreenContext } from 'renderer/App';

const TaskLayout = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
`;

const TaskName = styled.div`
  display: flex;
  font-size: 1rem;
`;

const Buttons = styled.div`
  display: flex;
`;

const FlexGroup = styled.div`
  display: flex;
  align-items: center;
`;

const ControlsSwitch = ({ data }: { data: TaskData }) => {
  const { name, path, status, id } = data;
  const context = useContext(MainScreenContext);

  const handleRemove = useCallback(() => {
    if (context.removeTask) {
      context.removeTask(name);
    }
  }, [name, context]);

  const handleStopPauseButton = useCallback(() => {
    if (status === 'loading') {
      if (context.stopTask) context.stopTask(id);
    } else {
      if (context.resumeTask) context.resumeTask(id);
    }
  }, [name, status, context]);

  return (
    <>
      <Button
        type="primary"
        icon={
          status === 'loading' ? (
            <PauseCircleOutlined />
          ) : (
            <PlayCircleOutlined />
          )
        }
        size="large"
        onClick={handleStopPauseButton}
      />
      <Button
        type="primary"
        icon={<DeleteOutlined />}
        size="large"
        onClick={handleRemove}
        danger
      />
    </>
  );
};

const Task = ({ taskData }: { taskData: TaskData }) => {
  const { name, path, status } = taskData;
  const taskDataRef = useRef(taskData);
  const taskIntervalRef = useRef<any>(null);
  const [progress, setCurrentProgress] = useState(0);

  const calculateState = () => {
    if (taskDataRef.current) {
      window.electron.ipcRenderer.sendMessage(
        'getTaskInfo',
        taskDataRef.current
      );
    }
  };

  const getProgressBarStatus = () => {
    switch (status) {
      case 'loading':
        return 'active';
      case 'pause':
        return 'normal';
      case 'error':
        return 'exception';
      case 'success':
        return 'success';
    }
  };

  useEffect(() => {
    if (
      typeof taskData.lengthTotal === 'number' &&
      typeof taskData.transferredTotal === 'number'
    ) {
      const prg = (taskData.transferredTotal / taskData.lengthTotal) * 100;
      setCurrentProgress(parseFloat(prg.toFixed(1)));
    }
    taskDataRef.current = taskData;
  }, [taskData]);

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('getTaskInfo', taskDataRef.current);
    taskIntervalRef.current = setInterval(calculateState, 200);
    return () => {
      if (taskIntervalRef.current !== null) {
        clearInterval(taskIntervalRef.current);
      }
    };
  }, []);

  return (
    <TaskLayout>
      <TaskName>{name}</TaskName>
      <FlexGroup>
        <Progress
          percent={progress}
          size="small"
          status={getProgressBarStatus()}
          style={{ width: 200, marginRight: 10 }}
        />
        <Buttons>
          <ControlsSwitch data={taskData} />
        </Buttons>
      </FlexGroup>
    </TaskLayout>
  );
};

export default Task;
