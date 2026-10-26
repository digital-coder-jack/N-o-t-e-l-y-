"""
=====================================================================
 AI NOTEBOOK  -  backend/routes/topics.py
=====================================================================
The AI Learning OS: every topic becomes a full learning workspace.

Topics:
  GET    /api/topics                      -> list user's topics
  POST   /api/topics                      -> create (or reuse) a topic
  GET    /api/topics/{id}                 -> topic + list of generated sections
  PATCH  /api/topics/{id}                 -> pin / favorite flags
  PUT    /api/topics/{id}/progress        -> save roadmap progress JSON
  DELETE /api/topics/{id}                 -> delete a topic (cascade artifacts)

Sections (cached per topic; ?refresh=1 regenerates):
  POST   /api/topics/{id}/generate/{kind}
     kind ∈ overview | summary | notes | mindmap | roadmap | timeline |
            quiz (body: difficulty) | flashcards | compare (body: other) |
            practice | resources

Topic chat (SSE, topic-aware system prompt):
  POST   /api/topics/{id}/chat            -> {messages:[...]} streamed reply

Search:
  GET    /api/search?q=...                -> global search for command palette

Notes quality-of-life:
  PATCH  /api/tools/notes/{id}            -> pin / favorite
  POST   /api/tools/notes/{id}/duplicate  -> duplicate a note
=====================================================================
"""

from __future__ import annotations

import asyncio
import json
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend import ai, auth, database as db, providers

router = APIRouter(prefix="/api", tags=["topics"])

MD_KINDS = {"overview", "summary", "notes", "practice", "resources"}
JSON_KINDS = {"mindmap", "roadmap", "timeline", "quiz", "flashcards"}
ALL_KINDS = MD_KINDS | JSON_KINDS | {"compare"}


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _user_model(user) -> str:
    try:
        row = db.get_user_settings(user["id"])
        if row:
            ai_settings = json.loads(row["ai_settings"] or "{}")
            choice = str(ai_settings.get("model", "auto")).lower()
            if choice in providers.VALID_SELECTIONS:
                return choice
    except Exception:
        pass
    return "auto"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TopicIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    emoji: str | None = None


class FlagsIn(BaseModel):
    pinned: bool | None = None
    favorite: bool | None = None


class CourseLinkIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=8, max_length=2000)


class ProgressIn(BaseModel):
    progress: dict = Field(default_factory=dict)


class GenerateIn(BaseModel):
    difficulty: str | None = None   # quiz
    other: str | None = None        # compare target
    num_cards: int | None = None    # flashcards


class TopicChatIn(BaseModel):
    messages: list[dict] = Field(min_length=1, max_length=40)


# ===========================================================================
# TOPIC CRUD
# ===========================================================================
@router.get("/topics")
async def list_topics(user=Depends(auth.current_user)):
    topics = []
    for t in db.list_topics(user["id"]):
        d = dict(t)
        d["sections"] = [{"kind": a["kind"], "variant": a["variant"], "updated_at": a["updated_at"]} for a in db.list_artifacts(t["id"])]
        topics.append(d)
    return {"topics": topics}


@router.post("/topics")
async def create_topic(body: TopicIn, user=Depends(auth.current_user)):
    title = body.title.strip()
    existing = db.find_topic_by_title(user["id"], title)
    if existing:
        return {"topic": dict(existing), "created": False}
    topic_id = db.create_topic(user["id"], title, body.emoji or "📚")
    return {"topic": dict(db.get_topic(user["id"], topic_id)), "created": True}


