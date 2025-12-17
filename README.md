# Getting Started

This repository is structured to deploy the Spotify playlist recommender to Netlify with a Python Function powering the recommendations. The `public/` folder hosts the static site, and the `netlify/functions` folder holds the serverless backend and dataset.

## Prerequisites



## Local setup and testing

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

   ```bash
   export SPOTIFY_CLIENT_ID="your-client-id"
   export SPOTIFY_CLIENT_SECRET="your-client-secret"
   export SPOTIFY_REDIRECT_URI="http://localhost/"
   ```
3. Install Netlify CLI if you have not already:
   ```bash
   npm install -g netlify-cli
   ```
4. Run the Netlify dev server to simulate the production environment locally:
   ```bash
   netlify dev
   ```


## Deploying to Netlify

1. Create a new Netlify site and connect this repository.
2. In the Netlify dashboard, set the build settings:
   * **Base directory:** leave empty
   * **Build command:** leave empty (static site)
   * **Publish directory:** `public`
   * **Functions directory:** `netlify/functions`
3. Add required environment variables in **Site settings → Environment variables**:
   * `SPOTIFY_CLIENT_ID`
   * `SPOTIFY_CLIENT_SECRET`
   * `SPOTIFY_REDIRECT_URI` (e.g., `https://<your-site>.netlify.app/.netlify/functions/recommendation` or `http://localhost/`)
4. Deploy the site. The Netlify Function is bundled automatically (see `netlify.toml`), including the backend Python modules and dataset.

## References

Here is the [link](https://www.kaggle.com/datasets/amitanshjoshi/spotify-1million-tracks) to the original dataset of Spotify tracks.

*Note: We used this dataset to trim down to around 10,000 songs which each contain 15 columns, creating 150,000 datapoints, this method was used because performing the required operations on 15,000,000+ datapoints was not feasible*

We also found use in a general pipeline for building a content-based recommendation system [here](https://towardsdatascience.com/part-iii-building-a-song-recommendation-system-with-spotify-cf76b52705e7)