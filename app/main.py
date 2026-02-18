from __future__ import annotations

import argparse
import asyncio
import random
import socket
import threading
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session
from uvicorn import Config, Server

from db import create_db_and_tables, ensure_persisted_state, engine, get_session, save_persisted_state
from models import CommandRequest, LabStateModel, build_default_state
from state_store import StateStore

SIMULATION_ENABLED = True
API_HOST = "127.0.0.1"
API_PORT = 8000
APP_NAME = "Cryo Control"
BASE_DIR = Path(__file__).resolve().parent
WEB_DIST_DIR = BASE_DIR / "web_dist"


class ConnectionManager:
    def __init__(self, state_store: StateStore):
        self.state_store = state_store
        self.connections: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        await websocket.accept()
        async with self._lock:
            self.connections[client_id] = websocket
        await websocket.send_json({"type": "initial_state", "data": self.state_store.snapshot()})

    async def disconnect(self, client_id: str) -> None:
        async with self._lock:
            self.connections.pop(client_id, None)

    async def broadcast_patch(self, patch: list[dict[str, Any]], version: int) -> None:
        message = {"type": "patch", "patch": patch, "version": version}

        async with self._lock:
            items = list(self.connections.items())

        disconnected: list[str] = []
        for client_id, websocket in items:
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.append(client_id)

        if disconnected:
            async with self._lock:
                for client_id in disconnected:
                    self.connections.pop(client_id, None)

    async def close_all(self) -> None:
        async with self._lock:
            items = list(self.connections.items())
            self.connections.clear()

        for _, websocket in items:
            try:
                await websocket.close()
            except Exception:
                pass


@dataclass
class Services:
    state_store: StateStore
    connections: ConnectionManager
    simulation_task: asyncio.Task[None] | None = None


async def _simulation_loop(services: Services) -> None:
    """Continuously mutate mock sensor state and broadcast JSON patches."""
    last_db_persist_at = time.monotonic()
    persist_interval_seconds = 1.0

    while True:
        await asyncio.sleep(0.2)
        sensor_id = random.choice(["temperature", "pressure", "humidity"])
        change = random.choice(["value", "status"])

        if change == "value":
            if sensor_id == "temperature":
                new_value = round(22 + random.uniform(-2, 2), 1)
            elif sensor_id == "pressure":
                new_value = round(1013 + random.uniform(-5, 5), 2)
            else:
                new_value = round(45 + random.uniform(-8, 8), 1)
            patch, version = services.state_store.apply_value(
                f"sensors/{sensor_id}/value", new_value
            )
        else:
            new_status = random.choice(["normal", "warning"])
            patch, version = services.state_store.apply_value(
                f"sensors/{sensor_id}/status", new_status
            )

        await services.connections.broadcast_patch(patch, version)

        if random.random() < 0.1:
            alerts = services.state_store.get("alerts")
            alerts.append(
                {
                    "id": str(uuid.uuid4()),
                    "message": f"{sensor_id} changed to {new_status if change == 'status' else new_value}",
                    "severity": "warning" if change == "status" else "info",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            )
            patch, version = services.state_store.apply_value("alerts", alerts)
            await services.connections.broadcast_patch(patch, version)

        if time.monotonic() - last_db_persist_at >= persist_interval_seconds:
            with Session(engine) as session:
                save_persisted_state(session, services.state_store.snapshot())
            last_db_persist_at = time.monotonic()


def _persist_snapshot(session: Session, state_store: StateStore) -> None:
    save_persisted_state(session, state_store.snapshot())


async def _handle_command(
    command: str,
    params: dict[str, Any],
    state_store: StateStore,
    connections: ConnectionManager,
    session: Session | None = None,
) -> int:
    if command == "toggle_pump":
        current_status = state_store.get("equipment/pump_1/status")
        new_status = "stopped" if current_status == "running" else "running"
        patch, version = state_store.apply_value("equipment/pump_1/status", new_status)
    elif command == "set_pump_speed":
        speed = int(params.get("speed", 1000))
        patch, version = state_store.apply_value("equipment/pump_1/speed", speed)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown command: {command}")

    if session is None:
        with Session(engine) as local_session:
            _persist_snapshot(local_session, state_store)
    else:
        _persist_snapshot(session, state_store)

    await connections.broadcast_patch(patch, version)
    return version


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    default_state = build_default_state().model_dump(mode="json")
    with Session(engine) as session:
        persisted_state = ensure_persisted_state(session, default_state)

    state_store = StateStore(persisted_state.model_dump(mode="json"))
    services = Services(state_store=state_store, connections=ConnectionManager(state_store))
    app.state.services = services

    if SIMULATION_ENABLED:
        services.simulation_task = asyncio.create_task(_simulation_loop(services))

    yield

    if services.simulation_task:
        services.simulation_task.cancel()
        try:
            await services.simulation_task
        except asyncio.CancelledError:
            pass

    with Session(engine) as session:
        _persist_snapshot(session, services.state_store)
    await services.connections.close_all()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if (WEB_DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST_DIR / "assets"), name="assets")


