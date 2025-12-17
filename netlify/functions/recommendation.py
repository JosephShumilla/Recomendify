import json
import sys
from pathlib import Path

# Ensure the backend package is importable whether running locally or in Netlify Functions
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_PATH = CURRENT_DIR / "backend"
sys.path.append(str(BACKEND_PATH.parent))

from backend.recommend import recommender  # noqa: E402


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": _cors_headers(), "body": ""}

    try:
        payload = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": _cors_headers(),
            "body": json.dumps({"error": "Invalid JSON payload"}),
        }

    link = payload.get("data")
    sort_method = payload.get("sort_method", "heap")

    if not link:
        return {
            "statusCode": 400,
            "headers": _cors_headers(),
            "body": json.dumps({"error": "Playlist link is required"}),
        }

    try:
        recommendation = recommender(link, sort_method)
        result = recommendation.get_recommendations()
    except Exception as exc:  # pragma: no cover - defensive guard for lambda runtime
        return {
            "statusCode": 500,
            "headers": _cors_headers(),
            "body": json.dumps({"error": str(exc)}),
        }

    return {
        "statusCode": 200,
        "headers": {**_cors_headers(), "Content-Type": "application/json"},
        "body": json.dumps({"recommendations": result}),
    }
