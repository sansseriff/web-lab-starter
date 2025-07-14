<script lang="ts">
  import { LabState } from "./lib/state/lab-state.svelte";
  import { WebSocketManager } from "./lib/state/websocket-manager.svelte";
  import { PumpController } from "./lib/controllers/pump-controller.svelte";

  // Create main application state
  const labState = new LabState();
  const wsManager = new WebSocketManager(labState);

  // Reactive collections for UI
  let pumpControllers = $state<Map<string, PumpController>>(new Map());

  // Initialize WebSocket connection
  $effect(() => {
    wsManager.connect();

    // Cleanup on component destroy
    return () => {
      wsManager.disconnect();
    };
  });

  // Create pump controllers when equipment changes
  $effect(() => {
    // Clear existing controllers
    pumpControllers.clear();

    // Create controllers for each pump
    for (const [id, equipment] of labState.equipment) {
      if (equipment.type === "pump") {
        const pump = labState.getPump(id);
        if (pump) {
          pumpControllers.set(id, new PumpController(pump, wsManager));
        }
      }
    }
  });

  // Helper function to get pump controller
  function getPumpController(id: string) {
    return pumpControllers.get(id);
  }

  // Computed values for UI
  const sensorEntries = $derived(Array.from(labState.sensors.entries()));
  const equipmentEntries = $derived(Array.from(labState.equipment.entries()));
  const sortedAlerts = $derived(
    [...labState.alerts].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  );

  // Format last update time
  const lastUpdateFormatted = $derived(
    wsManager.lastMessageTime?.toLocaleTimeString() ?? "Never"
  );
</script>

