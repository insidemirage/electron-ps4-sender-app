import React from 'react';
import { List } from 'antd';
import Task from './Task';
import { TaskData } from 'renderer/types/task';

const AppSenderPage = ({ tasks }: { tasks: any }) => {
  return (
    <List
      dataSource={tasks}
      renderItem={(taskData: TaskData) => (
        <List.Item className="list__item">
          <Task taskData={taskData} />
        </List.Item>
      )}
      style={{ minHeight: '100vh' }}
    />
  );
};

export default AppSenderPage;
