// lab-state.svelte.ts - Main lab state manager
import { Sensor, type SensorData } from './sensor.svelte';
import { Equipment, Pump, type EquipmentData, type PumpData } from './equipment.svelte';
import { SvelteMap } from 'svelte/reactivity';

export class Alert {
    message = $state<string>('');
    timestamp = $state<string>('');
    severity = $state<'info' | 'warning' | 'error'>('info');
    id = $state<string>('');

    constructor(message: string, severity: 'info' | 'warning' | 'error' = 'info') {
        this.message = message;
        this.severity = severity;
        this.timestamp = new Date().toISOString();
        this.id = Math.random().toString(36).substr(2, 9);
    }

    get timeAgo() {
        const now = new Date();
        const alertTime = new Date(this.timestamp);
        const diff = now.getTime() - alertTime.getTime();
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }
}

export class LabState {
    // Reactive collections using Map for better performance
    sensors = new SvelteMap<string, Equipment>();
    equipment = new SvelteMap<string, Equipment>();
    alerts = $state<Alert[]>([]);

    // Meta state
    version = $state<string>('');
    isConnected = $state<boolean>(false);
    lastUpdate = $state<Date>(new Date());

    constructor() {
        // Initialize with empty state
    }

    // Fine-grained update methods
    updateSensor(id: string, data: Partial<SensorData>) {
        const sensor = this.sensors.get(id);
        if (sensor) {
            sensor.update(data);
        } else {
            // Create new sensor if it doesn't exist
            this.sensors.set(id, new Sensor(id, data));
        }
        this.lastUpdate = new Date();
    }

    updateEquipment(id: string, data: Partial<EquipmentData & PumpData>) {
        const equipment = this.equipment.get(id);
        if (equipment) {
            equipment.update(data);
        } else {
            // Create appropriate equipment type
            if (id.includes('pump')) {
                this.equipment.set(id, new Pump(id, data as PumpData));
            } else {
                const newEquipment = new Equipment(id, 'generic');
                if (data) {
                    newEquipment.update(data);
                }
                this.equipment.set(id, newEquipment);
            }
        }
        this.lastUpdate = new Date();
    }

    addAlert(message: string, severity: 'info' | 'warning' | 'error' = 'info') {
        const alert = new Alert(message, severity);
        this.alerts.unshift(alert); // Add to beginning

        // Keep only last 50 alerts
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

    // Smart patch application - only updates what changed
    applyJsonPatch(patches: any[]) {
        for (const patch of patches) {
            this.applySinglePatch(patch);
        }
        this.lastUpdate = new Date();
    }

    private applySinglePatch(patch: any) {
        const { op, path, value } = patch;
        console.log('Applying patch:', { op, path, value });
        const pathParts = path.split('/').filter((p: string) => p);

        if (pathParts.length === 0) return;

        const [category, id, ...propertyPath] = pathParts;
        console.log('Patch parts:', { category, id, propertyPath });

        switch (category) {
            case 'sensors':
                console.log('Updating sensor:', id, value);
                console.log('Operation:', op);
                console.log('Property path:', propertyPath);
                if (op === 'add' || op === 'replace') {
                    if (propertyPath.length === 0) {
                        // Full sensor update
                        this.updateSensor(id, value);
                        console.log('Sensors size after update:', this.sensors.size);
                    } else {
                        // Property-specific update
                        let sensor = this.sensors.get(id);
                        if (!sensor) {
                            // Create sensor if it doesn't exist
                            console.log('Creating new sensor for property update:', id);
                            this.updateSensor(id, {});
                            sensor = this.sensors.get(id);
                        }
                        if (sensor) {
                            this.updateNestedProperty(sensor, propertyPath, value);
                            console.log('Updated sensor property, sensors size:', this.sensors.size);
                        }
                    }
                } else if (op === 'remove') {
                    this.sensors.delete(id);
                }
                break;

            case 'equipment':
                console.log('Updating equipment:', id, value);
                if (op === 'add' || op === 'replace') {
                    if (propertyPath.length === 0) {
                        // Full equipment update
                        this.updateEquipment(id, value);
                        console.log('Equipment size after update:', this.equipment.size);
                    } else {
                        // Property-specific update
                        let equipment = this.equipment.get(id);
                        if (!equipment) {
                            // Create equipment if it doesn't exist
                            console.log('Creating new equipment for property update:', id);
                            this.updateEquipment(id, {});
                            equipment = this.equipment.get(id);
                        }
                        if (equipment) {
                            this.updateNestedProperty(equipment, propertyPath, value);
                            console.log('Updated equipment property, equipment size:', this.equipment.size);
                        }
                    }
                } else if (op === 'remove') {
                    this.equipment.delete(id);
                }
                break;

            case 'alerts':
                if (op === 'add') {
                    this.addAlert(value.message, value.severity || 'info');
                } else if (op === 'remove') {
                    // Remove alert by index
                    const index = parseInt(id);
                    if (!isNaN(index) && index < this.alerts.length) {
                        this.alerts.splice(index, 1);
                    }
                }
                break;

            case 'version':
                if (op === 'replace') {
                    this.version = value;
                }
                break;
        }
    }

    private updateNestedProperty(target: any, path: string[], value: any) {
        console.log('updateNestedProperty called:', { target: target.constructor?.name, path, value });
        if (path.length === 1) {
            // Direct property update
            const [prop] = path;
            console.log('Direct property update:', prop, '=', value);
            if (typeof target.updateProperty === 'function') {
                console.log('Using updateProperty method');
                target.updateProperty(prop, value);
            } else {
                console.log('Direct assignment');
                target[prop] = value;
            }
        } else {
            // Nested property update
            const [prop, ...restPath] = path;
            if (target[prop]) {
                this.updateNestedProperty(target[prop], restPath, value);
            }
        }
    }

    // Computed properties
    //   get sensorCount() {
    //     return this.sensors.size;
    //   }

    // get equipmentCount() {
    //     return this.equipment.size;
    // }

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

    // Export current state for debugging
    toObject() {
        return {
            sensors: Object.fromEntries(
                Array.from(this.sensors.entries()).map(([id, sensor]) => [
                    id,
                    {
                        value: sensor.value,
                        unit: sensor.unit,
                        status: sensor.status,
                        lastUpdated: sensor.lastUpdated,
                    },
                ])
            ),
            equipment: Object.fromEntries(
                Array.from(this.equipment.entries()).map(([id, equipment]) => [
                    id,
                    {
                        status: equipment.status,
                        properties: equipment.properties,
                        type: equipment.type,
                    },
                ])
            ),
            alerts: this.alerts.map(alert => ({
                message: alert.message,
                timestamp: alert.timestamp,
                severity: alert.severity,
                id: alert.id,
            })),
            version: this.version,
            lastUpdate: this.lastUpdate,
        };
    }
}
