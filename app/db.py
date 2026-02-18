from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Generator

from pydantic import ValidationError
from sqlmodel import Field, Session, SQLModel, create_engine, select

from models import LabStateModel


class PersistedLabState(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    schema_version: int = Field(default=1)
    state_json: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def ensure_persisted_state(
    session: Session, default_state: dict[str, Any], schema_version: int = 1
) -> LabStateModel:
    row = session.exec(select(PersistedLabState).where(PersistedLabState.id == 1)).one_or_none()
    if row is None:
        row = PersistedLabState(
            id=1,
            schema_version=schema_version,
            state_json=json.dumps(default_state),
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return LabStateModel.model_validate_json(row.state_json)

    try:
        return LabStateModel.model_validate_json(row.state_json)
    except ValidationError:
        row.state_json = json.dumps(default_state)
        row.schema_version = schema_version
        row.updated_at = datetime.now(timezone.utc)
        session.add(row)
        session.commit()
        session.refresh(row)
        return LabStateModel.model_validate_json(row.state_json)


def save_persisted_state(
    session: Session, state: dict[str, Any], schema_version: int = 1
) -> None:
    row = session.exec(select(PersistedLabState).where(PersistedLabState.id == 1)).one_or_none()
    serialized = json.dumps(state)

    if row is None:
        row = PersistedLabState(
            id=1,
            schema_version=schema_version,
            state_json=serialized,
            updated_at=datetime.now(timezone.utc),
        )
    else:
        row.state_json = serialized
        row.schema_version = schema_version
        row.updated_at = datetime.now(timezone.utc)

    session.add(row)
    session.commit()
