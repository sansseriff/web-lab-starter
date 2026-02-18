from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class SensorState(BaseModel):
    value: float
    unit: str
    status: Literal["normal", "warning", "error"] = "normal"


class EquipmentState(BaseModel):
    status: str
    model_config = ConfigDict(extra="allow")


class AlertState(BaseModel):
    id: str
    message: str
    severity: Literal["info", "warning", "error"] = "info"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LabStateModel(BaseModel):
    sensors: dict[str, SensorState]
    equipment: dict[str, EquipmentState]
    alerts: list[AlertState]
    version: int = 1


class CommandRequest(BaseModel):
    command: str
    params: dict[str, Any] = Field(default_factory=dict)


def build_default_state() -> LabStateModel:
    return LabStateModel(
        sensors={
            "temperature": SensorState(value=22.5, unit="C", status="normal"),
            "pressure": SensorState(value=1013.25, unit="hPa", status="normal"),
            "humidity": SensorState(value=45.2, unit="%", status="normal"),
        },
        equipment={
            "pump_1": EquipmentState(status="running", speed=1200),
            "valve_a": EquipmentState(status="open", position="open", angle=90),
        },
        alerts=[],
        version=1,
    )
