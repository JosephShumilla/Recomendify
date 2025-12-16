# Local testing quickstart

Follow these steps to run the web app locally using Netlify Dev with the Python backend:

1. **Set up Python dependencies (optionally inside a virtual environment):**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Install the Netlify CLI and log in (one-time):**
   ```bash
   npm install -g netlify-cli
   netlify login
   ```

3. **Create a `.env` file with your Spotify API credentials:**
   ```bash
   cp .env.example .env
   # Edit .env and add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
   ```

4. **Start the local Netlify Dev server from the repo root:**
    ```bash
    netlify dev
    ```
    The site will be available at `http://localhost:8888/` and the API is proxied at
    `http://localhost:8888/.netlify/functions/recommendify`.

    If you prefer not to install the Netlify CLI, you can instead run the built-in Flask server:
    ```bash
    python main.py
    ```
    In this mode the UI is still served, and the frontend automatically falls back to the `/server`
    API route exposed by the Flask app.

5. **(Optional) Test the function directly with curl:**
   ```bash
   curl -X POST http://localhost:8888/.netlify/functions/recommendify \
        -H 'Content-Type: application/json' \
        -d '{"data": "https://open.spotify.com/playlist/your-playlist-id", "sort_method": "heap"}'
   ```

6. **Open the UI in your browser:** visit `http://localhost:8888/` while `netlify dev` is running to search tracks and view recommendations.