def get_services(request: Request) -> Services:
    return request.app.state.services


def get_state(services: Annotated[Services, Depends(get_services)]) -> StateStore:
    return services.state_store


def get_connections(
    services: Annotated[Services, Depends(get_services)],
) -> ConnectionManager:
    return services.connections


StateDep = Annotated[StateStore, Depends(get_state)]
ConnectionsDep = Annotated[ConnectionManager, Depends(get_connections)]
SessionDep = Annotated[Session, Depends(get_session)]


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/", response_class=HTMLResponse, response_model=None)
async def index() -> Response:
    index_file = WEB_DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse(
        "<h1>Frontend build not found.</h1>"
        "<p>Run <code>cd web && bun install && bun run build:desktop</code>.</p>"
    )


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str) -> None:
    services: Services = websocket.app.state.services
    await services.connections.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "command":
                try:
                    await _handle_command(
                        command=str(data.get("command", "")),
                        params=dict(data.get("params") or {}),
                        state_store=services.state_store,
                        connections=services.connections,
                    )
                except HTTPException as exc:
                    await websocket.send_json(
                        {"type": "command_error", "error": exc.detail}
                    )
    except WebSocketDisconnect:
        pass
    finally:
        await services.connections.disconnect(client_id)


@app.post("/api/command")
async def execute_command(
    request_body: CommandRequest,
    state_store: StateDep,
    connections: ConnectionsDep,
    session: SessionDep,
) -> dict[str, Any]:
    version = await _handle_command(
        request_body.command,
        request_body.params,
        state_store,
        connections,
        session,
    )
    return {"status": "success", "version": version}


@app.get("/api/state", response_model=LabStateModel)
async def get_current_state(state_store: StateDep) -> dict[str, Any]:
    return state_store.snapshot()


class UvicornThread(threading.Thread):
    def __init__(self, config: Config):
        super().__init__(daemon=True)
        self.server = Server(config=config)

    def run(self) -> None:
        self.server.run()

    def stop(self) -> None:
        self.server.should_exit = True


def _wait_for_server(host: str, port: int, timeout_seconds: float = 10.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.2):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def run_desktop_app(host: str, port: int, debug: bool = False) -> None:
    import webview

    config = Config(app=app, host=host, port=port, log_level="info", workers=1)
    server_thread = UvicornThread(config)
    server_thread.start()

    if not _wait_for_server(host, port):
        server_thread.stop()
        raise RuntimeError("FastAPI server did not start in time.")

    window = webview.create_window(
        APP_NAME,
        url=f"http://{host}:{port}/",
        width=1200,
        height=800,
        resizable=True,
    )

    def on_closed() -> None:
        server_thread.stop()

    window.events.closed += on_closed
    try:
        webview.start(debug=debug)
    finally:
        server_thread.stop()
        server_thread.join(timeout=10)


def run_web_server(host: str, port: int) -> None:
    config = Config(app=app, host=host, port=port, log_level="info", workers=1)
    Server(config).run()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="JSON Patch desktop template app.")
    parser.add_argument("--mode", choices=["desktop", "web"], default="desktop")
    parser.add_argument("--host", default=API_HOST)
    parser.add_argument("--port", type=int, default=API_PORT)
    parser.add_argument("--debug", action="store_true", help="Enable pywebview debug mode.")
    parser.add_argument(
        "--disable-simulation",
        action="store_true",
        help="Disable simulated sensor updates.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_arguments()
    SIMULATION_ENABLED = not args.disable_simulation

    if args.mode == "desktop":
        run_desktop_app(host=args.host, port=args.port, debug=args.debug)
    else:
        run_web_server(host=args.host, port=args.port)
