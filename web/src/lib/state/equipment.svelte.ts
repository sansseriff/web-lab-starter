// equipment.svelte.ts - Equipment state with methods
import { ReactiveEntity } from './reactive-base.svelte';

export class Equipment extends ReactiveEntity {
  status = $state<'stopped' | 'running' | 'error'>('stopped');
  properties = $state<Record<string, any>>({});
  lastCommand = $state<string | null>(null);
  commandHistory = $state<Array<{ command: string; timestamp: Date }>>([]);

  constructor(id: string, type: string, initialData?: Partial<EquipmentData>) {
    super(id, type);
    // Initialize equipment-specific properties first
    if (initialData) {
      this.update(initialData);
    }
  }

  // Fine-grained update method
  update(data: Partial<EquipmentData>) {
    if (data.status !== undefined) this.status = data.status;
    if (data.properties) {
      // Only update changed properties, preserve others
      Object.assign(this.properties, data.properties);
    }
    this.lastUpdated = new Date();
  }

  // Update specific property without recreating the whole object
  updateProperty(path: string[], value: any) {
    if (path.length === 1 && path[0] === 'properties') {
      // Direct properties update
      Object.assign(this.properties, value);
    } else if (path.length === 2 && path[0] === 'properties') {
      // Single property update
      this.properties[path[1]] = value;
    } else {
      // Use base class method for other paths
      super.updateProperty(path, value);
    }
  }

  // Computed properties
  get isRunning() {
    return this.status === 'running';
  }

  get canStart() {
    return this.status === 'stopped';
  }

  get canStop() {
    return this.status === 'running';
  }

  // Equipment-specific methods
  start() {
    if (this.canStart) {
      this.status = 'running';
      this.addToHistory('start');
      return true;
    }
    return false;
  }

  stop() {
    if (this.canStop) {
      this.status = 'stopped';
      this.addToHistory('stop');
      return true;
    }
    return false;
  }

  toggle() {
    return this.isRunning ? this.stop() : this.start();
  }

  protected addToHistory(command: string) {
    this.lastCommand = command;
    this.commandHistory.push({
      command,
      timestamp: new Date()
    });

    // Keep only last 10 commands
    if (this.commandHistory.length > 10) {
      this.commandHistory.shift();
    }
  }

  // Convert to plain object
  toObject() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      properties: { ...this.properties },
      lastCommand: this.lastCommand,
      commandHistory: this.commandHistory.map(cmd => ({
        command: cmd.command,
        timestamp: cmd.timestamp.toISOString(),
      })),
      lastUpdated: this.lastUpdated,
    };
  }
}

// Specialized pump class
export class Pump extends Equipment {
  speed = $state<number>(0);
  maxSpeed = $state<number>(2000);
  minSpeed = $state<number>(500);

  constructor(id: string, initialData?: Partial<PumpData>) {
    super(id, 'pump');
    // Initialize pump-specific properties first
    if (initialData?.speed !== undefined) {
      this.speed = initialData.speed;
    }
    if (initialData?.maxSpeed !== undefined) {
      this.maxSpeed = initialData.maxSpeed;
    }
    if (initialData?.minSpeed !== undefined) {
      this.minSpeed = initialData.minSpeed;
    }
    // Now safely call update for base equipment properties
    if (initialData) {
      super.update(initialData);
    }
  }

  update(data: Partial<PumpData>) {
    super.update(data);
    if (data.speed !== undefined) this.speed = data.speed;
    if (data.maxSpeed !== undefined) this.maxSpeed = data.maxSpeed;
    if (data.minSpeed !== undefined) this.minSpeed = data.minSpeed;
  }

  get speedPercentage() {
    return ((this.speed - this.minSpeed) / (this.maxSpeed - this.minSpeed)) * 100;
  }

  setSpeed(newSpeed: number) {
    const clampedSpeed = Math.max(this.minSpeed, Math.min(this.maxSpeed, newSpeed));
    this.speed = clampedSpeed;
    this.updateProperty(['speed'], clampedSpeed);
    this.addToHistory(`set_speed_${clampedSpeed}`);
    return clampedSpeed;
  }

  // Override toObject to include pump-specific properties
  toObject() {
    return {
      ...super.toObject(),
      speed: this.speed,
      maxSpeed: this.maxSpeed,
      minSpeed: this.minSpeed,
      speedPercentage: this.speedPercentage,
    };
  }
}

export interface EquipmentData {
  status: 'stopped' | 'running' | 'error';
  properties: Record<string, any>;
}

export interface PumpData extends EquipmentData {
  speed: number;
  maxSpeed?: number;
  minSpeed?: number;
}
