"""Persistent, user-scoped study tasks for the Notely workspace."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend import auth, database as db

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=2000)
    due_date: str | None = Field(default=None, max_length=10)
    topic_id: int | None = None


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    details: str | None = Field(default=None, max_length=2000)
    due_date: str | None = Field(default=None, max_length=10)
    topic_id: int | None = None
    completed: bool | None = None


def _validate_topic(user_id: int, topic_id: int | None) -> None:
    if topic_id is not None and db.get_topic(user_id, topic_id) is None:
        raise HTTPException(status_code=404, detail="Course notebook not found.")


@router.get("")
async def list_tasks(user=Depends(auth.current_user)):
    return {"tasks": [dict(task) for task in db.list_tasks(user["id"])]}


@router.post("")
async def create_task(body: TaskCreate, user=Depends(auth.current_user)):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Enter a task title.")
    _validate_topic(user["id"], body.topic_id)
    task_id = db.create_task(
        user["id"], title, body.details, body.due_date, body.topic_id
    )
    task = next((dict(t) for t in db.list_tasks(user["id"]) if t["id"] == task_id), None)
    return {"task": task}


@router.patch("/{task_id}")
async def patch_task(task_id: int, body: TaskPatch, user=Depends(auth.current_user)):
    updates = body.dict(exclude_unset=True)
    if "title" in updates:
        updates["title"] = (updates["title"] or "").strip()
        if not updates["title"]:
            raise HTTPException(status_code=400, detail="Task title cannot be empty.")
    if "topic_id" in updates:
        _validate_topic(user["id"], updates["topic_id"])
    if not db.update_task(user["id"], task_id, updates):
        raise HTTPException(status_code=404, detail="Task not found.")
    task = next((dict(t) for t in db.list_tasks(user["id"]) if t["id"] == task_id), None)
    return {"task": task}


@router.delete("/{task_id}")
async def remove_task(task_id: int, user=Depends(auth.current_user)):
    if not db.delete_task(user["id"], task_id):
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"deleted": True}
