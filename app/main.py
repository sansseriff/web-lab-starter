from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import jsonpatch
import asyncio
from typing import Dict, Any, List
from pydantic import BaseModel
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Your lab state - this is your source of truth
lab_state = {
    "sensors": {
        "temperature": {"value": 22.5, "unit": "C", "status": "normal"},
        "pressure": {"value": 1013.25, "unit": "hPa", "status": "normal"},
        "humidity": {"value": 45.2, "unit": "%", "status": "normal"},
    },
    "equipment": {
        "pump_1": {"status": "running", "speed": 1200},
        "valve_a": {"position": "open", "angle": 90},
    },
    "alerts": [],
    "version": 1,
}

# Track connected clients
connected_clients: Dict[str, WebSocket] = {}


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        connected_clients[client_id] = websocket

        # Send initial state to new client
        await websocket.send_json({"type": "initial_state", "data": lab_state})

    def disconnect(self, websocket: WebSocket, client_id: str):
        self.active_connections.remove(websocket)
        if client_id in connected_clients:
            del connected_clients[client_id]

    async def broadcast_patch(self, patch: List[Dict]):
        """Send JSON patch to all connected clients"""
        message = {"type": "patch", "patch": patch, "version": lab_state["version"]}

        disconnected = []
        for client_id, websocket in connected_clients.items():
            try:
                await websocket.send_json(message)
            except:
                disconnected.append(client_id)

        # Clean up disconnected clients
        for client_id in disconnected:
            if client_id in connected_clients:
                del connected_clients[client_id]


manager = ConnectionManager()


def update_state(path: str, value: Any):
    """Update state and generate JSON patch"""
    global lab_state

    # Create a copy for generating the patch
    old_state = json.loads(json.dumps(lab_state))

    # Update the actual state
    keys = path.split("/")
    current = lab_state
    for key in keys[:-1]:
        if key:  # Skip empty strings from leading /
            current = current[key]

    if keys[-1]:  # Don't set empty key
        current[keys[-1]] = value

    # Increment version
    lab_state["version"] += 1

    # Generate patch
    patch = jsonpatch.make_patch(old_state, lab_state)
    return list(patch)


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_json()

            # Handle client requests (like button presses)
            if data.get("type") == "command":
                await handle_command(data.get("command"), data.get("params", {}))

    except WebSocketDisconnect:
        manager.disconnect(websocket, client_id)


async def handle_command(command: str, params: Dict):
    """Handle commands from clients (buttons, etc.)"""
    if command == "toggle_pump":
        current_status = lab_state["equipment"]["pump_1"]["status"]
        new_status = "stopped" if current_status == "running" else "running"

        patch = update_state("equipment/pump_1/status", new_status)
        await manager.broadcast_patch(patch)

    elif command == "set_pump_speed":
        speed = params.get("speed", 1000)
        patch = update_state("equipment/pump_1/speed", speed)
        await manager.broadcast_patch(patch)


# REST endpoints for controlled updates
class CommandRequest(BaseModel):
    command: str
    params: Dict[str, Any] = {}


@app.post("/api/command")
async def execute_command(request: CommandRequest):
    """Execute commands via REST API"""
    await handle_command(request.command, request.params)
    return {"status": "success", "version": lab_state["version"]}


@app.get("/api/state")
async def get_current_state():
    """Get current state via REST"""
    return lab_state


# Simulate some state changes for testing
@app.on_event("startup")
async def startup_event():
    async def simulate_updates():
        while True:
            await asyncio.sleep(0.2)  # Update every 5 seconds

            # Simulate sensor reading update
            import random

            new_temp = round(22 + random.uniform(-2, 2), 1)

            sensor = random.choice(["temperature", "pressure", "humidity"])
            # status = random.choice(["normal", "warning"])

            sensor_st = random.choice(
                [["value", new_temp], ["status", random.choice(["normal", "warning"])]]
            )

            # patch = update_state(f"sensors/{sensor}/value", new_temp)
            patch = update_state(f"sensors/{sensor}/{sensor_st[0]}", sensor_st[1])

            await manager.broadcast_patch(patch)

            # Occasionally add an alert
            if random.random() < 0.1:  # 10% chance
                alert = {
                    "id": str(uuid.uuid4()),
                    "message": f"Temperature reading: {new_temp}°C",
                    "timestamp": "2025-06-26T10:30:00Z",
                }
                alerts = lab_state["alerts"].copy()
                alerts.append(alert)
                patch = update_state("alerts", alerts)
                await manager.broadcast_patch(patch)

    # Start background task
    asyncio.create_task(simulate_updates())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
