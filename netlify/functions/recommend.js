const fs = require('fs');
const path = require('path');

const FEATURES = [
  'danceability',
  'energy',
  'loudness',
  'speechiness',
  'acousticness',
  'instrumentalness',
  'liveness',
  'valence',
  'tempo',
  'popularity'
];

let cachedDataset;

const playlistRegex = /^https:\/\/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)(?:\?.*)?$/;

function parseCsvRow(row) {
  const columns = row.match(/(\"[^\"]*\"|[^,])+/g) || [];
  return columns.map((col) => col.replace(/^\"|\"$/g, ''));
}

function loadDataset() {
  if (cachedDataset) return cachedDataset;

  const datasetPath = path.join(__dirname, '../../small_data.csv');
  const content = fs.readFileSync(datasetPath, 'utf8').trim();
  const [headerLine, ...lines] = content.split(/\r?\n/);
  const headers = parseCsvRow(headerLine);

  const entries = lines.map((line) => {
    const values = parseCsvRow(line);
    const obj = {};
    headers.forEach((key, idx) => {
      obj[key] = values[idx];
    });
    return obj;
  });

  const minMax = {};
  FEATURES.forEach((key) => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    entries.forEach((item) => {
      const val = Number(item[key]);
      if (!Number.isFinite(val)) return;
      if (val < min) min = val;
      if (val > max) max = val;
    });
    minMax[key] = { min, max };
  });

  const normalized = entries.map((item) => {
    const featureVector = FEATURES.map((key) => {
      const val = Number(item[key]);
      const { min, max } = minMax[key];
      if (!Number.isFinite(val) || min === max) return 0;
      return (val - min) / (max - min);
    });
    return {
      track_id: item.track_id,
      artist_name: item.artist_name,
      track_name: item.track_name,
      genre: item.genre,
      featureVector
    };
  });

  cachedDataset = { normalized, minMax };
  return cachedDataset;
}

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing Spotify credentials');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Spotify token');
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchPlaylistTracks(playlistId, token) {
  const playlistResponse = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=tracks.items(track(id,name,popularity,album(images),artists(id,name)))&market=US`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!playlistResponse.ok) {
    return [];
  }

  const playlistData = await playlistResponse.json();
  const items = playlistData?.tracks?.items || [];
  const trackIds = items
    .map((item) => item?.track?.id)
    .filter(Boolean);

  if (!trackIds.length) {
    return [];
  }

  const audioFeaturesResponse = await fetch(
    `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  const artistIds = items
    .map((item) => item?.track?.artists?.[0]?.id)
    .filter(Boolean);

  const artistsResponse = await fetch(
    `https://api.spotify.com/v1/artists?ids=${artistIds.join(',')}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!audioFeaturesResponse.ok || !artistsResponse.ok) {
    return [];
  }

  const audioFeatures = await audioFeaturesResponse.json();
  const artists = await artistsResponse.json();

  const artistGenres = new Map();
  artists.artists.forEach((artist) => {
    artistGenres.set(artist.id, artist.genres?.[0] || 'unknown');
  });

  const featureLookup = new Map();
  audioFeatures.audio_features.forEach((feat) => {
    featureLookup.set(feat.id, feat);
  });

  return items
    .map((item) => {
      const track = item.track;
      const features = featureLookup.get(track.id);
      if (!features) return null;
      return {
        track_id: track.id,
        track_name: track.name,
        popularity: track.popularity,
        genre: artistGenres.get(track.artists?.[0]?.id) || 'unknown',
        danceability: features.danceability,
        energy: features.energy,
        loudness: features.loudness,
        speechiness: features.speechiness,
        acousticness: features.acousticness,
        instrumentalness: features.instrumentalness,
        liveness: features.liveness,
        valence: features.valence,
        tempo: features.tempo,
        cover: track.album?.images?.[0]?.url || '',
        artist_name: track.artists?.[0]?.name || ''
      };
    })
    .filter(Boolean);
}

function normalizeValue(value, min, max) {
  if (!Number.isFinite(value) || min === max) return 0;
  return (value - min) / (max - min);
}

function buildPlaylistVector(tracks, minMax) {
  const normalizedTracks = tracks.map((track) => {
    const vector = FEATURES.map((key) => {
      const val = Number(track[key]);
      const bounds = minMax[key];
      return normalizeValue(val, bounds.min, bounds.max);
    });
    return { ...track, featureVector: vector };
  });

  const aggregated = new Array(FEATURES.length).fill(0);
  normalizedTracks.forEach((track) => {
    track.featureVector.forEach((val, idx) => {
      aggregated[idx] += val;
    });
  });

  return normalizedTracks.length
    ? aggregated.map((val) => val / normalizedTracks.length)
    : aggregated;
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, idx) => sum + val * b[idx], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

async function getTrackMetadata(trackIds, token) {
  const response = await fetch(
    `https://api.spotify.com/v1/tracks?ids=${trackIds.join(',')}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.tracks.map((track) => ({
    name: track.name,
    artist: track.artists?.[0]?.name || 'Unknown artist',
    cover: track.album?.images?.[0]?.url || '',
    track_id: track.id
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const link = body.data;
    const sortMethod = body.sort_method || 'heap';

    const match = playlistRegex.exec(link || '');
    if (!match) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid playlist link' })
      };
    }

    const playlistId = match[1];
    const token = await getAccessToken();
    const dataset = loadDataset();
    const playlistTracks = await fetchPlaylistTracks(playlistId, token);

    if (!playlistTracks.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Unable to read playlist tracks' })
      };
    }

    const playlistVector = buildPlaylistVector(playlistTracks, dataset.minMax);

    const scored = dataset.normalized
      .map((item) => {
        const similarity = cosineSimilarity(item.featureVector, playlistVector);
        const genreBonus = playlistTracks.some((track) => track.genre === item.genre)
          ? 0.05
          : 0;
        return { ...item, similarity: similarity + genreBonus };
      })
      .sort((a, b) => b.similarity - a.similarity);

    const top = scored.slice(0, 5);
    const metadata = await getTrackMetadata(top.map((t) => t.track_id), token);
    const metadataMap = new Map(metadata.map((item) => [item.track_id, item]));

    const recommendations = top.map((item) => {
      const details = metadataMap.get(item.track_id) || {};
      return {
        name: details.name || item.track_name,
        artist: details.artist || item.artist_name,
        cover: details.cover || '',
        similarity: Number(item.similarity.toFixed(3))
      };
    });

    if (sortMethod === 'merge') {
      recommendations.sort((a, b) => b.similarity - a.similarity);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ recommendations })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
