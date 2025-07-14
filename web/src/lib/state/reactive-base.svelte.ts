// reactive-base.svelte.ts - Generic reactive state system
import { SvelteMap } from 'svelte/reactivity';

// Base interface for all reactive entities
export interface IReactiveEntity {
  id: string;
  type: string;
  update(data: Partial<any>): void;
  updateProperty(path: string[], value: any): void;
  toObject(): any;
}

// Base class for all reactive state objects
export abstract class ReactiveEntity implements IReactiveEntity {
  id = $state<string>('');
  type = $state<string>('');
  lastUpdated = $state<Date>(new Date());

  constructor(id: string, type: string) {
    this.id = id;
    this.type = type;
  }

  // Abstract methods that subclasses must implement
  abstract update(data: Partial<any>): void;
  abstract toObject(): any;

  // Generic property update that can handle nested paths
  updateProperty(path: string[], value: any): void {
    if (path.length === 0) return;

    if (path.length === 1) {
      // Direct property update
      const [prop] = path;
      if (prop in this) {
        (this as any)[prop] = value;
        this.lastUpdated = new Date();
      }
    } else {
      // Nested property update
      const [prop, ...restPath] = path;
      const target = (this as any)[prop];

      if (target && typeof target === 'object') {
        if ('updateProperty' in target) {
          // Target is another ReactiveEntity
          target.updateProperty(restPath, value);
        } else if (target instanceof Map || target instanceof SvelteMap) {
          // Target is a collection - delegate to collection handler
          const [collectionKey, ...finalPath] = restPath;
          const item = target.get(collectionKey);
          if (item && 'updateProperty' in item) {
            item.updateProperty(finalPath, value);
          }
        } else {
          // Plain object - direct assignment
          this.updateNestedObject(target, restPath, value);
        }
      }
    }
  }

  private updateNestedObject(obj: any, path: string[], value: any): void {
    if (path.length === 1) {
      obj[path[0]] = value;
    } else {
      const [prop, ...restPath] = path;
      if (!obj[prop]) obj[prop] = {};
      this.updateNestedObject(obj[prop], restPath, value);
    }
  }
}

// Generic reactive collection that can contain any ReactiveEntity
export class ReactiveCollection<T extends ReactiveEntity> {
  private items = new SvelteMap<string, T>();
  private entityFactory: (id: string, data?: any) => T;

  constructor(entityFactory: (id: string, data?: any) => T) {
    this.entityFactory = entityFactory;
  }

  // Map-like interface
  get(id: string): T | undefined {
    return this.items.get(id);
  }

  set(id: string, item: T): void {
    this.items.set(id, item);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }

  keys(): IterableIterator<string> {
    return this.items.keys();
  }

  values(): IterableIterator<T> {
    return this.items.values();
  }

  entries(): IterableIterator<[string, T]> {
    return this.items.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, T]> {
    return this.items.entries();
  }

  // Update or create item
  updateItem(id: string, data: any): T {
    let item = this.items.get(id);
    if (item) {
      item.update(data);
    } else {
      item = this.entityFactory(id, data);
      this.items.set(id, item);
    }
    return item;
  }

  // Handle property-specific updates
  updateItemProperty(id: string, path: string[], value: any): T {
    let item = this.items.get(id);
    if (!item) {
      // Create item with empty data first
      item = this.entityFactory(id, {});
      this.items.set(id, item);
    }
    item.updateProperty(path, value);
    return item;
  }

  // Convert to plain object
  toObject(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [id, item] of this.items) {
      result[id] = item.toObject();
    }
    return result;
  }
}

// Reactive array for simple entities like alerts
export class ReactiveArray<T> {
  private items = $state<T[]>([]);

  get length(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
  }

  unshift(item: T): void {
    this.items.unshift(item);
  }

  splice(start: number, deleteCount?: number): T[] {
    return this.items.splice(start, deleteCount);
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.items.filter(predicate);
  }

  map<U>(fn: (item: T) => U): U[] {
    return this.items.map(fn);
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.items.find(predicate);
  }

  findIndex(predicate: (item: T) => boolean): number {
    return this.items.findIndex(predicate);
  }

  get array(): readonly T[] {
    return this.items;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }
}
