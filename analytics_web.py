"""Privacy-preserving, process-local usage counters.

Analytics are intentionally not persisted or sent to an external service. This
keeps the existing analytics API contract available to the web UI while making
analytics best-effort and ephemeral across process restarts/serverless calls.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from threading import Lock


class WebAnalytics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._visits = 0
        self._visitors: set[str] = set()
        self._visitors_today: set[str] = set()
        self._pages: Counter[str] = Counter()
        self._features: Counter[str] = Counter()
        self._session_seconds = 0.0
        self._sessions = 0

    def track_visit(self, guest_id: str, _user_agent: str, _ip_address: str, page_url: str) -> None:
        # IP addresses and user-agent strings are deliberately not retained.
        with self._lock:
            self._visits += 1
            self._visitors.add(guest_id)
            self._visitors_today.add(guest_id)
            self._pages[page_url or "/"] += 1

    def update_activity(self, guest_id: str, current_page: str, _time_spent: float) -> None:
        with self._lock:
            self._visitors.add(guest_id)
            self._pages[current_page or "/"] += 1

    def track_session_end(self, _guest_id: str, session_start: str | None, session_end: str | None) -> None:
        if not session_start or not session_end:
            return
        try:
            start = datetime.fromisoformat(session_start.replace("Z", "+00:00"))
            end = datetime.fromisoformat(session_end.replace("Z", "+00:00"))
            seconds = max(0.0, (end - start).total_seconds())
        except (TypeError, ValueError):
            return
        with self._lock:
            self._session_seconds += min(seconds, 86_400.0)
            self._sessions += 1

    def track_feature_usage(self, _guest_id: str, feature: str) -> None:
        with self._lock:
            self._features[feature] += 1

    def get_dashboard_stats(self) -> dict:
        with self._lock:
            average = self._session_seconds / self._sessions if self._sessions else 0.0
            return {
                "total_visitors": len(self._visitors),
                "unique_visitors": len(self._visitors),
                "new_visitors_today": len(self._visitors_today),
                "active_visitors_today": len(self._visitors_today),
                "returning_visitors": 0,
                "average_session_duration": round(average, 2),
                "most_visited_pages": [
                    {"page": page, "visits": count}
                    for page, count in self._pages.most_common(10)
                ],
                "total_ai_chats": self._features.get("ai_chat", 0),
                "total_quiz_attempts": self._features.get("quiz_attempt", 0),
                "total_notes_generated": self._features.get("notes_generated", 0),
                "weekly_growth": [],
                "monthly_growth": [],
                "persistence": "process-local",
            }


web_analytics_db = WebAnalytics()
WebAnalyticsDB = WebAnalytics
