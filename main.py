from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import spotipy
from recommend import recommender

app = Flask(__name__, static_folder="./static")
CORS(app)  # Enable CORS for all routes


@app.route('/server', methods=['POST'])
def process_data():
    try:
        payload = request.get_json(silent=True) or {}
        link = payload.get('data')
        sort = payload.get('sort_method')

        if not link:
            return jsonify({'error': 'Missing playlist URL.'}), 400

        recommendation = recommender(link, sort)
        result = recommendation.get_recommendations()

        return jsonify({'recommendations': result})
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except spotipy.SpotifyException as exc:
        status_code = getattr(exc, 'http_status', 400) or 400
        return jsonify({'error': str(exc)}), status_code
    except Exception as exc:  # noqa: BLE001 - surface error details to the client
        return jsonify({'error': str(exc)}), 400


@app.route('/', methods=["GET"])
def index():
    return send_file('./index.html')


if __name__ == '__main__':
    app.run(port=5500)
