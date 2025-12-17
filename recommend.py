import os
from pathlib import Path

import pandas as pd
import spotipy
from spotipy.oauth2 import SpotifyOAuth

import dataset
import sorting

class recommender:
    def __init__(self, playlist_link, sort='heap'):
        # Retrieve your client ID and client secret from environment variables
        c_id = os.getenv("SPOTIFY_CLIENT_ID")
        c_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        c_uri = os.getenv("SPOTIFY_REDIRECT_URI")

        if not c_id or not c_secret:
            raise ValueError(
                "Missing Spotify credentials. Export SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before starting the server."
            )
        if not c_uri:
            raise ValueError(
                "Missing SPOTIFY_REDIRECT_URI. Set it to the exact redirect URI registered in your Spotify app (e.g., http://127.0.0.1:3000/callback)."
            )
        scope = "playlist-read-private"
        cache_path = os.path.join(os.getcwd(), "token.txt")
        # Instantiates the Spotipy instance used for getting playlist info
        self.sp = spotipy.Spotify(
            auth_manager=SpotifyOAuth(
                scope=scope,
                client_id=c_id,
                client_secret=c_secret,
                redirect_uri=c_uri,
                cache_path=cache_path,
            )
        )
        # Extracts playlist_id from the given link
        playlist_id = playlist_link.split("/playlist/")[-1].split('?')[0]
        # Defines the sort method of the class
        self.sort = sort
        # Tries to get the playlist from the spotify API
        try:
            self.target = self.sp.playlist(playlist_id)
        except spotipy.SpotifyException as exc:
            status = getattr(exc, "http_status", None)
            if status == 403:
                raise PermissionError(
                    "Spotify returned 403 (forbidden) while reading the playlist. Ensure the playlist is public or authorize with playlist-read-private scope."
                ) from exc
            raise ValueError(f"Spotify API error while reading playlist: {exc}") from exc

    def get_recommendations(self) -> list:
        # Exits if playlist is empty
        if self.target == 'failure':
            return []
        tracks_data = []
        track_ids = [i['track']['id'] for i in self.target['tracks']['items']]
        # Split track IDs into chunks of 100 or fewer
        chunks = [track_ids[i:i + 100] for i in range(0, len(track_ids), 100)]
        # Initialize an empty list to store all audio features
        all_audio_features = []
        # Iterate through each chunk and retrieve audio features
        for chunk in chunks:
            audio_features_chunk = self.sp.audio_features(chunk)
            all_audio_features.extend(audio_features_chunk)
        # Counter to track which track_id we are on
        counter = 0
        for item in self.target['tracks']['items']:
            # Get track
            track = item['track']
            # Get track ID
            track_id = track['id']
            # Get artist
            artist = self.sp.artist(track['artists'][0]['external_urls']['spotify'])
            # Get album
            album = self.sp.album(track["album"]["external_urls"]["spotify"])
            # Get year
            year = album['release_date'][:4] # type: ignore
            # Get genre of track, skips track if no genre present
            if len(artist['genres']) == 0:
                continue 
            genre = artist['genres'][0] # type: ignore
            #Get audio features, skips track if no audio features present
            if len(all_audio_features[counter]) == 0:
                counter += 1
                continue
            audio_features = all_audio_features[counter] # type: ignore
            counter += 1
            # Get all relevant data about each track
            track_data = {
            'artist_name' : artist['name'], # type: ignore
            'track_id' : track_id,
            'popularity' : track['popularity'],
            'track_name' : track['name'],
            'genre' : genre,
            'danceability' : audio_features['danceability'],
            'energy' : audio_features['energy'],
            'key' : audio_features['key'],
            'loudness' : audio_features['loudness'],
            'mode' : audio_features['mode'],
            'speechiness' : audio_features['speechiness'],
            'acousticness' : audio_features['acousticness'],
            'instrumentalness' : audio_features['instrumentalness'],
            'liveness' : audio_features['liveness'],
            'valence' : audio_features['valence'],
            'tempo' : audio_features['tempo'],
            }
            # Add the track data to the tracks_data list
            tracks_data.append(track_data)
        # Calculates the cosine similarity between the dataset and the playlist
        dataset_path = Path(__file__).parent / "data" / "small_data.csv"
        simTracks = dataset.generate_similarity_matrix(dataset_path.as_posix(), tracks_data)
        # Converts the DataFrame to a dictionary for sorting
        rows = simTracks.to_dict(orient='records')
        if (self.sort == 'heap'):
            # Performs heap sort
            sortedTop5 = sorting.heapSort(rows)
        else:
            # Performs merge sort
            sorting.mergeSort(rows)
            sortedTop5 = rows
        # Gets the top 5 most similar tracks
        sortedTop5 = pd.DataFrame(sortedTop5).head(5)
        new_tracks_info = []
        # Gets all relevant information about each track
        for index, row in sortedTop5.iterrows():
            new_track = self.sp.track(row['track_id'])
            track_name = new_track['name']
            artist = new_track['artists'][0]['name']   
            cover_url = new_track['album']['images'][0]['url']
            sim = row['similarity']
            track_info = {
               'name': track_name,
               'artist': artist,
               'cover': cover_url,
               'similarity': sim
            }
            # Adds the dictionary to the list
            new_tracks_info.append(track_info)
            
        return new_tracks_info
