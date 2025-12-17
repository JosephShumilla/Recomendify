const fs = require('fs');
const path = require('path');

// Use global fetch when available (Node 18+), otherwise fall back to node-fetch
const fetch =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch
    : (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

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

  const candidatePaths = [
    path.join(process.cwd(), 'small_data.csv'),
    path.join(__dirname, '../../small_data.csv'),
    path.join(__dirname, '../small_data.csv')
  ];

  const datasetPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!datasetPath) {
    throw new Error('Dataset file not found');
  }

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
      popularity: Number(item.popularity) || 0,
      year: Number(item.year) || 0,
      featureVector
    };
  });

  cachedDataset = { normalized, minMax, raw: entries };
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

function buildSeededSubset(items, seed, count = 8) {
  const rand = createSeededRandom(seed);
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function normalizeValue(value, min, max) {
  if (!Number.isFinite(value) || min === max) return 0;
  return (value - min) / (max - min);
}

function buildPlaylistVectors(tracks, minMax) {
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

  const meanVector = normalizedTracks.length
    ? aggregated.map((val) => val / normalizedTracks.length)
    : aggregated;

  return { meanVector, normalizedTracks };
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

function createSeededRandom(seed) {
  let x = 0;
  for (let i = 0; i < seed.length; i += 1) {
    x = (x + seed.charCodeAt(i) * 2654435761) >>> 0;
  }

  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
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
    const dataset = loadDataset();

    let token;
    let playlistTracks = [];
    let fallbackReason = '';

    try {
      token = await getAccessToken();
      playlistTracks = await fetchPlaylistTracks(playlistId, token);
    } catch (err) {
      console.error('Spotify fetch failed, switching to fallback', err.message);
      fallbackReason = err.message.includes('credentials')
        ? 'Missing Spotify credentials'
        : 'Spotify API unavailable';
    }

    if (!playlistTracks.length) {
      if (!fallbackReason) fallbackReason = 'Unable to read playlist tracks';
      const seeded = buildSeededSubset(dataset.raw, playlistId, 10);
      playlistTracks = seeded.map((item) => ({
        track_id: item.track_id,
        track_name: item.track_name,
        popularity: Number(item.popularity) || 0,
        genre: item.genre,
        danceability: Number(item.danceability),
        energy: Number(item.energy),
        loudness: Number(item.loudness),
        speechiness: Number(item.speechiness),
        acousticness: Number(item.acousticness),
        instrumentalness: Number(item.instrumentalness),
        liveness: Number(item.liveness),
        valence: Number(item.valence),
        tempo: Number(item.tempo),
        cover: '',
        artist_name: item.artist_name
      }));
    }

    const { normalizedTracks: playlistVectors } = buildPlaylistVectors(
      playlistTracks,
      dataset.minMax
    );
    const playlistIds = new Set(playlistTracks.map((track) => track.track_id));
    const playlistArtists = new Set(
      playlistTracks.map((track) => (track.artist_name || '').toLowerCase())
    );
    const avgPopularity =
      playlistTracks.reduce((sum, track) => sum + (Number(track.popularity) || 0), 0) /
      playlistTracks.length;

    const genreCounts = playlistTracks.reduce((acc, track) => {
      const genre = track.genre || 'unknown';
      acc.set(genre, (acc.get(genre) || 0) + 1);
      return acc;
    }, new Map());

    const preferredGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre);

    const genreFiltered = dataset.normalized.filter((item) => {
      if (!preferredGenres.length) return true;
      return preferredGenres.includes(item.genre) || preferredGenres.includes('unknown');
    });
    const candidates = genreFiltered.length ? genreFiltered : dataset.normalized;

    const rand = createSeededRandom(playlistId);

    const scored = candidates
      .filter((item) => !playlistIds.has(item.track_id))
      .map((item) => {
        const similarities = playlistVectors.map((track) =>
          cosineSimilarity(item.featureVector, track.featureVector)
        );
        const maxSim = similarities.length ? Math.max(...similarities) : 0;
        const avgSim = similarities.length
          ? similarities.reduce((sum, val) => sum + val, 0) / similarities.length
          : 0;
        const baseBlend = maxSim * 0.7 + avgSim * 0.3;

        const genreBoost = preferredGenres.includes(item.genre) ? 1.08 : 0.92;
        const popDelta = Math.min(
          Math.abs((item.popularity || 0) - avgPopularity) / 100,
          0.5
        );
        const popWeight = 1 - popDelta; // closeness to playlist popularity

        const artistPenalty = playlistArtists.has((item.artist_name || '').toLowerCase())
          ? 0.9
          : 1;

        const jitter = rand() * 0.05;

        const blended = baseBlend * 0.75 + popWeight * 0.15 + jitter;
        const adjustedSimilarity = Math.min(Math.max(blended * genreBoost * artistPenalty, 0), 1);
        return { ...item, similarity: adjustedSimilarity };
      })
      .sort((a, b) => b.similarity - a.similarity);

    const reranked = [];
    const usedArtists = new Set();
    const pool = scored.slice(0, 25);

    for (const candidate of pool) {
      const artistKey = (candidate.artist_name || '').toLowerCase();
      const diversityPenalty = usedArtists.has(artistKey) ? 0.8 : 1;
      const finalScore = candidate.similarity * diversityPenalty;
      candidate.finalScore = finalScore;
    }

    pool.sort((a, b) => b.finalScore - a.finalScore);

    for (const candidate of pool) {
      if (reranked.length >= 5) break;
      reranked.push(candidate);
      const artistKey = (candidate.artist_name || '').toLowerCase();
      usedArtists.add(artistKey);
    }

    const top = reranked;
    const metadata = token ? await getTrackMetadata(top.map((t) => t.track_id), token) : [];
    const metadataMap = new Map(metadata.map((item) => [item.track_id, item]));

    const recommendations = top.map((item) => {
      const details = metadataMap.get(item.track_id) || {};
      return {
        name: details.name || item.track_name,
        artist: details.artist || item.artist_name,
        cover: details.cover || '',
        genre: item.genre,
        similarity: Number(item.similarity.toFixed(3))
      };
    });

    if (sortMethod === 'merge') {
      recommendations.sort((a, b) => b.similarity - a.similarity);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        recommendations,
        meta: fallbackReason ? { mode: 'fallback', reason: fallbackReason } : { mode: 'live' }
      })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
