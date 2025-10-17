/* Base class for App implementations. Structure only; no provider logic. */
import { AppMeta } from '@runfast/types';

export abstract class BaseApp {
  constructor(public readonly meta: AppMeta) {}

  abstract add(req: any, res: any): Promise<void>;
  abstract callback(req: any, res: any): Promise<void>;

  async post(req: any, res: any): Promise<void> {
    // Default not implemented
    res.status(404).json({ message: 'Not implemented' });
  }
}

