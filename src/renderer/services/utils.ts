import { notification } from 'antd';

export const notify = (
  type: 'warning' | 'error' | 'success',
  message: string,
  description: string
) => {
  notification[type]({
    message,
    description,
    placement: 'bottomRight',
  });
};
