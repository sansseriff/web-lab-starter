from __future__ import annotations

import copy
import json
import threading
from typing import Any

import jsonpatch
from pydantic import ValidationError

from models import LabStateModel


class StateStore:
    def __init__(self, initial_state: dict[str, Any]):
        self._lock = threading.RLock()
        self._state: dict[str, Any] = {}
        self.replace_state(initial_state)

    def replace_state(self, state: dict[str, Any]) -> None:
        """Replace runtime state after validating schema."""
        with self._lock:
            validated = LabStateModel.model_validate(state)
            self._state = validated.model_dump(mode="json")

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._state))

    def get(self, path: str) -> Any:
        with self._lock:
            keys = [key for key in path.strip("/").split("/") if key]
            current: Any = self._state
            for key in keys:
                current = current[key]
            return copy.deepcopy(current)

    def apply_value(self, path: str, value: Any) -> tuple[list[dict[str, Any]], int]:
        with self._lock:
            old_state = json.loads(json.dumps(self._state))
            keys = [key for key in path.strip("/").split("/") if key]
            if not keys:
                raise ValueError("path must not be empty")

            current: Any = self._state
            for key in keys[:-1]:
                if key not in current or not isinstance(current[key], dict):
                    current[key] = {}
                current = current[key]
            current[keys[-1]] = value

            self._state["version"] = int(self._state.get("version", 0)) + 1
            self._validate_current_state()

            patch = jsonpatch.make_patch(old_state, self._state)
            return list(patch), int(self._state["version"])

    def _validate_current_state(self) -> None:
        try:
            validated = LabStateModel.model_validate(self._state)
        except ValidationError as exc:
            raise ValueError(f"state validation failed: {exc}") from exc
        self._state = validated.model_dump(mode="json")
