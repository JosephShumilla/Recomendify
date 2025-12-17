"""CLI helper invoked by the Netlify Node function to generate recommendations."""

from __future__ import annotations

import json
import sys

from recommend import recommender


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:  # noqa: BLE001
        json.dump({"error": f"Invalid payload: {exc}"}, sys.stdout)
        return 1

    link = payload.get("data")
    sort_method = payload.get("sort_method", "heap")

    if not link:
        json.dump({"error": "Playlist link is required"}, sys.stdout)
        return 0

    try:
        recommendation = recommender(link, sort_method)
        result = recommendation.get_recommendations()
    except Exception as exc:  # noqa: BLE001
        json.dump({"error": str(exc)}, sys.stdout)
        return 1

    json.dump({"recommendations": result}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