@router.post("/topics/{topic_id}/links")
async def add_course_link(topic_id: int, body: CourseLinkIn, user=Depends(auth.current_user)):
    topic = db.get_topic(user["id"], topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Course notebook not found.")
    url = body.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Enter a valid http or https link.")
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Enter a link title.")
    existing = db.get_artifact(topic_id, "links", "")
    links = []
    if existing:
        try:
            links = json.loads(existing["content"])
            if not isinstance(links, list):
                links = []
        except (TypeError, ValueError):
            links = []
    link = {"id": uuid4().hex, "title": title, "url": url}
    links.append(link)
    db.upsert_artifact(topic_id, "links", json.dumps(links), "")
    return {"link": link, "links": links}


@router.delete("/topics/{topic_id}/links/{link_id}")
async def delete_course_link(topic_id: int, link_id: str, user=Depends(auth.current_user)):
    if db.get_topic(user["id"], topic_id) is None:
        raise HTTPException(status_code=404, detail="Course notebook not found.")
    existing = db.get_artifact(topic_id, "links", "")
    if not existing:
        raise HTTPException(status_code=404, detail="Course link not found.")
    try:
        links = json.loads(existing["content"])
    except (TypeError, ValueError):
        links = []
    filtered = [link for link in links if str(link.get("id")) != link_id]
    if len(filtered) == len(links):
        raise HTTPException(status_code=404, detail="Course link not found.")
    if filtered:
        db.upsert_artifact(topic_id, "links", json.dumps(filtered), "")
    else:
        db.upsert_artifact(topic_id, "links", "[]", "")
    return {"deleted": True}


@router.get("/topics/{topic_id}")
async def get_topic(topic_id: int, user=Depends(auth.current_user)):
    topic = db.get_topic(user["id"], topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found.")
    d = dict(topic)
    try:
        d["progress"] = json.loads(d.get("progress") or "{}")
    except Exception:
        d["progress"] = {}
    d["sections"] = [dict(a) for a in db.list_artifacts(topic_id)]
    return {"topic": d}


@router.patch("/topics/{topic_id}")
async def patch_topic(topic_id: int, body: FlagsIn, user=Depends(auth.current_user)):
    if not db.update_topic_flags(user["id"], topic_id, body.pinned, body.favorite):
        raise HTTPException(status_code=404, detail="Topic not found.")
    return {"topic": dict(db.get_topic(user["id"], topic_id))}


@router.put("/topics/{topic_id}/progress")
async def save_progress(topic_id: int, body: ProgressIn, user=Depends(auth.current_user)):
    if not db.update_topic_progress(user["id"], topic_id, body.progress):
        raise HTTPException(status_code=404, detail="Topic not found.")
    return {"saved": True}


@router.delete("/topics/{topic_id}")
async def remove_topic(topic_id: int, user=Depends(auth.current_user)):
    if not db.delete_topic(user["id"], topic_id):
        raise HTTPException(status_code=404, detail="Topic not found.")
    return {"deleted": True}


# ===========================================================================
# SECTION GENERATION (cached)
# ===========================================================================
@router.post("/topics/{topic_id}/generate/{kind}")
async def generate_section(
    topic_id: int,
    kind: str,
    body: GenerateIn | None = None,
    refresh: int = Query(default=0),
    user=Depends(auth.current_user),
):
    topic = db.get_topic(user["id"], topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found.")
    kind = kind.lower()
    if kind not in ALL_KINDS:
        raise HTTPException(status_code=400, detail=f"Unknown section '{kind}'.")

    body = body or GenerateIn()
    title = topic["title"]
    selection = _user_model(user)

    # Variant lets us cache multiple flavours of the same section.
    variant = ""
    if kind == "quiz":
        variant = (body.difficulty or "medium").lower()
        if variant not in ("easy", "medium", "hard", "expert"):
            variant = "medium"
    elif kind == "compare":
        if not body.other or not body.other.strip():
            raise HTTPException(status_code=400, detail="Provide a topic to compare with.")
        variant = body.other.strip().lower()[:100]

    # Serve from cache unless a refresh is requested.
    if not refresh:
        cached = db.get_artifact(topic_id, kind, variant)
        if cached:
            content = cached["content"]
            if kind in JSON_KINDS:
                try:
                    content = json.loads(content)
                except Exception:
                    content = None
            if content:
                return {"kind": kind, "variant": variant, "content": content, "cached": True}

    # ---- Generate fresh ----
    if kind in MD_KINDS:
        content = await ai.generate_topic_section(title, kind, selection=selection)
        if not content or not content.strip():
            raise HTTPException(status_code=502, detail="Generation failed. Try again.")
        if "not configured" not in content[:120]:  # never cache the fallback notice
            db.upsert_artifact(topic_id, kind, content, variant)
        return {"kind": kind, "variant": variant, "content": content, "cached": False}

    if kind == "compare":
        content = await ai.generate_compare(title, body.other.strip(), selection=selection)
        if not content or not content.strip():
            raise HTTPException(status_code=502, detail="Generation failed. Try again.")
        if "not configured" not in content[:120]:
            db.upsert_artifact(topic_id, kind, content, variant)
        return {"kind": kind, "variant": variant, "content": content, "cached": False}

    # JSON sections
    if kind == "mindmap":
        data = await ai.generate_mindmap(title, selection=selection)
    elif kind == "roadmap":
        data = await ai.generate_roadmap(title, selection=selection)
    elif kind == "timeline":
        data = await ai.generate_timeline(title, selection=selection)
    elif kind == "quiz":
        data = await ai.generate_topic_quiz(title, variant, selection=selection)
    else:  # flashcards
        data = await ai.generate_flashcards(title, body.num_cards or 10, selection=selection)
        data = data or None

    if data is None:
        raise HTTPException(status_code=502, detail="Generation failed. Try again.")
    db.upsert_artifact(topic_id, kind, json.dumps(data), variant)
    return {"kind": kind, "variant": variant, "content": data, "cached": False}


# ===========================================================================
# TOPIC-AWARE CHAT (SSE)
# ===========================================================================
@router.post("/topics/{topic_id}/chat")
async def topic_chat(topic_id: int, body: TopicChatIn, request: Request, user=Depends(auth.current_user)):
    topic = db.get_topic(user["id"], topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found.")

    system = ai.TOPIC_CHAT_SYSTEM.format(topic=topic["title"])
    history = [{"role": "system", "content": system}]
    for m in body.messages[-20:]:
        role = m.get("role")
        content = str(m.get("content", ""))[:8000]
        if role in ("user", "assistant") and content:
            history.append({"role": role, "content": content})

    selection = _user_model(user)

    async def gen():
        iterator = providers.chat_stream(
            history, selection=selection, temperature=0.7, max_tokens=1500
        ).__aiter__()
        pending = None
        disconnected = False
        try:
            yield _sse({"event": "start"})
            while True:
                if await request.is_disconnected():
                    disconnected = True
                    if pending is not None and not pending.done():
                        pending.cancel()
                        await asyncio.gather(pending, return_exceptions=True)
                    break
                if pending is None:
                    pending = asyncio.create_task(iterator.__anext__())
                finished, _ = await asyncio.wait({pending}, timeout=14.0)
                if not finished:
                    yield ": keep-alive\\n\\n"
                    continue
                try:
                    event, value = pending.result()
                except StopAsyncIteration:
                    break
                pending = None
                if event == "meta":
                    yield _sse({"event": "provider", "provider": value})
                elif event == "token":
                    yield _sse({"event": "token", "token": value})
                elif event == "cancelled":
                    yield _sse({"event": "cancelled", "reason": str(value)})
                    break
                elif event == "error":
                    err = value if isinstance(value, dict) else {"type": "unavailable", "message": "AI is temporarily unavailable. Please retry."}
                    yield _sse({"event": "error", "error": err})
                    break
        except Exception:
            if not disconnected:
                yield _sse({"event": "error", "error": {"type": "unavailable", "message": "Notely could not finish this response. Please retry."}})
        finally:
            if pending is not None and not pending.done():
                pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)
            try:
                await iterator.aclose()
            except Exception:
                pass
            if not disconnected:
                yield _sse({"event": "done"})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Encoding": "identity",
        },
    )


# ===========================================================================
# GLOBAL SEARCH
# ===========================================================================
@router.get("/search")
async def search(q: str = Query(default="", max_length=200), user=Depends(auth.current_user)):
    return db.global_search(user["id"], q)


# ===========================================================================
# NOTES QoL (pin / favorite / duplicate)
# ===========================================================================
class NoteFlagsIn(BaseModel):
    pinned: bool | None = None
    favorite: bool | None = None
    archived: bool | None = None
    deleted: bool | None = None


@router.patch("/tools/notes/{note_id}")
async def patch_note(note_id: int, body: NoteFlagsIn, user=Depends(auth.current_user)):
    if not db.update_note_flags(
        user["id"], note_id, body.pinned, body.favorite, body.archived, body.deleted
    ):
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"updated": True}


@router.post("/tools/notes/{note_id}/duplicate")
async def dup_note(note_id: int, user=Depends(auth.current_user)):
    new_id = db.duplicate_note(user["id"], note_id)
    if new_id is None:
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"id": new_id}
