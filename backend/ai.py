"""
=====================================================================
 AI NOTEBOOK  -  backend/ai.py
=====================================================================
High-level AI study features built on top of the centralized AI Notebook router.

Shared by BOTH the web app and the Telegram bot:
  * answer_question()  -> the bot's "library first, AI fallback" logic.

Web-only study tools (each returns clean text / structured data):
  * generate_notes()
  * generate_quiz()
  * generate_flashcards()
  * generate_study_plan()
  * summarize_text()
  * homework_help()

System prompts keep responses student-friendly and well-formatted in
Markdown so the frontend can render them nicely.
=====================================================================
"""

from __future__ import annotations

import json
import re

from backend import database as db
from backend import providers
from backend.groq_client import groq_chat, groq_chat_stream

SYSTEM_BASE = (
    "You are AI Notebook, a friendly and knowledgeable study assistant for "
    "students. Explain clearly, use simple language, and format answers in clean "
    "Markdown with headings, bullet points and code blocks where helpful."
)


# ---------------------------------------------------------------------------
# Shared bot logic: library first, AI fallback
# ---------------------------------------------------------------------------
async def answer_question(user_id: int, question: str, selection: str | None = "auto") -> tuple[str, str]:
    """
    Return (source, answer) where source is 'library' or 'ai'.
    Mirrors the original Telegram bot behaviour exactly.
    """
    saved = db.db_find_answer(user_id, question)
    if saved:
        return "library", saved
    answer = await groq_chat(
        [
            {"role": "system", "content":
                "You are AI Notebook, a friendly study assistant. Answer clearly "
                "and concisely for students. Keep answers under 300 words."},
            {"role": "user", "content": question},
        ],
        temperature=0.7,
        max_tokens=512,
        selection=selection,
    )
    return "ai", answer


# ---------------------------------------------------------------------------
# Chat streaming (used by the web chat interface)
# ---------------------------------------------------------------------------
async def chat_stream(history: list[dict], selection: str | None = "auto", cancel_event=None):
    """
    history is a list of {role, content}. We prepend the system prompt and
    stream the assistant reply through the AI Notebook model router.

    ``cancel_event`` (asyncio.Event) lets the caller cooperatively stop the
    stream — used to cancel a previous request before starting a new one.

    Yields (event, value) tuples:
        ("meta",      provider_name)       the provider that handled the stream
        ("token",     text_chunk)          incremental content
        ("cancelled", reason)              stream was cancelled/superseded
        ("error",     {type, message})     if every provider failed
    """
    messages = [{"role": "system", "content": SYSTEM_BASE}] + history
    async for event, value in providers.chat_stream(
        messages, selection=selection, temperature=0.7, max_tokens=1500,
        cancel_event=cancel_event,
    ):
        yield event, value


# ---------------------------------------------------------------------------
# Study tools
# ---------------------------------------------------------------------------
async def generate_notes(topic: str, selection: str | None = "auto") -> str:
    return await groq_chat(
        [
            {"role": "system", "content": SYSTEM_BASE},
            {"role": "user", "content":
                f"Create concise, well-structured study notes on: {topic}.\n"
                f"Use Markdown with a title, key concepts as bullet points, "
                f"important definitions, and a short summary at the end."},
        ],
        temperature=0.5,
        max_tokens=1500,
        selection=selection,
    )


async def generate_study_plan(goal: str, days: int = 7, selection: str | None = "auto") -> str:
    return await groq_chat(
        [
            {"role": "system", "content": SYSTEM_BASE},
            {"role": "user", "content":
                f"Create a {days}-day study plan to achieve this goal: {goal}.\n"
                f"Format as a Markdown table or day-by-day list with specific "
                f"daily tasks, time estimates, and milestones."},
        ],
        temperature=0.5,
        max_tokens=1500,
        selection=selection,
    )


async def summarize_text(text: str, selection: str | None = "auto") -> str:
    snippet = text[:12000]  # protect token limits
    return await groq_chat(
        [
            {"role": "system", "content": SYSTEM_BASE},
            {"role": "user", "content":
                "Summarise the following document for a student. Provide a short "
                "overview, the key points as bullets, and any important terms.\n\n"
                f"{snippet}"},
        ],
        temperature=0.4,
        max_tokens=1200,
        selection=selection,
    )


