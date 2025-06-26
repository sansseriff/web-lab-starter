<script lang="ts">
  import { applyPatch } from "fast-json-patch";
  import { onMount } from "svelte";

  // Types
  interface LabState {
    sensors?: Record<
      string,
      {
        value: number;
        unit: string;
        status: string;
      }
    >;
    equipment?: Record<string, Record<string, any>>;
    alerts?: Array<{
      message: string;
      timestamp: string;
    }>;
    version?: string;
  }

  // State using Svelte 5 runes
  let labState = $state<LabState>({});
  let connectionStatus = $state<"connected" | "disconnected" | "error">(
    "disconnected"
  );
  let lastUpdate = $state<string | null>(null);

  let ws: WebSocket | null = null;
  let clientId = $state<string | null>(null);
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;

  // Generate unique client ID
  function generateClientId() {
    return "client_" + Math.random().toString(36).substr(2, 9);
  }

  // WebSocket connection
  function connectWebSocket() {
    if (!clientId) {
      clientId = generateClientId();
    }

    const wsUrl = `ws://localhost:8000/ws/${clientId}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Connected to WebSocket");
      connectionStatus = "connected";
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "initial_state") {
        // Full state update for new connections
        labState = message.data;
        lastUpdate = new Date().toLocaleTimeString();
        console.log("Received initial state:", message.data);
      } else if (message.type === "patch") {
        // Apply JSON patch to current state
        try {
          const newState = applyPatch(
            labState,
            message.patch,
            false,
            false
          ).newDocument;
          labState = newState;
          lastUpdate = new Date().toLocaleTimeString();
          // console.log("Applied patch:", message.patch);
        } catch (error) {
          console.error("Error applying patch:", error);
        }
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      connectionStatus = "disconnected";

      // Attempt to reconnect
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(
          `Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`
        );
        setTimeout(() => {
          connectWebSocket();
        }, 2000 * reconnectAttempts); // Exponential backoff
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      connectionStatus = "error";
    };
  }

  // Send command via WebSocket
  function sendCommand(command: string, params: Record<string, any> = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "command",
          command: command,
          params: params,
        })
      );
    }
  }

  // Send command via REST API (alternative approach)
  async function sendRestCommand(
    command: string,
    params: Record<string, any> = {}
  ) {
    try {
      const response = await fetch("http://localhost:8000/api/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: command,
          params: params,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Command result:", result);
    } catch (error) {
      console.error("Error sending command:", error);
    }
  }

  // Component lifecycle using Svelte 5 $effect
  onMount(() => {
    connectWebSocket();

    // Cleanup function
    return () => {
      if (ws) {
        ws.close();
      }
    };
  });

  // Event handlers
  function handleTogglePump() {
    sendCommand("toggle_pump");
  }

  function handleSetPumpSpeed(event: Event) {
    const target = event.target as HTMLInputElement;
    const speed = parseInt(target.value);
    sendCommand("set_pump_speed", { speed });
  }

  function handleReconnect() {
    if (ws) {
      ws.close();
    }
    reconnectAttempts = 0;
    connectWebSocket();
  }
</script>

<!-- // App.svelte -->
<main>
  <div class="header">
    <h1>Lab Control Dashboard</h1>
    <div class="status">
      <span class="status-indicator {connectionStatus}"></span>
      Status: {connectionStatus}
      {#if lastUpdate}
        <span class="last-update">Last update: {lastUpdate}</span>
      {/if}
      {#if connectionStatus !== "connected"}
        <button onclick={handleReconnect}>Reconnect</button>
      {/if}
    </div>
  </div>

  {#if Object.keys(labState).length > 0}
    <div class="dashboard">
      <!-- Sensors Section -->
      <section class="sensors">
        <h2>Sensors</h2>
        {#each Object.entries(labState.sensors || {}) as [sensorId, sensor]}
          <div class="sensor-card">
            <h3>{sensorId}</h3>
            <div class="sensor-value">
              {sensor.value}
              {sensor.unit}
            </div>
            <div class="sensor-status status-{sensor.status}">
              {sensor.status}
            </div>
          </div>
        {/each}
      </section>

      <!-- Equipment Section -->
      <section class="equipment">
        <h2>Equipment</h2>
        {#each Object.entries(labState.equipment || {}) as [equipId, equipment]}
          <div class="equipment-card">
            <h3>{equipId}</h3>
            {#each Object.entries(equipment) as [key, value]}
              <div class="equipment-prop">
                <strong>{key}:</strong>
                {value}
              </div>
            {/each}

            {#if equipId === "pump_1"}
              <div class="controls">
                <button onclick={handleTogglePump}>
                  {equipment.status === "running" ? "Stop" : "Start"} Pump
                </button>
                <label>
                  Speed:
                  <input
                    type="range"
                    min="500"
                    max="2000"
                    value={equipment.speed}
                    onchange={handleSetPumpSpeed}
                  />
                  {equipment.speed} RPM
                </label>
              </div>
            {/if}
          </div>
        {/each}
      </section>

      <!-- Alerts Section -->
      <section class="alerts">
        <h2>Alerts ({(labState.alerts || []).length})</h2>
        {#each labState.alerts || [] as alert}
          <div class="alert">
            <div class="alert-message">{alert.message}</div>
            <div class="alert-time">{alert.timestamp}</div>
          </div>
        {/each}
      </section>

      <!-- Debug Section -->
      <section class="debug">
        <h2>Debug Info</h2>
        <p>State Version: {labState.version || "unknown"}</p>
        <p>Client ID: {clientId}</p>
        <details>
          <summary>Full State</summary>
          <pre>{JSON.stringify(labState, null, 2)}</pre>
        </details>
      </section>
    </div>
  {:else}
    <div class="loading">Loading lab state...</div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
    background: #f5f5f5;
  }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ccc;
  }

  .status-indicator.connected {
    background: #4caf50;
  }

  .status-indicator.disconnected {
    background: #f44336;
  }

  .status-indicator.error {
    background: #ff9800;
  }

  .last-update {
    font-size: 0.9em;
    color: #666;
  }

  .dashboard {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  section {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .sensors {
    grid-column: 1 / -1;
  }

  .sensor-card,
  .equipment-card {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 15px;
    margin: 10px 0;
  }

  .sensor-value {
    font-size: 1.5em;
    font-weight: bold;
    margin: 10px 0;
  }

  .sensor-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.9em;
    display: inline-block;
  }

  .status-normal {
    background: #e8f5e8;
    color: #2e7d32;
  }

  .controls {
    margin-top: 15px;
    display: flex;
    gap: 15px;
    align-items: center;
  }

  .controls button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    background: #2196f3;
    color: white;
    cursor: pointer;
  }

  .controls button:hover {
    background: #1976d2;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .alert {
    border-left: 4px solid #ff9800;
    padding: 10px 15px;
    margin: 10px 0;
    background: #fff3e0;
  }

  .alert-message {
    font-weight: bold;
  }

  .alert-time {
    font-size: 0.9em;
    color: #666;
  }

  .debug {
    grid-column: 1 / -1;
    font-family: monospace;
    font-size: 0.9em;
  }

  .loading {
    text-align: center;
    padding: 50px;
    font-size: 1.2em;
    color: #666;
  }

  pre {
    background: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
  }
</style>
