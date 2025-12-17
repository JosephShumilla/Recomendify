from pathlib import Path
import sys

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

ROOT = Path(__file__).resolve().parent
FUNCTIONS_DIR = ROOT / "netlify" / "functions"
if str(FUNCTIONS_DIR) not in sys.path:
    sys.path.append(str(FUNCTIONS_DIR))

from backend.recommend import recommender  # type: ignore  # noqa: E402

app = Flask(__name__, static_folder=str(ROOT / "public" / "static"))
CORS(app)  # Enable CORS for all routes


@app.route('/.netlify/functions/recommendation', methods=['POST'])
@app.route('/server', methods=['POST'])  # backward compatibility
def process_data():
    link = request.json.get('data')
    sort = request.json.get('sort_method')
    recommendation = recommender(link, sort)
    result = recommendation.get_recommendations()

    return jsonify({'recommendations': result})


@app.route('/', methods=["GET"])
def index():
    return send_from_directory(str(ROOT / "public"), "index.html")


@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory(str(ROOT / "public" / "static"), path)


if __name__ == '__main__':
    app.run(port=5500, debug=True)