async def homework_help(question: str, selection: str | None = "auto") -> str:
    return await groq_chat(
        [
            {"role": "system", "content":
                SYSTEM_BASE + " For homework, explain the reasoning step by step "
                "so the student learns, then give the final answer."},
            {"role": "user", "content": question},
        ],
        temperature=0.4,
        max_tokens=1500,
        selection=selection,
    )


def _extract_json(raw: str):
    """Best-effort extraction of a JSON array/object from an LLM reply."""
    raw = raw.strip()
    # Strip code fences if present.
    fence = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL)
    if fence:
        raw = fence.group(1).strip()
    # Find the first [...] or {...} block.
    match = re.search(r"(\[.*\]|\{.*\})", raw, re.DOTALL)
    if match:
        raw = match.group(1)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def generate_quiz(topic: str, num_questions: int = 5, selection: str | None = "auto") -> list[dict]:
    """Return validated multiple-choice questions; repair malformed JSON once."""
    prompt = (
        f"Generate exactly {num_questions} multiple-choice questions about '{topic}'. "
        'Return a JSON array; every item must have "question" (string), "options" '
        '(exactly 4 strings), "answer" (integer 0-3), and "explanation" (string). '
        "Output only valid JSON."
    )
    data = await _generate_json(prompt, selection=selection, max_tokens=2000, expected="quiz")
    if not isinstance(data, list):
        return []
    return [{
        "question": str(item["question"]),
        "options": [str(option) for option in item["options"]],
        "answer": int(item["answer"]),
        "explanation": str(item.get("explanation", "")),
    } for item in data]

# ---------------------------------------------------------------------------
# TOPIC WORKSPACE GENERATORS  (AI Learning OS)
# ---------------------------------------------------------------------------
# Each generator produces one section of a topic's learning workspace.
# Markdown sections render directly; structured sections (mindmap, roadmap,
# timeline, quiz) return JSON strings so the frontend can build interactive UI.

_TOPIC_MD_PROMPTS: dict[str, str] = {
    "overview": (
        "Create a compact AI OVERVIEW of the topic '{topic}'. Use Markdown with EXACTLY these "
        "sections:\n## Definition\n## Introduction\n## Why it matters\n## Key concepts\n"
        "## Quick explanation\nKeep it clear, student-friendly and under 600 words."
    ),
    "summary": (
        "Create a DEEP STRUCTURED SUMMARY of the topic '{topic}'. Use Markdown with these H2 "
        "sections in order:\n## What is it?\n## History & Origin\n## Timeline\n## Why it exists\n"
        "## How it works\n## Advantages\n## Disadvantages\n## Applications & Real-life uses\n"
        "## Examples\n## Future\n## Common misconceptions\n## FAQ\n## Important facts\n## References\n"
        "Be thorough but concise in each section. Use bullet points and tables where helpful."
    ),
    "notes": (
        "Create professional STUDY NOTES on '{topic}'. Use Markdown with:\n"
        "- A title heading\n- Clear section headings\n- Bullet points for key concepts\n"
        "- **Bold** important definitions\n- Concrete examples\n"
        "- Code examples in fenced blocks if the topic is technical\n"
        "- A final '## Revision Summary' section with the 8 most important takeaways."
    ),
    "practice": (
        "Create a PRACTICE PACK for '{topic}'. Use Markdown with these sections:\n"
        "## Exercises (5 short exercises)\n## Assignments (2 assignments)\n"
        "## Mini Projects (2 project ideas with steps)\n"
        "## Challenges (2 harder challenges — coding challenges if technical)\n"
        "## Real-world Scenarios (2 applied problem-solving scenarios)\n"
        "For each item give clear instructions and expected outcome. Do NOT include solutions."
    ),
    "resources": (
        "Recommend LEARNING RESOURCES for '{topic}'. Use Markdown with these sections:\n"
        "## Official documentation\n## Books\n## Research papers\n## GitHub repositories\n"
        "## YouTube channels & videos\n## Online courses\n## Blogs & articles\n"
        "For each item: **Name** — one-line description. Only recommend well-known, real resources; "
        "if unsure of a URL, give the name and where to search instead of inventing links."
    ),
}


