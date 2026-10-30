"""
=====================================================================
 AI NOTEBOOK  -  backend/routes/files.py
=====================================================================
File upload + text extraction + AI summarisation.

Supported types:
  * PDF   (.pdf)  -> text extracted with pypdf
  * TXT   (.txt)  -> decoded directly
  * DOCX  (.docx) -> text extracted with python-docx
  * Image (.png/.jpg/...) -> stored; no OCR (kept lightweight), the user
                              is told images are stored for reference.

Endpoints (prefixed with /api):
  POST   /api/files/upload          -> upload a file, extract text, store metadata
  GET    /api/files                 -> list user's uploads
  POST   /api/files/{id}/summarize  -> summarise an uploaded file's text
  DELETE is intentionally omitted (uploads kept as a record).
=====================================================================
"""

from __future__ import annotations

import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from backend import ai, auth, database as db

router = APIRouter(prefix="/api/files", tags=["files"])

MAX_BYTES = 8 * 1024 * 1024  # 8 MB
EXTRACT_LIMIT = 200_000       # characters of extracted text to keep


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


def _extract_docx(data: bytes) -> str:
    try:
        import docx  # python-docx
    except ImportError:
        return ""
    try:
        document = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in document.paragraphs)
    except Exception:
        return ""


def _extract_txt(data: bytes) -> str:
    for enc in ("utf-8", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return ""


@router.post("/upload")
async def upload(file: UploadFile = File(...), topic_id: int | None = Form(default=None), user=Depends(auth.current_user)):
    if topic_id is not None and db.get_topic(user["id"], topic_id) is None:
        raise HTTPException(status_code=404, detail="Course notebook not found.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 8 MB).")

    name = (file.filename or "upload").strip()
    lower = name.lower()
    content_type = file.content_type or "application/octet-stream"

    if lower.endswith(".pdf") or content_type == "application/pdf":
        text = _extract_pdf(data)
        kind = "pdf"
    elif lower.endswith(".docx") or "wordprocessingml" in content_type:
        text = _extract_docx(data)
        kind = "docx"
    elif lower.endswith(".txt") or content_type.startswith("text/"):
        text = _extract_txt(data)
        kind = "txt"
    elif content_type.startswith("image/") or lower.endswith(
        (".png", ".jpg", ".jpeg", ".gif", ".webp")
    ):
        text = ""
        kind = "image"
    else:
        text = _extract_txt(data)
        kind = "other"

    extracted = (text or "").strip()[:EXTRACT_LIMIT]
    upload_id = db.add_upload(
        user["id"], name, content_type, len(data), extracted or None, topic_id
    )

    return {
        "id": upload_id,
        "topic_id": topic_id,
        "filename": name,
        "kind": kind,
        "size_bytes": len(data),
        "has_text": bool(extracted),
        "char_count": len(extracted),
        "preview": extracted[:500],
    }


@router.get("")
async def list_files(topic_id: int | None = Query(default=None), user=Depends(auth.current_user)):
    if topic_id is not None and db.get_topic(user["id"], topic_id) is None:
        raise HTTPException(status_code=404, detail="Course notebook not found.")
    return {"files": [dict(f) for f in db.list_uploads(user["id"], topic_id)]}


@router.get("/{upload_id}")
async def preview_file(upload_id: int, user=Depends(auth.current_user)):
    """Return extracted-text preview and metadata for a user's Library item."""
    row = db.get_upload(user["id"], upload_id)
    if row is None:
        raise HTTPException(status_code=404, detail="File not found.")
    return {
        "id": upload_id,
        "filename": row["filename"],
        "content_type": row["content_type"],
        "size_bytes": row["size_bytes"],
        "preview": (row["extracted"] or "")[:12000],
        "original_stored": False,
    }


@router.delete("/{upload_id}")
async def delete_file(upload_id: int, user=Depends(auth.current_user)):
    if not db.delete_upload(user["id"], upload_id):
        raise HTTPException(status_code=404, detail="File not found.")
    return {"deleted": True}


@router.post("/{upload_id}/summarize")
async def summarize_file(upload_id: int, user=Depends(auth.current_user)):
    row = db.get_upload(user["id"], upload_id)
    if row is None:
        raise HTTPException(status_code=404, detail="File not found.")
    text = row["extracted"]
    if not text:
        raise HTTPException(
            status_code=400,
            detail="No extractable text in this file (images aren't summarised).",
        )
    summary = await ai.summarize_text(text)
    return {"id": upload_id, "filename": row["filename"], "summary": summary}
