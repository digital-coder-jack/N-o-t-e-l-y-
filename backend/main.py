# ---------------------------------------------------------------------------
# PAGE ROUTING
# ---------------------------------------------------------------------------
# The frontend uses extensionless workspace URLs and explicit .html URLs.
# Both forms are served from an allow-list of known pages plus generic fallbacks.
# Assistant conversations are exposed only through the persistent floating widget,
# so the old dedicated /chat page is intentionally not routed as a first-class page.
# Map each known route slug to the HTML file that backs it. Most map to a
# same-named file; "settings" is an alias for the profile page (which hosts
# the settings UI) so the /settings nav link never 404s.
PAGE_ALIASES = {
    "index": "index",
    "login": "login",
    "signup": "signup",
    "forgot": "forgot",
    "dashboard": "dashboard",
    "tools": "tools",
    "notes": "tools",        # tools page hosts notes/quiz/flashcards
    "quiz": "tools",
    "flashcards": "tools",
    "settings": "dashboard", # keep Settings inside the current Notely workspace; dashboard.html reads /settings as the Settings view
    "profile": "profile",
    "analytics": "analytics",
    "telegram": "telegram",  # Telegram bot info / integration page
    "topic": "topic",        # AI Learning OS topic workspace
    "topics": "dashboard",   # topic list lives on the dashboard
    # Modern AI-workspace sidebar destinations. These map onto the existing
    # pages so every nav item resolves instead of 404-ing.
    "history": "dashboard",  # recent chat history lives on the dashboard
    "projects": "tools",     # planner/projects workspace
    "prompts": "tools",      # saved prompts (flashcards workspace)
    "files": "tools",        # file uploads / summarizer workspace
}


def _register_page(slug: str, target: str) -> None:
    async def _handler(target: str = target):
        return _page(target)

    # Extensionless route for this workspace page.
    app.get(f"/{slug}", include_in_schema=False)(_handler)
    # Explicit .html route for this workspace page.
    app.get(f"/{slug}.html", include_in_schema=False)(_handler)


for _slug, _target in PAGE_ALIASES.items():
    if _slug != "index":  # "/" is already handled by index()
        _register_page(_slug, _target)


# Generic fallback for any other top-level .html file.
@app.get("/{page}.html", include_in_schema=False)
async def any_page(page: str):
    return _page(f"{page}.html")