async def generate_topic_section(topic: str, kind: str, selection: str | None = "auto") -> str:
    """Generate a Markdown section of a topic workspace."""
    prompt = _TOPIC_MD_PROMPTS[kind].format(topic=topic)
    return await groq_chat(
        [{"role": "system", "content": SYSTEM_BASE},
         {"role": "user", "content": prompt}],
        temperature=0.5,
        max_tokens=2400,
        selection=selection,
    )


def _valid_json_shape(data, expected: str | None) -> bool:
    if data is None:
        return False
    if expected == "object":
        return isinstance(data, dict) and bool(data.get("label"))
    if expected == "quiz":
        return isinstance(data, list) and bool(data) and all(
            isinstance(item, dict)
            and isinstance(item.get("question"), str) and item["question"].strip()
            and isinstance(item.get("options"), list) and len(item["options"]) == 4
            and all(isinstance(option, str) and option.strip() for option in item["options"])
            and str(item.get("answer", "")).isdigit()
            and 0 <= int(item["answer"]) <= 3
            for item in data
        )
    if expected == "flashcards":
        return isinstance(data, list) and bool(data) and all(
            isinstance(item, dict) and str(item.get("front", "")).strip()
            and str(item.get("back", "")).strip() for item in data
        )
    if expected == "topic_quiz":
        return isinstance(data, list) and bool(data) and all(
            isinstance(item, dict) and str(item.get("question", "")).strip()
            and str(item.get("type", "mcq")).lower() in ("mcq", "tf", "fill")
            for item in data
        )
    if expected == "roadmap":
        return isinstance(data, list) and len(data) == 4 and all(
            isinstance(item, dict) and str(item.get("level", "")).strip()
            and str(item.get("duration", "")).strip()
            and isinstance(item.get("topics"), list) and item["topics"]
            and isinstance(item.get("projects"), list) and item["projects"]
            and isinstance(item.get("practice"), list) and item["practice"]
            and isinstance(item.get("resources"), list) and item["resources"]
            for item in data
        )
    if expected == "timeline":
        return isinstance(data, list) and len(data) >= 5 and all(
            isinstance(item, dict) and str(item.get("year", "")).strip()
            and str(item.get("title", "")).strip()
            and str(item.get("description", "")).strip()
            for item in data
        )
    if expected == "array":
        return isinstance(data, list) and bool(data)
    return isinstance(data, (dict, list))


async def _generate_json(
    prompt: str, selection: str | None = "auto", max_tokens: int = 2600,
    expected: str | None = None,
):
    """Generate JSON, validate its expected shape, then repair once if needed."""
    strict_prompt = (
        prompt + "\n\nYour previous output was invalid or did not match the required schema. "
        "Repair it and return ONLY one valid JSON value matching the schema. "
        "Do not include markdown fences, comments, or explanatory prose."
    )
    for attempt in range(2):
        reply = await groq_chat(
            [{"role": "system", "content":
                "You are a structured data generator. Respond ONLY with valid JSON. "
                "No prose, no markdown fences."},
             {"role": "user", "content": prompt if attempt == 0 else strict_prompt}],
            temperature=0.2 if attempt else 0.4,
            max_tokens=max_tokens,
            selection=selection,
        )
        data = _extract_json(reply)
        if _valid_json_shape(data, expected):
            return data
    return None


async def generate_mindmap(topic: str, selection: str | None = "auto") -> dict | None:
    """Return a nested mind-map tree: {label, note?, children:[...]} ."""
    data = await _generate_json(
        f"Create a mind map for the topic '{topic}'. Return a JSON object with this shape: "
        '{"label": string (the topic), "children": [{"label": string, '
        '"note": short one-sentence explanation, "children": [... up to 3 levels deep ...]}]}. '
        "Include 5-8 main branches, each with 2-4 sub-branches. Every node needs a 'note'. "
        "Output ONLY the JSON object.",
        selection=selection,
        expected="object",
    )
    return data if isinstance(data, dict) and data.get("label") else None


