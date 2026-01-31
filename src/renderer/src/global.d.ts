import type { ElectronEnvironment } from '@/shared/types';

declare global {
  interface Window {
    electron: ElectronEnvironment;
  }
}
