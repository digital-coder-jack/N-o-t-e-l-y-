"""
=====================================================================
 AI NOTEBOOK  -  backend/routes/chat.py
=====================================================================
AI chat interface + study tools + dashboard statistics.

Chat:
  GET    /api/chats                 -> list user's chats
  POST   /api/chats                 -> create a new chat
  GET    /api/chats/{id}            -> chat with all messages
  PUT    /api/chats/{id}            -> rename chat
  DELETE /api/chats/{id}            -> delete chat
  POST   /api/chats/{id}/stream     -> send a message, stream AI reply (SSE)

Dashboard:
  GET    /api/stats                 -> usage statistics for the dashboard

Study tools:
  POST   /api/tools/notes           -> generate + save notes
  GET    /api/tools/notes           -> list saved notes
  DELETE /api/tools/notes/{id}      -> delete a note
  POST   /api/tools/quiz            -> generate + save a quiz
  GET    /api/tools/quiz            -> list saved quizzes
  DELETE /api/tools/quiz/{id}       -> delete a quiz
  POST   /api/tools/flashcards      -> generate flashcards
  POST   /api/tools/plan            -> generate study plan
  POST   /api/tools/summarize       -> summarise pasted text
  POST   /api/tools/homework        -> homework helper
=====================================================================
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend import ai, auth, database as db, providers
from backend.stream_manager import stream_manager

router = APIRouter(prefix="/api", tags=["chat"])


def _sse(payload: dict) -> str:
    """Serialise a dict into a single Server-Sent-Events 'data:' frame."""
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _user_model(user) -> str:
    """Return the AI model selection saved in the user's settings.

    Falls back to 'auto' when no valid preference is stored.
    """
    try:
        row = db.get_user_settings(user["id"])
        if row:
            ai_settings = json.loads(row["ai_settings"] or "{}")
            choice = str(ai_settings.get("model", "auto")).lower()
            if choice in providers.VALID_SELECTIONS:
                return "default" if choice == "auto" else choice
    except Exception:
        pass
    return "auto"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class NewChatIn(BaseModel):
    title: str | None = None


class RenameChatIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class StreamIn(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    model: str | None = None  # optional per-message provider override


class TopicIn(BaseModel):
    topic: str = Field(min_length=1, max_length=300)


class NoteSaveIn(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=100000)


class QuizIn(BaseModel):
    topic: str = Field(min_length=1, max_length=300)
    num_questions: int = Field(default=5, ge=1, le=15)


class FlashIn(BaseModel):
    topic: str = Field(min_length=1, max_length=300)
    num_cards: int = Field(default=8, ge=1, le=20)


class PlanIn(BaseModel):
    goal: str = Field(min_length=1, max_length=300)
    days: int = Field(default=7, ge=1, le=60)


class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


class QuestionIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


# ===========================================================================
# CHATS
# ===========================================================================
@router.get("/chats")
async def get_chats(user=Depends(auth.current_user)):
    rows = db.list_chats(user["id"])
    return {"chats": [dict(r) for r in rows]}


@router.post("/chats")
async def new_chat(body: NewChatIn, user=Depends(auth.current_user)):
    title = (body.title or "New Chat").strip()[:120] or "New Chat"
    chat_id = db.create_chat(user["id"], title)
    return {"chat": dict(db.get_chat(user["id"], chat_id))}


@router.get("/chats/{chat_id}")
async def get_one_chat(chat_id: int, user=Depends(auth.current_user)):
    chat = db.get_chat(user["id"], chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found.")
    messages = db.list_messages(chat_id)
    return {"chat": dict(chat), "messages": [dict(m) for m in messages]}


@router.put("/chats/{chat_id}")
async def rename(chat_id: int, body: RenameChatIn, user=Depends(auth.current_user)):
    if not db.rename_chat(user["id"], chat_id, body.title):
        raise HTTPException(status_code=404, detail="Chat not found.")
    return {"chat": dict(db.get_chat(user["id"], chat_id))}


@router.delete("/chats/{chat_id}")
async def remove_chat(chat_id: int, user=Depends(auth.current_user)):
    if not db.delete_chat(user["id"], chat_id):
        raise HTTPException(status_code=404, detail="Chat not found.")
    return {"deleted": True}


@router.post("/chats/{chat_id}/cancel")
async def cancel_stream(chat_id: int, user=Depends(auth.current_user)):
    """Explicitly cancel the active stream for this chat, if any.

    Idempotent: returns ``cancelled: false`` if nothing was running. Used by
    the client's "Stop" button. A brand-new /stream request cancels the
    previous one automatically, so this is only for explicit user stops.
    """
    chat = db.get_chat(user["id"], chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found.")
    key = stream_manager.make_key(user["id"], chat_id)
    cancelled = await stream_manager.cancel(key)
    return {"cancelled": cancelled}


@router.post("/chats/{chat_id}/stream")
async def stream_message(chat_id: int, body: StreamIn, request: Request, user=Depends(auth.current_user)):
    """
    Save the user message, then stream the assistant reply as Server-Sent
    Events.

    Safety guarantees (see backend/stream_manager.py):
      * Only ONE active stream per (user, chat). Starting a new one ALWAYS
        cancels the previous in-flight stream first — no overlapping streams,
        no race conditions.
      * A placeholder assistant row is created up front; tokens are written
        to it and it is finalised at the end, so state updates ALWAYS target
        the LATEST assistant message (never a stale row), and history stays
        a clean user→assistant pair even if the client disconnects.

    SSE frame shapes (each a single `data:` JSON object):
        {"event":"start",     "message_id":N, "generation":G}
        {"event":"provider",  "provider":"AI Notebook"}
        {"event":"token",     "token":"..."}
        {"event":"cancelled", "reason":"...", "message_id":N}
        {"event":"error",     "error":{"type":"timeout","message":"..."}}
        {"event":"done",      "message_id":N, "provider":"AI Notebook"}
    """
    chat = db.get_chat(user["id"], chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found.")

    key = stream_manager.make_key(user["id"], chat_id)

    # ---- Atomically supersede any in-flight stream and claim this slot. ----
    # begin() signals the previous generator's cancel_event before returning.
    generation, cancel_event = await stream_manager.begin(key)

    # Persist the user's message.
    db.add_message(chat_id, "user", body.content)

    # Auto-title the chat from the first user message.
    history_rows = db.list_messages(chat_id)
    if len([m for m in history_rows if m["role"] == "user"]) == 1:
        auto_title = body.content.strip().replace("\n", " ")[:48]
        db.rename_chat(user["id"], chat_id, auto_title or "New Chat")

    history = [{"role": m["role"], "content": m["content"]} for m in history_rows]

    # Create the assistant placeholder row NOW so every later update targets
    # exactly this message id (the latest assistant message). Bind it to the
    # active generation; if we were already superseded, bail out cleanly.
    assistant_id = db.add_message(chat_id, "assistant", "")
    if not await stream_manager.attach_message(key, generation, assistant_id):
        db.delete_message(assistant_id)

        async def _superseded():
            yield _sse({"event": "cancelled", "reason": "superseded", "message_id": assistant_id})

        return StreamingResponse(_superseded(), media_type="text/event-stream")

    # Resolve the selected product tier. Invalid legacy values fall back to the
    # default tier; a selected tier is never silently downgraded.
    requested = (body.model or "").lower()
    selection = requested if requested in providers.VALID_SELECTIONS else _user_model(user)

    async def event_generator():
        collected: list[str] = []
        provider_used = "auto"
        final_event = "done"
        error_payload = None
        try:
            yield _sse({"event": "start", "message_id": assistant_id, "generation": generation})

            stream_iter = ai.chat_stream(
                history, selection=selection, cancel_event=cancel_event
            ).__aiter__()
            next_event = None
            while True:
                if await request.is_disconnected():
                    cancel_event.set()
                    if next_event is not None and not next_event.done():
                        next_event.cancel()
                        await asyncio.gather(next_event, return_exceptions=True)
                    final_event = "cancelled"
                    break
                if next_event is None:
                    next_event = asyncio.create_task(stream_iter.__anext__())
                finished, _ = await asyncio.wait({next_event}, timeout=14.0)
                if not finished:
                    # Comment frames keep proxies alive without being parsed as app events.
                    yield ": keep-alive\n\n"
                    continue
                try:
                    event, value = next_event.result()
                except StopAsyncIteration:
                    break
                next_event = None
                if event == "meta":
                    provider_used = value
                    yield _sse({"event": "provider", "provider": value})
                elif event == "token":
                    collected.append(value)
                    yield _sse({"event": "token", "token": value})
                elif event == "cancelled":
                    final_event = "cancelled"
                    yield _sse({"event": "cancelled", "reason": value, "message_id": assistant_id})
                    break
                elif event == "error":
                    final_event = "error"
                    error_payload = value if isinstance(value, dict) else {"type": "error", "message": "AI is temporarily unavailable. Please retry."}
                    yield _sse({"event": "error", "error": error_payload})
        except Exception as exc:  # noqa: BLE001
            final_event = "error"
            error_payload = {"type": "internal", "message": "stream interrupted"}
            yield _sse({"event": "error", "error": error_payload})
        finally:
            # Finalise the SAME placeholder row — update only the latest
            # assistant message, keeping persisted state consistent.
            full = "".join(collected).strip()
            if final_event == "cancelled":
                # Keep whatever was produced; mark interruption if empty.
                db.update_message(assistant_id, full or "⏹️ Generation stopped.")
            elif final_event == "error" and not full:
                msg = (error_payload or {}).get("message") if isinstance(error_payload, dict) else None
                db.update_message(assistant_id, f"⚠️ {msg or 'No response was generated.'}")
            else:
                db.update_message(assistant_id, full or "⚠️ No response was generated.")

            # Release the slot only if we are still the active generation.
            await stream_manager.finish(key, generation)

            if not await request.is_disconnected():
                yield _sse({
                "event": final_event,
                "message_id": assistant_id,
                "provider": provider_used,
            })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Encoding": "identity",
        },
    )


# ===========================================================================
# DASHBOARD STATS
# ===========================================================================
@router.get("/stats")
async def stats(user=Depends(auth.current_user)):
    uid = user["id"]
    chats = db.list_chats(uid)
    return {
        "total_chats": len(chats),
        "total_messages": db.count_messages(uid),
        "ai_responses": db.count_ai_messages(uid),
        "notes": db.count_notes(uid),
        "quizzes": db.count_quizzes(uid),
        "topics": db.count_topics(uid),
        "ai_generations": db.count_ai_messages(uid) + db.count_artifacts(uid),
        "recent_chats": [dict(c) for c in chats[:5]],
        "recent_notes": [dict(n) for n in db.list_notes(uid)[:6]],
        "daily_activity": db.daily_activity(uid, days=7),
    }


# ===========================================================================
# STUDY TOOLS
# ===========================================================================
@router.post("/tools/notes")
async def make_notes(body: TopicIn, user=Depends(auth.current_user)):
    content = await ai.generate_notes(body.topic, selection=_user_model(user))
    note_id = db.add_note(user["id"], body.topic, content)
    return {"id": note_id, "topic": body.topic, "content": content}


@router.get("/tools/notes")
async def get_notes(user=Depends(auth.current_user)):
    return {"notes": [dict(n) for n in db.list_notes(user["id"])]}


@router.post("/notes")
async def create_note(body: NoteSaveIn, user=Depends(auth.current_user)):
    """Create an editable note for the signed-in user."""
    note_id = db.add_note(user["id"], body.topic, body.content)
    note = db.get_note(user["id"], note_id)
    return {"note": dict(note) if note else {"id": note_id, "topic": body.topic, "content": body.content}}


@router.put("/notes/{note_id}")
async def save_note(note_id: int, body: NoteSaveIn, user=Depends(auth.current_user)):
    """Save note title and content, scoped to the authenticated owner."""
    if not db.update_note(user["id"], note_id, body.topic, body.content):
        raise HTTPException(status_code=404, detail="Note not found.")
    note = db.get_note(user["id"], note_id)
    return {"note": dict(note) if note else {"id": note_id, "topic": body.topic, "content": body.content}}


@router.delete("/tools/notes/{note_id}")
async def remove_note(note_id: int, user=Depends(auth.current_user)):
    if not db.delete_note(user["id"], note_id):
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"deleted": True}


@router.post("/tools/quiz")
async def make_quiz(body: QuizIn, user=Depends(auth.current_user)):
    questions = await ai.generate_quiz(body.topic, body.num_questions, selection=_user_model(user))
    if not questions:
        raise HTTPException(status_code=502, detail="Could not generate a quiz. Try a clearer topic.")
    quiz_id = db.add_quiz(user["id"], body.topic, questions)
    return {"id": quiz_id, "topic": body.topic, "questions": questions}


@router.get("/tools/quiz")
async def get_quizzes(user=Depends(auth.current_user)):
    return {"quizzes": db.list_quizzes(user["id"])}


@router.delete("/tools/quiz/{quiz_id}")
async def remove_quiz(quiz_id: int, user=Depends(auth.current_user)):
    if not db.delete_quiz(user["id"], quiz_id):
        raise HTTPException(status_code=404, detail="Quiz not found.")
    return {"deleted": True}


@router.post("/tools/flashcards")
async def make_flashcards(body: FlashIn, user=Depends(auth.current_user)):
    cards = await ai.generate_flashcards(body.topic, body.num_cards, selection=_user_model(user))
    if not cards:
        raise HTTPException(status_code=502, detail="Could not generate flashcards. Try a clearer topic.")
    return {"topic": body.topic, "cards": cards}


@router.post("/tools/plan")
async def make_plan(body: PlanIn, user=Depends(auth.current_user)):
    content = await ai.generate_study_plan(body.goal, body.days, selection=_user_model(user))
    return {"goal": body.goal, "days": body.days, "content": content}


@router.post("/tools/summarize")
async def summarize(body: TextIn, user=Depends(auth.current_user)):
    content = await ai.summarize_text(body.text, selection=_user_model(user))
    return {"summary": content}


@router.post("/tools/homework")
async def homework(body: QuestionIn, user=Depends(auth.current_user)):
    content = await ai.homework_help(body.question, selection=_user_model(user))
    return {"answer": content}


# ===========================================================================
# AI MODEL SELECTION + STATUS MONITORING
# ===========================================================================
class ModelIn(BaseModel):
    model: str = Field(min_length=1, max_length=20)

@router.get("/ai/models")
async def ai_models(user=Depends(auth.current_user)):
    """List selectable providers + the user's current selection."""
    snapshot = providers.status_snapshot()
    return {
        "selected": _user_model(user),
        "options": ["default", "pro", "pro_max"],
        "providers": snapshot["providers"],
        "display_names": {
            "default": "AI Notebook",
            "pro": "AI Notebook Pro",
            "pro_max": "AI Notebook Pro Max",
        },
    }


@router.put("/ai/model")
async def set_ai_model(body: ModelIn, user=Depends(auth.current_user)):
    """Persist the user's preferred AI provider/model."""
    choice = body.model.lower()
    if choice not in providers.VALID_SELECTIONS:
        raise HTTPException(status_code=400, detail="Unknown model selection.")
    # Merge into the existing ai_settings blob so other prefs survive.
    row = db.get_user_settings(user["id"])
    current = {}
    if row:
        try:
            current = json.loads(row["ai_settings"] or "{}")
        except Exception:
            current = {}
    current["model"] = choice
    db.update_user_settings(user["id"], "ai_settings", current)
    return {"selected": choice}


@router.get("/ai/status")
async def ai_status():
    """Public health/monitoring snapshot of all AI providers (no keys)."""
    return providers.status_snapshot()
