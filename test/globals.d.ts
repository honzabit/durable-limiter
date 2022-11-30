import { describe } from 'vitest';

declare global {
  function getMiniflareBindings(): Bindings;
  function setupMiniflareIsolatedStorage(): typeof describe;
  function flushMiniflareDurableObjectAlarms(ids?: DurableObjectId[]): Promise<void>;
  function getMiniflareDurableObjectStorage(
    id: DurableObjectId
  ): Promise<DurableObjectStorage>;

}

export {};
