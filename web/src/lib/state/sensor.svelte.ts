// sensor.svelte.ts - Individual sensor state with methods
export class Sensor {
  id = $state<string>('');
  value = $state<number>(0);
  unit = $state<string>('');
  status = $state<'normal' | 'warning' | 'error'>('normal');
  lastUpdated = $state<Date>(new Date());
  
  constructor(id: string, initialData?: Partial<SensorData>) {
    this.id = id;
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
  }
}

export interface SensorData {
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'error';
}
