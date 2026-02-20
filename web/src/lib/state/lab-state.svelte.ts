// lab-state.svelte.ts - Generic reactive lab state manager
import { ReactiveEntity, ReactiveCollection, ReactiveArray } from './reactive-base.svelte';
import { Sensor } from './sensor.svelte';
import { Equipment, Pump } from './equipment.svelte';
import { Alert } from './alert.svelte';

// Entity factory functions
const createSensor = (id: string, data?: any) => new Sensor(id, data);
const createEquipment = (id: string, data?: any) => {
  if (id.includes('pump')) {
    return new Pump(id, data);
  }
  return new Equipment(id, 'generic', data);
};

// Generic patch application interface
interface PatchOperation {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: any;
}

export class LabState {
  // Reactive collections using the generic system
  sensors = new ReactiveCollection(createSensor);
  equipment = new ReactiveCollection(createEquipment);
  alerts = new ReactiveArray<Alert>();

  // Additional collections can be added dynamically
  private collections = new Map<string, ReactiveCollection<ReactiveEntity>>();

  // Meta state
  version = $state<string>('');
  isConnected = $state<boolean>(false);
  lastUpdate = $state<Date>(new Date());

  constructor() {
    // Register default collections
    this.collections.set('sensors', this.sensors as ReactiveCollection<ReactiveEntity>);
    this.collections.set('equipment', this.equipment as ReactiveCollection<ReactiveEntity>);
  }

  // Register a new collection type at runtime
  registerCollection<T extends ReactiveEntity>(
    name: string,
    factory: (id: string, data?: any) => T
  ): ReactiveCollection<T> {
    const collection = new ReactiveCollection(factory);
    this.collections.set(name, collection as ReactiveCollection<ReactiveEntity>);
    (this as any)[name] = collection;
    return collection;
  }

  // Generic patch application - works with any registered collection
  applyJsonPatch(patch: any | any[]) {
    // Handle both single patch and array of patches
    const patches = Array.isArray(patch) ? patch : [patch];

    for (const singlePatch of patches) {
      this.applySinglePatch(singlePatch);
    }
    this.lastUpdate = new Date();
  }

  private applySinglePatch(patch: PatchOperation) {
    const { op, path, value } = patch;
    const pathParts = path.split('/').filter((p: string) => p);

    if (pathParts.length === 0) return;

    const [category, id, ...propertyPath] = pathParts;

    // Handle special top-level properties
    if (category === 'version') {
      if (op === 'replace') {
        this.version = value;
      }
      return;
    }

    // Handle alerts (special case - array instead of collection)
    if (category === 'alerts') {
      this.handleAlertPatch(op, id, propertyPath, value);
      return;
    }

    // Handle generic collections
    const collection = this.collections.get(category);
    if (collection) {
      this.handleCollectionPatch(collection, op, id, propertyPath, value);
    } else {
      console.warn(`Unknown collection: ${category}`);
    }
  }

  private handleCollectionPatch(
    collection: ReactiveCollection<ReactiveEntity>,
    op: string,
    id: string,
    propertyPath: string[],
    value: any
  ) {
    if (op === 'add' || op === 'replace') {
      if (propertyPath.length === 0) {
        // Full entity update
        collection.updateItem(id, value);
      } else {
        // Property-specific update
        collection.updateItemProperty(id, propertyPath, value);
      }
    } else if (op === 'remove') {
      collection.delete(id);
    }
  }

  private handleAlertPatch(op: string, id: string, propertyPath: string[], value: any) {
    if (op === 'add') {
      const alert = new Alert(value.message, value.severity || 'info');
      this.alerts.unshift(alert);

      // Keep only last 50 alerts
      if (this.alerts.length > 50) {
        this.alerts.splice(50);
      }
    } else if (op === 'remove') {
      const index = parseInt(id);
      if (!isNaN(index) && index < this.alerts.length) {
        this.alerts.splice(index, 1);
      }
    }
  }

  // Computed properties
  get criticalAlerts() {
    return this.alerts.filter(alert => alert.severity === 'error');
  }

  get activeSensors() {
    return Array.from(this.sensors.values()).filter(sensor => sensor.isHealthy);
  }

  get runningEquipment() {
    return Array.from(this.equipment.values()).filter(eq => eq.isRunning);
  }

  // Helper methods for UI
  getSensor(id: string) {
    return this.sensors.get(id);
  }

  getEquipment(id: string) {
    return this.equipment.get(id);
  }

  getPump(id: string) {
    const equipment = this.equipment.get(id);
    return equipment instanceof Pump ? equipment : null;
  }

  // Generic helper to get any collection
  getCollection(name: string): ReactiveCollection<ReactiveEntity> | undefined {
    return this.collections.get(name);
  }

  // Add alert helper
  addAlert(message: string, severity: 'info' | 'warning' | 'error' = 'info') {
    const alert = new Alert(message, severity);
    this.alerts.unshift(alert);

    if (this.alerts.length > 50) {
      this.alerts.splice(50);
    }
  }

  clearAlert(alertId: string) {
    const index = this.alerts.findIndex(alert => alert.id === alertId);
    if (index >= 0) {
      this.alerts.splice(index, 1);
    }
  }

  // Export current state for debugging
  toObject() {
    const result: any = {
      version: this.version,
      isConnected: this.isConnected,
      lastUpdate: this.lastUpdate,
      alerts: this.alerts.map(alert => alert.toObject()),
    };

    // Export all registered collections
    for (const [name, collection] of this.collections) {
      result[name] = collection.toObject();
    }

    return result;
  }
}
