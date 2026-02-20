// sensor.svelte.ts - Individual sensor state with methods
import { ReactiveEntity } from './reactive-base.svelte';

type SensorUpdateListener = (sensor: Sensor) => void;

export class Sensor extends ReactiveEntity {
  value = $state<number>(0);
  unit = $state<string>('');
  status = $state<'normal' | 'warning' | 'error'>('normal');
  private updateListeners = new Set<SensorUpdateListener>();

  constructor(id: string, initialData?: Partial<SensorData>) {
    super(id, 'sensor');
    if (initialData) {
      this.update(initialData);
    }
  }

  // Method to update sensor data
  update(data: Partial<SensorData>) {
    if (data.value !== undefined) this.value = data.value;
    if (data.unit !== undefined) this.unit = data.unit;
    if (data.status !== undefined) this.status = data.status;
    this.lastUpdated = new Date();
    this.notifyUpdateListeners();
  }

  // Collection patch updates often call updateProperty directly.
  updateProperty(path: string[], value: any) {
    super.updateProperty(path, value);
    this.lastUpdated = new Date();
    this.notifyUpdateListeners();
  }

  // Computed properties using $derived
  get isHealthy() {
    return this.status === 'normal';
  }

  get formattedValue() {
    return `${this.value} ${this.unit}`;
  }

  get timeSinceUpdate() {
    const now = new Date();
    const diff = now.getTime() - this.lastUpdated.getTime();
    return `${Math.floor(diff / 1000)}s ago`;
  }

  // Methods for actions
  calibrate() {
    console.log(`Calibrating sensor ${this.id}`);
    // Calibration logic here
  }

  reset() {
    this.value = 0;
    this.status = 'normal';
    this.lastUpdated = new Date();
    this.notifyUpdateListeners();
  }

  subscribe(listener: SensorUpdateListener): () => void {
    this.updateListeners.add(listener);
    return () => {
      this.updateListeners.delete(listener);
    };
  }

  private notifyUpdateListeners() {
    for (const listener of this.updateListeners) {
      listener(this);
    }
  }

  // Convert to plain object
  toObject() {
    return {
      id: this.id,
      type: this.type,
      value: this.value,
      unit: this.unit,
      status: this.status,
      lastUpdated: this.lastUpdated,
    };
  }
}

export interface SensorData {
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'error';
}
