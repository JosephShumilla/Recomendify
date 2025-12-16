# Getting Started
First, ensure you have installed the dependencies required to run the python program. The dependencies are stored in *requirements.txt*. To do so, install all files to a directory on your computer. Then, open a terminal in that directory and simply use

```python
pip install -r requirements.txt
```

This will ensure you have all dependencies.

# References

Here is the [link](https://www.kaggle.com/datasets/amitanshjoshi/spotify-1million-tracks) to the original dataset of Spotify tracks

*Note: We used this dataset to trim down to around 10,000 songs which each contain 15 columns, creating 150,000 datapoints, this method was used because performing the required operations on 15,000,000+ datapoints was not feasible*

##

We also found use in a general pipeline for building a content-based recommendation system [here](https://towardsdatascience.com/part-iii-building-a-song-recommendation-system-with-spotify-cf76b52705e7)

## Creating a Spotify app (to obtain Client ID/Secret)

If you don’t have Spotify API credentials yet, create a free developer app:

1. Sign in at https://developer.spotify.com/dashboard (a regular Spotify account works) and click **Create app**.
2. Choose any name/description, select **Web API**, and finish creation.
3. In the app’s **Settings** → **Basic Information**, copy the **Client ID** and click **View client secret** to copy the **Client Secret** (regenerate if it is hidden/expired).
4. Use these values in your `.env` file (or Netlify environment variables) as `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.

This project uses the **Client Credentials** flow, so no redirect URI is required for local testing. If you ever switch to the Authorization Code flow to access private playlists, the redirect URI must exactly match what you register in the Spotify dashboard as described in the [official documentation](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).

## Local testing with Netlify Dev

Follow these quick steps to run the full site and serverless function locally before deploying.

1. Install Python dependencies (virtualenv recommended):
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Install the Netlify CLI and log in once (needed for `netlify dev`):
   ```bash
   npm install -g netlify-cli
   netlify login
   ```
3. Provide Spotify credentials locally so the function can authenticate. The easiest way is to copy `.env.example` to `.env` and fill in the values:
   ```bash
   cp .env.example .env
   # edit .env with your Spotify app values
   ```
   Alternatively, run `netlify env:set SPOTIFY_CLIENT_ID ...` and `netlify env:set SPOTIFY_CLIENT_SECRET ...` to save them to the local Netlify dev environment.
4. Start the dev server from the repository root (this also runs the Python function):
   ```bash
   netlify dev
   ```
   The static site will be at http://localhost:8888/ and the API will be proxied at http://localhost:8888/.netlify/functions/recommendify using `data/small_data.csv`.
5. Test the function directly with curl (replace the playlist URL with one of yours):
   ```bash
   curl -X POST http://localhost:8888/.netlify/functions/recommendify \
        -H 'Content-Type: application/json' \
        -d '{"data": "https://open.spotify.com/playlist/your-playlist-id", "sort_method": "heap"}'
   ```
6. Open the UI at http://localhost:8888/ while `netlify dev` is running to search tracks, submit your playlist, and view recommendations powered by the local function.

## Deploying to Netlify

1. Install the Netlify CLI locally and log in:
   ```bash
   npm install -g netlify-cli
   netlify login
   ```
2. Add your Spotify credentials as Netlify environment variables (Dashboard → Site configuration → Environment variables):
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
3. Deploy the site (this repository already contains `netlify.toml` and the serverless function):
   ```bash
   netlify deploy --build --prod
   ```

The frontend is served from the repository root and calls the `/.netlify/functions/recommendify` endpoint, which runs the Python recommendation code and uses the bundled dataset at `data/small_data.csv`.
