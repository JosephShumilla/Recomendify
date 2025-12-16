import json
import sys
from pathlib import Path
from typing import Any, Dict

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT_DIR))

from recommend import recommender  # noqa: E402


def _json_response(status: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(payload),
    }


def handler(event, context):  # pylint: disable=unused-argument
    if event.get("httpMethod") == "OPTIONS":
        return _json_response(200, {"ok": True})

    if event.get("httpMethod") != "POST":
        return _json_response(405, {"message": "Method not allowed"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _json_response(400, {"message": "Invalid JSON body"})

    playlist_url = body.get("data")
    sort_method = body.get("sort_method", "heap")

    if not playlist_url:
        return _json_response(400, {"message": "Playlist URL is required"})

    recommendations = recommender(playlist_url, sort_method).get_recommendations()
    return _json_response(200, {"recommendations": recommendations})
