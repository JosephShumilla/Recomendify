# Getting Started
This project is a small Flask web app that recommends similar tracks for a given Spotify playlist. Follow the steps below to run it locally.

## 1) Install dependencies
```bash
pip install -r requirements.txt
```

## 2) Set your Spotify API credentials
Create a free [Spotify developer app](https://developer.spotify.com/dashboard/) and add a redirect URI of `http://localhost/`. Then export the credentials in your shell so the backend can authenticate:

```bash
export SPOTIFY_CLIENT_ID="<your_client_id>"
export SPOTIFY_CLIENT_SECRET="<your_client_secret>"
export SPOTIFY_REDIRECT_URI="http://localhost/"
```

## 3) Run the web server
From the repository root:

```bash
python main.py
```

The server listens on port `5500`. Open `http://localhost:5500` in your browser and paste a Spotify playlist URL from the address bar (not the share link). Choose a sort method and click **GO!** to see recommendations.

The preprocessed dataset used for similarity calculations lives at `data/small_data.csv`, and static assets are served from `static/`.

# References

Here is the [link](https://www.kaggle.com/datasets/amitanshjoshi/spotify-1million-tracks) to the original dataset of Spotify tracks

*Note: We used this dataset to trim down to around 10,000 songs which each contain 15 columns, creating 150,000 datapoints, this method was used because performing the required operations on 15,000,000+ datapoints was not feasible*

We also found use in a general pipeline for building a content-based recommendation system [here](https://towardsdatascience.com/part-iii-building-a-song-recommendation-system-with-spotify-cf76b52705e7)
