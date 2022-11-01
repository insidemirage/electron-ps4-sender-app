import { createRoot } from 'react-dom/client';
import App from './App';
import './services/eventService';

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