async def generate_roadmap(topic: str, selection: str | None = "auto") -> list | None:
    """Return roadmap levels: [{level, duration, topics:[], projects:[], practice:[], resources:[]}]"""
    data = await _generate_json(
        f"Create a learning roadmap for '{topic}' with EXACTLY 4 levels: "
        "Beginner, Intermediate, Advanced, Expert. Return a JSON array where each item has: "
        '"level" (string), "duration" (estimated time e.g. "2-3 weeks"), '
        '"topics" (array of 4-6 strings), "projects" (array of 2 strings), '
        '"practice" (array of 2 strings), "resources" (array of 2 strings). '
        "Output ONLY the JSON array.",
        selection=selection,
        expected="roadmap",
    )
    return data if isinstance(data, list) and data else None


async def generate_timeline(topic: str, selection: str | None = "auto") -> list | None:
    """Return chronological events: [{year, title, description}]"""
    data = await _generate_json(
        f"Create a chronological timeline of the most important events in the history and "
        f"evolution of '{topic}'. Return a JSON array of 8-14 items, each with: "
        '"year" (string, e.g. "1956" or "1990s"), "title" (short string), '
        '"description" (1-2 sentence string). Order oldest to newest. '
        "Output ONLY the JSON array.",
        selection=selection,
        expected="timeline",
    )
    return data if isinstance(data, list) and data else None


async def generate_topic_quiz(topic: str, difficulty: str = "medium",
                              selection: str | None = "auto") -> list | None:
    """Mixed-type quiz: [{type, question, options?, answer, explanation}]"""
    data = await _generate_json(
        f"Generate a {difficulty}-difficulty quiz about '{topic}' with 8 questions: "
        "4 multiple-choice, 2 true/false, 2 fill-in-the-blank. Return a JSON array where each item has: "
        '"type" ("mcq"|"tf"|"fill"), "question" (string; use ___ for the blank in fill questions), '
        '"options" (array of 4 strings for mcq, ["True","False"] for tf, omit or [] for fill), '
        '"answer" (for mcq/tf: integer index of correct option; for fill: the answer string), '
        '"explanation" (short string). Output ONLY the JSON array.',
        selection=selection,
        expected="topic_quiz",
    )
    if not isinstance(data, list):
        return None
    cleaned = []
    for it in data:
        if not isinstance(it, dict) or not it.get("question"):
            continue
        qtype = str(it.get("type", "mcq")).lower()
        if qtype not in ("mcq", "tf", "fill"):
            qtype = "mcq"
        cleaned.append({
            "type": qtype,
            "question": str(it["question"]),
            "options": [str(o) for o in (it.get("options") or [])][:4],
            "answer": it.get("answer", 0),
            "explanation": str(it.get("explanation", "")),
        })
    return cleaned or None


async def generate_compare(topic: str, other: str, selection: str | None = "auto") -> str:
    """Markdown comparison of two topics."""
    return await groq_chat(
        [{"role": "system", "content": SYSTEM_BASE},
         {"role": "user", "content":
            f"Compare '{topic}' vs '{other}' for a student. Use Markdown with:\n"
            f"## At a glance\nA comparison table with rows: Definition, Best for, "
            f"Performance, Learning curve, Popularity, Cost.\n"
            f"## {topic}: Advantages & Disadvantages\n## {other}: Advantages & Disadvantages\n"
            f"## Use cases\n## Examples\n## Verdict\nBe balanced and specific."}],
        temperature=0.5,
        max_tokens=2200,
        selection=selection,
    )


TOPIC_CHAT_SYSTEM = (
    "You are the dedicated AI tutor for the topic '{topic}' inside AI Notebook's "
    "learning workspace. Stay focused on this topic (and directly related concepts). "
    "Explain clearly with Markdown, use examples and code blocks where helpful, and "
    "adapt depth to what the student asks (simple, detailed, ELI5, interview-prep, etc.)."
)


async def generate_flashcards(topic: str, num_cards: int = 8, selection: str | None = "auto") -> list[dict]:
    """Return validated flashcards; malformed JSON is repaired once."""
    prompt = (
        f"Generate exactly {num_cards} study flashcards about '{topic}'. "
        'Return a JSON array; every item must contain "front" and "back", both non-empty strings. '
        "Output only valid JSON."
    )
    data = await _generate_json(prompt, selection=selection, max_tokens=2000, expected="flashcards")
    if not isinstance(data, list):
        return []
    return [{"front": str(item["front"]), "back": str(item["back"])} for item in data]
