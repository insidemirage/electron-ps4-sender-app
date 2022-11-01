export interface TaskData {
  name: string;
  path: string;
  status?: 'loading' | 'success' | 'error' | 'pause';
  id?: string;
  lengthTotal?: number;
  transferredTotal?: number;
  restSec?: number;
  error?: number;
}
