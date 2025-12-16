from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from recommend import recommender

app = Flask(__name__, static_folder="./static")
CORS(app)  # Enable CORS for all routes


@app.route('/server', methods=['POST'])
def process_data():
    body = request.get_json(silent=True) or {}
    link = body.get('data')
    sort = body.get('sort_method')

    if not link:
        return jsonify({'message': 'Playlist URL is required'}), 400

    try:
        recommendation = recommender(link, sort)
        if recommendation.target == 'failure':
            return jsonify({'message': recommendation.error or 'Unable to process playlist'}), 400

        result = recommendation.get_recommendations()
        if not result:
            return jsonify({'message': 'No recommendations were returned for this playlist.'}), 400

        return jsonify({'recommendations': result})
    except Exception as exc:  # pragma: no cover - defensive server guard
        return jsonify({'message': 'Unexpected server error', 'detail': str(exc)}), 500


@app.route('/', methods=["GET"])
def index():
    return send_file('./index.html')


if __name__ == '__main__':
    app.run(port=5500)
