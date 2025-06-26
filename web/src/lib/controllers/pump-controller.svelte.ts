// pump-controller.svelte.ts - Pump-specific UI controller
import type { Pump } from '../state/equipment.svelte';
import type { WebSocketManager } from '../state/websocket-manager.svelte';

export class PumpController {
  pump: Pump;
  wsManager: WebSocketManager;
  
  // UI-specific reactive state
  isCommandPending = $state<boolean>(false);
  lastCommandResult = $state<string | null>(null);
  speedInputValue = $state<number>(0);
  
  constructor(pump: Pump, wsManager: WebSocketManager) {
    this.pump = pump;
    this.wsManager = wsManager;
    this.speedInputValue = pump.speed;
    
    // Sync speed input with actual pump speed
    $effect(() => {
      this.speedInputValue = this.pump.speed;
    });
  }
  
  async toggle() {
    if (this.isCommandPending) return;
    
    this.isCommandPending = true;
    this.lastCommandResult = null;
    
    try {
      const success = this.wsManager.sendCommand('toggle_pump', { pumpId: this.pump.id });
      if (success) {
        this.lastCommandResult = `Pump ${this.pump.isRunning ? 'stop' : 'start'} command sent`;
        // Optimistically update local state
        this.pump.toggle();
      } else {
        this.lastCommandResult = 'Failed to send command';
      }
    } catch (error) {
      this.lastCommandResult = `Error: ${error}`;
    } finally {
      this.isCommandPending = false;
      // Clear result after 3 seconds
      setTimeout(() => {
        this.lastCommandResult = null;
      }, 3000);
    }
  }
  
  async setSpeed(newSpeed: number) {
    if (this.isCommandPending) return;
    
    this.isCommandPending = true;
    this.lastCommandResult = null;
    
    try {
      const clampedSpeed = this.pump.setSpeed(newSpeed);
      const success = this.wsManager.sendCommand('set_pump_speed', { 
        pumpId: this.pump.id, 
        speed: clampedSpeed 
      });
      
      if (success) {
        this.lastCommandResult = `Speed set to ${clampedSpeed} RPM`;
      } else {
        this.lastCommandResult = 'Failed to send speed command';
        // Revert optimistic update
        this.pump.setSpeed(this.speedInputValue);
      }
    } catch (error) {
      this.lastCommandResult = `Error: ${error}`;
    } finally {
      this.isCommandPending = false;
      setTimeout(() => {
        this.lastCommandResult = null;
      }, 3000);
    }
  }
  
  // Handle UI input change
  onSpeedInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newSpeed = parseInt(target.value);
    if (!isNaN(newSpeed)) {
      this.setSpeed(newSpeed);
    }
  }
  
  // Computed properties for UI
  get toggleButtonText() {
    if (this.isCommandPending) return 'Processing...';
    return this.pump.isRunning ? 'Stop Pump' : 'Start Pump';
  }
  
  get speedDisplayText() {
    return `${this.pump.speed} RPM (${this.pump.speedPercentage.toFixed(1)}%)`;
  }
  
  get canOperate() {
    return this.wsManager.canSendCommands && !this.isCommandPending;
  }
  
  get statusColor() {
    if (this.pump.status === 'running') return 'green';
    if (this.pump.status === 'error') return 'red';
    return 'gray';
  }
}
