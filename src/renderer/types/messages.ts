export interface ErrorPayload {
  type: 'warning' | 'error' | 'success';
  message: string;
  description: string;
}
