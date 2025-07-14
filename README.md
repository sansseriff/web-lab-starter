# Laboratory State Synchronization with JSON Patch

![UI Screenshot](./ui.png)

An experimental application demonstrating real-time state synchronization between a web frontend and a Python backend using WebSockets and JSON Patch. This project is designed as a foundation for laboratory automation software where multiple views of the UI (remote browser connection, local window on the control computer) need to stay synchronized with equipment state.

## 🤔 The Problem with Traditional Approaches

Most web applications are designed around **CRUD operations** (Create, Read, Update, Delete) that sync with databases. This works well for typical business applications where:
- State changes are primarily user-driven
- Data is naturally structured as discrete records
- Brief delays in synchronization are acceptable

However, **laboratory systems present unique challenges**:
- Equipment state changes continuously and autonomously
- Multiple interfaces need real-time synchronization
- Complex interdependent state (sensors, equipment, safety systems)
- Actions trigger cascading state changes across the system

Traditional REST-based synchronization falls short because:
- **Polling is inefficient** for rapidly changing sensor data
- **Request-response patterns** don't handle autonomous equipment state changes
- **Manual state management** becomes complex with multiple synchronized views
- **Race conditions** can occur when multiple clients update state

## 🔄 Alternative Approaches

### CRDTs (Conflict-free Replicated Data Types)
One solution is to use **CRDTs** like in [Yjs-FastAPI-Svelte](https://github.com/sansseriff/Yjs-FastAPI-Svelte), which provide:
- Automatic conflict resolution
- Distributed state synchronization
- Offline-first capabilities

However, CRDTs may be **overpowered** for laboratory software because:
- Lab equipment control doesn't need arbitrary collaborative editing
- We need **centralized authority** (the lab computer) over equipment state
- Users primarily need to **view state** and **trigger actions**, not modify arbitrary data

### WebSocket + JSON Patch: The Middle Ground
This project explores a **middle ground** that provides:
- **More advanced than REST**: Real-time state synchronization without polling
- **Simpler than CRDTs**: Centralized state authority with broadcast updates
- **Action-oriented**: Users trigger commands; system handles state synchronization
- **Efficient**: Only state changes are transmitted, not full state snapshots

## 🎯 Project Overview

This application explores a novel approach to state management in laboratory software:

- **WebSocket-based state synchronization**: Instead of traditional request-response patterns, state changes are broadcasted via WebSockets using JSON Patch
- **Decoupled architecture**: Frontend and backend maintain their own state representations but stay synchronized through patch operations
- **Real-time updates**: All connected clients receive immediate updates when any part of the lab state changes
- **Focus on developer experience**: Laboratory software developers can focus on domain logic rather than state synchronization

## 🏗️ Architecture

The system consists of two main components:

### Backend (`/app` folder)

- **FastAPI** server with WebSocket support
- Maintains authoritative lab state (sensors, equipment, alerts)
- Generates JSON patches when state changes occur
- Broadcasts patches to all connected clients
- Provides REST endpoints for command execution

### Frontend (`/web` folder)

- **Svelte 5** application with TypeScript
- Reactive state management using Svelte's new runes system
- Applies incoming JSON patches to maintain synchronized state
- Modern, responsive UI for laboratory equipment control

## 🚀 Getting Started

### Prerequisites

- Python 3.13+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Bun](https://bun.sh/) (JavaScript runtime)

### Running the Application

1. **Start the backend server:**

   ```bash
   cd app
   uv run main.py
   # or for development with auto-reload:
   uv run fastapi dev main.py
   ```

   The server will start on `http://localhost:8000`

2. **Start the frontend development server:**
   ```bash
   cd web
   bun install
   bun run dev
   ```
   The web interface will be available at `http://localhost:5173`

## 📋 Features

### Real-time State Synchronization

- **Sensors**: Temperature, pressure, humidity with live updates
- **Equipment**: Pump controls, valve positions
- **Alerts**: System notifications and warnings
- **Version tracking**: State versioning for consistency

### Interactive Controls

- Toggle pump on/off
- Adjust pump speed
- Real-time sensor readings
- Alert management

### Developer-Friendly

- **Reactive collections**: Generic system for managing different entity types
- **Type safety**: Full TypeScript support in the frontend
- **Extensible**: Easy to add new equipment types and sensors
- **Modular**: Clean separation of concerns

## 🔧 Technical Implementation

### JSON Patch Workflow

1. User interacts with the UI (e.g., toggles a pump)
2. Frontend sends command via WebSocket or REST API
3. Backend updates its authoritative state
4. Backend generates JSON patch describing the change
5. Patch is broadcasted to all connected clients
6. Each client applies the patch to their local state

### State Management

- **Backend**: Python dictionaries with JSON Patch generation
- **Frontend**: Reactive Svelte stores with automatic UI updates
- **Synchronization**: Bidirectional WebSocket communication

## 🎛️ Equipment Types

Currently supports:

- **Pumps**: Start/stop control, speed adjustment
- **Sensors**: Temperature, pressure, humidity monitoring
- **Alerts**: System-wide notification system

Easy to extend with new equipment types by:

1. Adding state structure to backend
2. Creating corresponding frontend components
3. Implementing control logic

## 🔮 Future Development

This experimental foundation is intended for evolution into comprehensive laboratory software:

- **Cryostat control**: Temperature ramping, cooling cycles
- **Multi-instrument coordination**: Synchronized equipment operations
- **Data logging**: Historical state tracking and analysis
- **Safety systems**: Automated alerts and emergency procedures
- **Multi-user support**: Role-based access and collaborative control

## 🛠️ Development

### Backend Dependencies

- `fastapi[standard]` - Web framework with WebSocket support
- `jsonpatch` - JSON Patch generation and application
- `websockets` - WebSocket communication

### Frontend Dependencies

- `svelte` - Reactive frontend framework
- `fast-json-patch` - JSON Patch application
- `vite` - Build tool and development server

### Project Structure

```
├── app/                    # Python backend
│   ├── main.py            # FastAPI application
│   ├── pyproject.toml     # Python dependencies
│   └── README.md          # Backend documentation
├── web/                   # Svelte frontend
│   ├── src/
│   │   ├── lib/
│   │   │   ├── state/     # State management
│   │   │   └── controllers/ # Equipment controllers
│   │   └── App.svelte     # Main application
│   ├── package.json       # Node.js dependencies
│   └── README.md          # Frontend documentation
└── ui.png                 # Application screenshot
```
