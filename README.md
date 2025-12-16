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

## Local testing with Netlify Dev

You can run the serverless function and static site locally to verify the deployment flow without pushing to Netlify.

1. Install the Python dependencies (a virtualenv is recommended):
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Install the Netlify CLI and log in:
   ```bash
   npm install -g netlify-cli
   netlify login
   ```
3. Configure the Spotify environment variables used by the Python recommender (either with `netlify env:set` or a local `.env` file):
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (e.g. `http://localhost/`)
4. Start the local dev server from the repository root:
   ```bash
   netlify dev
   ```
   This serves `index.html` and proxies API calls to `/.netlify/functions/recommendify` with the bundled dataset at `data/small_data.csv`.
5. Exercise the API directly with curl (replace the playlist URL with one you own that has enough tracks):
   ```bash
   curl -X POST http://localhost:8888/.netlify/functions/recommendify \
        -H 'Content-Type: application/json' \
        -d '{"data": "https://open.spotify.com/playlist/your-playlist-id", "sort_method": "heap"}'
   ```
   You can also open http://localhost:8888/ in the browser while `netlify dev` is running to use the UI against the local function.

## Deploying to Netlify

1. Install the Netlify CLI locally and log in:
   ```bash
   npm install -g netlify-cli
   netlify login
   ```
2. Add your Spotify credentials as Netlify environment variables (Dashboard → Site configuration → Environment variables):
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (e.g. `http://localhost/`)
3. Deploy the site (this repository already contains `netlify.toml` and the serverless function):
   ```bash
   netlify deploy --build --prod
   ```

The frontend is served from the repository root and calls the `/.netlify/functions/recommendify` endpoint, which runs the Python recommendation code and uses the bundled dataset at `data/small_data.csv`.