<main>
  <div class="header">
    <h1>Lab Control Dashboard</h1>
    <div class="status">
      <span class="status-indicator {wsManager.connectionStatus}"></span>
      Status: {wsManager.connectionStatus}
      {#if wsManager.lastMessageTime}
        <span class="last-update">Last update: {lastUpdateFormatted}</span>
      {/if}
      {#if wsManager.connectionStatus !== "connected"}
        <button onclick={() => wsManager.reconnect()}>Reconnect</button>
      {/if}
    </div>
  </div>

  {#if labState.sensorCount > 0 || labState.equipmentCount > 0}
    <div class="dashboard">
      <!-- Sensors Section -->
      <section class="sensors">
        <h2>Sensors ({labState.sensorCount})</h2>
        {#each sensorEntries as [sensorId, sensor]}
          <div class="sensor-card">
            <h3>{sensorId}</h3>
            <div class="sensor-value">
              {sensor.formattedValue}
            </div>
            <div class="sensor-status status-{sensor.status}">
              {sensor.status}
            </div>
            <div class="sensor-time">
              Updated: {sensor.timeSinceUpdate}
            </div>
            {#if !sensor.isHealthy}
              <button onclick={() => sensor.reset()} class="reset-btn">
                Reset
              </button>
            {/if}
          </div>
        {/each}
      </section>

      <!-- Equipment Section -->
      <section class="equipment">
        <h2>Equipment ({labState.equipmentCount})</h2>
        {#each equipmentEntries as [equipId, equipment]}
          <div class="equipment-card">
            <h3>{equipId}</h3>
            <div class="equipment-status">
              Status: <span class="status-{equipment.status}"
                >{equipment.status}</span
              >
            </div>

            {#each Object.entries(equipment.properties) as [key, value]}
              <div class="equipment-prop">
                <strong>{key}:</strong>
                {value}
              </div>
            {/each}

            <!-- Pump-specific controls -->
            {#if equipment.type === "pump"}
              {@const pumpController = getPumpController(equipId)}
              {#if pumpController}
                <div class="controls">
                  <button
                    onclick={() => pumpController.toggle()}
                    disabled={!pumpController.canOperate}
                    class="toggle-btn"
                    style="background-color: {pumpController.statusColor}"
                  >
                    {pumpController.toggleButtonText}
                  </button>

                  <label class="speed-control">
                    Speed:
                    <input
                      type="range"
                      min={pumpController.pump.minSpeed}
                      max={pumpController.pump.maxSpeed}
                      value={pumpController.speedInputValue}
                      onchange={(e) => pumpController.onSpeedInputChange(e)}
                      disabled={!pumpController.canOperate}
                    />
                    <span class="speed-display">
                      {pumpController.speedDisplayText}
                    </span>
                  </label>

                  {#if pumpController.lastCommandResult}
                    <div class="command-result">
                      {pumpController.lastCommandResult}
                    </div>
                  {/if}
                </div>
              {/if}
            {/if}

            <!-- Command history -->
            {#if equipment.commandHistory.length > 0}
              <details class="command-history">
                <summary
                  >Recent Commands ({equipment.commandHistory.length})</summary
                >
                {#each equipment.commandHistory.slice(-5) as command}
                  <div class="command-entry">
                    <code>{command.command}</code>
                    <span class="command-time">
                      {command.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                {/each}
              </details>
            {/if}
          </div>
        {/each}
      </section>

      <!-- Alerts Section -->
      <section class="alerts">
        <h2>
          Alerts ({labState.alerts.length})
          {#if labState.criticalAlerts.length > 0}
            <span class="critical-count"
              >({labState.criticalAlerts.length} critical)</span
            >
          {/if}
        </h2>

        {#each sortedAlerts as alert}
          <div class="alert alert-{alert.severity}">
            <div class="alert-header">
              <span class="alert-message">{alert.message}</span>
              <button
                onclick={() => labState.clearAlert(alert.id)}
                class="alert-close"
              >
                ×
              </button>
            </div>
            <div class="alert-time">
              {alert.timeAgo} • {new Date(alert.timestamp).toLocaleTimeString()}
            </div>
          </div>
        {/each}

        {#if labState.alerts.length === 0}
          <div class="no-alerts">No alerts</div>
        {/if}
      </section>

      <!-- System Info Section -->
      <section class="system-info">
        <h2>System Info</h2>
        <div class="info-grid">
          <div class="info-item">
            <strong>Version:</strong>
            {labState.version || "Unknown"}
          </div>
          <div class="info-item">
            <strong>Connected:</strong>
            {labState.isConnected ? "Yes" : "No"}
          </div>
          <div class="info-item">
            <strong>Active Sensors:</strong>
            {labState.activeSensors.length}
          </div>
          <div class="info-item">
            <strong>Running Equipment:</strong>
            {labState.runningEquipment.length}
          </div>
          <div class="info-item">
            <strong>Last Update:</strong>
            {labState.lastUpdate.toLocaleTimeString()}
          </div>
        </div>

        <details class="debug-section">
          <summary>Debug Info</summary>
          <pre>{JSON.stringify(labState.toObject(), null, 2)}</pre>
        </details>
      </section>
    </div>
  {:else}
    <div class="loading">
      <div class="loading-spinner"></div>
      <div>Loading lab state...</div>
      {#if wsManager.connectionStatus === "error"}
        <button onclick={() => wsManager.reconnect()} class="retry-btn">
          Retry Connection
        </button>
      {/if}
    </div>
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

  .sensor-status,
  .equipment-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.9em;
    display: inline-block;
  }

  .status-normal {
    background: #e8f5e8;
    color: #2e7d32;
  }
  .status-warning {
    background: #fff3e0;
    color: #f57c00;
  }
  .status-error {
    background: #ffebee;
    color: #d32f2f;
  }
  .status-running {
    background: #e3f2fd;
    color: #1976d2;
  }
  .status-stopped {
    background: #f5f5f5;
    color: #757575;
  }

  .sensor-time {
    font-size: 0.8em;
    color: #666;
    margin-top: 5px;
  }

  .reset-btn {
    margin-top: 10px;
    padding: 4px 8px;
    font-size: 0.8em;
    background: #ff9800;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .controls {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #eee;
  }

  .toggle-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    margin-bottom: 10px;
  }

  .toggle-btn:disabled {
    background: #ccc !important;
    cursor: not-allowed;
  }

  .speed-control {
    display: block;
    margin: 10px 0;
  }

  .speed-control input {
    width: 200px;
    margin: 0 10px;
  }

  .speed-display {
    font-weight: bold;
  }

  .command-result {
    margin-top: 10px;
    padding: 8px;
    background: #e8f5e8;
    color: #2e7d32;
    border-radius: 4px;
    font-size: 0.9em;
  }

  .command-history {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #eee;
  }

  .command-entry {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 0.9em;
  }

  .command-time {
    color: #666;
    font-size: 0.8em;
  }

  .alert {
    border-left: 4px solid;
    padding: 10px 15px;
    margin: 10px 0;
    border-radius: 0 4px 4px 0;
  }

  .alert-info {
    border-color: #2196f3;
    background: #e3f2fd;
  }
  .alert-warning {
    border-color: #ff9800;
    background: #fff3e0;
  }
  .alert-error {
    border-color: #f44336;
    background: #ffebee;
  }

  .alert-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .alert-close {
    background: none;
    border: none;
    font-size: 1.2em;
    cursor: pointer;
    padding: 0;
    margin-left: 10px;
  }

  .alert-time {
    font-size: 0.8em;
    color: #666;
    margin-top: 5px;
  }

  .critical-count {
    color: #f44336;
    font-weight: bold;
  }

  .no-alerts {
    color: #666;
    font-style: italic;
    text-align: center;
    padding: 20px;
  }

  .system-info {
    grid-column: 1 / -1;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
  }

  .info-item {
    padding: 10px;
    background: #f8f9fa;
    border-radius: 4px;
  }

  .debug-section {
    margin-top: 20px;
  }

  .debug-section pre {
    background: #f5f5f5;
    padding: 15px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.8em;
  }

  .loading {
    text-align: center;
    padding: 50px;
    font-size: 1.2em;
    color: #666;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .retry-btn {
    margin-top: 20px;
    padding: 10px 20px;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
</style>
