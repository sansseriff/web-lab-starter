// websocket-manager.svelte.ts - WebSocket connection manager with generic state
import { LabState } from './lab-state.svelte';

export class WebSocketManager {
    labState: LabState;

    private ws: WebSocket | null = null;
    private clientId: string | null = null;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;

    // Reactive state
    connectionStatus = $state<'connected' | 'disconnected' | 'error'>('disconnected');
    lastMessageTime = $state<Date | null>(null);

    constructor(labState: LabState) {
        this.labState = labState;
    }

    private generateClientId(): string {
        return 'client_' + Math.random().toString(36).substr(2, 9);
    }

    private getBackendHttpBase(): string {
        const envBase = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
        if (envBase) {
            return envBase.replace(/\/$/, '');
        }

        const { protocol, hostname, port } = window.location;
        const isViteDevPort = port === '5173' || port === '4173';
        if (isViteDevPort) {
            return 'http://localhost:8000';
        }

        return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    }

    private getWebSocketUrl(): string {
        const backendHttp = this.getBackendHttpBase();
        const url = new URL(backendHttp);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${url.host}/ws/${this.clientId}`;
    }

    connect() {
        if (!this.clientId) {
            this.clientId = this.generateClientId();
        }

        const wsUrl = this.getWebSocketUrl();
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('Connected to WebSocket');
            this.connectionStatus = 'connected';
            this.labState.isConnected = true;
            this.reconnectAttempts = 0;
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.lastMessageTime = new Date();

            if (message.type === 'initial_state') {
                // Handle initial state - convert flat object to our class structure
                this.handleInitialState(message.data);
                console.log('Received initial state:', message.data);
            } else if (message.type === 'patch') {
                // Apply JSON patch using our smart patch system
                try {
                    this.labState.applyJsonPatch(message.patch);
                    //   console.log('Applied patch:', message.patch);
                } catch (error) {
                    console.error('Error applying patch:', error);
                    this.labState.addAlert('Failed to apply state update', 'error');
                }
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.connectionStatus = 'disconnected';
            this.labState.isConnected = false;

            // Attempt to reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                setTimeout(() => {
                    this.connect();
                }, 2000 * this.reconnectAttempts); // Exponential backoff
            } else {
                this.labState.addAlert('Connection lost - max reconnect attempts reached', 'error');
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.connectionStatus = 'error';
            this.labState.addAlert('WebSocket connection error', 'error');
        };
    }

    private handleInitialState(data: any) {
        console.log('handleInitialState called with:', data);

        // Clear existing state
        this.labState.sensors.clear();
        this.labState.equipment.clear();
        this.labState.alerts.splice(0);

        // Set version
        if (data.version) {
            this.labState.version = data.version;
        }

        // Initialize sensors
        if (data.sensors) {
            console.log('Initializing sensors from initial state:', data.sensors);
            for (const [id, sensorData] of Object.entries(data.sensors)) {
                console.log('Creating sensor:', id, sensorData);
                this.labState.sensors.updateItem(id, sensorData);
            }
            console.log('Sensors after initial state:', this.labState.sensors.size);
        } else {
            console.log('No sensors in initial state');
        }

        // Initialize equipment
        if (data.equipment) {
            for (const [id, equipmentData] of Object.entries(data.equipment)) {
                this.labState.equipment.updateItem(id, equipmentData);
            }
        }

        // Initialize alerts
        if (data.alerts && Array.isArray(data.alerts)) {
            for (const alertData of data.alerts) {
                this.labState.addAlert(alertData.message, alertData.severity || 'info');
            }
        }
    }

    sendCommand(command: string, params: Record<string, any> = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
                JSON.stringify({
                    type: 'command',
                    command: command,
                    params: params,
                })
            );
            return true;
        }

        this.labState.addAlert('Cannot send command - not connected', 'warning');
        return false;
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
        this.connectionStatus = 'disconnected';
        this.labState.isConnected = false;
    }

    reconnect() {
        this.disconnect();
        this.reconnectAttempts = 0;
        setTimeout(() => this.connect(), 100);
    }

    // Computed properties
    get isConnected() {
        return this.connectionStatus === 'connected';
    }

    get canSendCommands() {
        return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
    }
}
