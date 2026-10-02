import { mountConsole } from '@kit';
import { App } from './App';

mountConsole('bsdc-status', 'Service status', () => <App />);
