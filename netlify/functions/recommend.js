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

function asGenreArray(value) {
  if (Array.isArray(value)) return value.length ? value : ['unknown'];
  if (typeof value === 'string' && value.trim()) return [normalizeGenreLabel(value)];
  return ['unknown'];
}

function normalizeGenreLabel(label = '') {
  const genre = Array.isArray(label) ? label.join(' ').toLowerCase() : label.toLowerCase();
  const mapping = [
    { targets: ['country'], value: 'country' },
    { targets: ['hip hop', 'hip-hop', 'rap', 'trap'], value: 'hip-hop' },
    { targets: ['r&b', 'soul'], value: 'soul' },
    { targets: ['k-pop', 'kpop'], value: 'k-pop' },
    { targets: ['latin', 'reggaeton', 'salsa', 'bachata', 'sertanejo'], value: 'latin' },
    { targets: ['edm', 'dance', 'electronic', 'house', 'club'], value: 'dance' },
    { targets: ['rock', 'metal', 'punk', 'emo', 'alt-rock', 'alternative'], value: 'rock' },
    { targets: ['folk', 'acoustic', 'singer-songwriter'], value: 'folk' },
    { targets: ['jazz'], value: 'jazz' },
    { targets: ['classical'], value: 'classical' }
  ];

  for (const { targets, value } of mapping) {
    if (targets.some((target) => genre.includes(target))) {
      return value;
    }
  }

  return genre || 'unknown';
}

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
    const coarseGenre = normalizeGenreLabel(item.genre);
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
      coarseGenre,
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
    const coarseSet = new Set();
    (artist.genres || []).forEach((g) => {
      const coarse = normalizeGenreLabel(g);
      if (coarse !== 'unknown') coarseSet.add(coarse);
    });
    if (!coarseSet.size) {
      const fallback = normalizeGenreLabel(artist.genres?.[0] || 'unknown');
      if (fallback) coarseSet.add(fallback);
    }
    artistGenres.set(artist.id, Array.from(coarseSet));
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
      const artistCoarseGenres = artistGenres.get(track.artists?.[0]?.id) || ['unknown'];
      return {
        track_id: track.id,
        track_name: track.name,
        popularity: track.popularity,
        genre: artistCoarseGenres,
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

async function fetchOEmbedCover(trackId) {
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`
    );
    if (!res.ok) return '';
    const data = await res.json();
    return data.thumbnail_url || '';
  } catch (err) {
    console.error('Failed to fetch oEmbed cover', err.message);
    return '';
  }
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
        genre: asGenreArray(item.genre),
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

    const {
      normalizedTracks: playlistVectors,
      meanVector: playlistMean
    } = buildPlaylistVectors(playlistTracks, dataset.minMax);
    const playlistIds = new Set(playlistTracks.map((track) => track.track_id));
    const playlistArtists = new Set(
      playlistTracks.map((track) => (track.artist_name || '').toLowerCase())
    );
    const avgPopularity =
      playlistTracks.reduce((sum, track) => sum + (Number(track.popularity) || 0), 0) /
      playlistTracks.length;

    const genreCounts = playlistTracks.reduce((acc, track) => {
      const genres = asGenreArray(track.genre).map((g) => normalizeGenreLabel(g));
      const weight = 1 / Math.max(genres.length, 1);
      genres.forEach((genre) => {
        acc.set(genre, (acc.get(genre) || 0) + weight);
      });
      return acc;
    }, new Map());

    let totalTracks = playlistTracks.length || 1;
    if (!genreCounts.size) {
      // Infer likely playlist genres by comparing the playlist mean to the dataset
      const inferred = dataset.normalized
        .map((item) => ({
          item,
          sim: cosineSimilarity(item.featureVector, playlistMean)
        }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 40);
      inferred.forEach(({ item }) => {
        const coarse = normalizeGenreLabel(item.coarseGenre || item.genre);
        genreCounts.set(coarse, (genreCounts.get(coarse) || 0) + 1);
      });
      totalTracks = inferred.length || totalTracks;
    }

    const preferredGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([genre, count]) => ({ genre, weight: count / totalTracks }));

    const primaryGenres = preferredGenres.filter((g, idx) => g.weight >= 0.18 || idx === 0);

    const primaryGenreSet = new Set(primaryGenres.map((g) => g.genre));

    const strictGenreMatches = dataset.normalized.filter((item) => {
      if (!primaryGenres.length) return true;
      const itemGenre = normalizeGenreLabel(item.coarseGenre || item.genre);
      return primaryGenreSet.has(itemGenre);
    });

    const candidates = strictGenreMatches.length >= 12 ? strictGenreMatches : dataset.normalized;

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
        const meanSim = cosineSimilarity(item.featureVector, playlistMean);
        const featureScore = maxSim * 0.5 + avgSim * 0.25 + meanSim * 0.25;

        const itemGenre = normalizeGenreLabel(item.coarseGenre || item.genre);
        const genreWeight = primaryGenres.find((g) => g.genre === itemGenre)?.weight || 0;
        const genreMatchBoost = 1 + Math.min(genreWeight * 0.8, 0.45);
        const genrePenalty = primaryGenreSet.size && !primaryGenreSet.has(itemGenre) ? 0.18 : 1;

        const popDelta = Math.min(
          Math.abs((item.popularity || 0) - avgPopularity) / 100,
          0.5
        );
        const popWeight = 1 - popDelta; // closeness to playlist popularity

        const artistPenalty = playlistArtists.has((item.artist_name || '').toLowerCase())
          ? 0.9
          : 1;

        const jitter = rand() * 0.01;

        const blended =
          (featureScore * 0.84 + meanSim * 0.06 + popWeight * 0.08 + jitter) *
            genrePenalty +
          genreMatchBoost * 0.02;
        const adjustedSimilarity = Math.min(Math.max(blended * artistPenalty, 0), 1);
        return { ...item, similarity: adjustedSimilarity, featureScore, maxSim, avgSim, meanSim };
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

    const finalScores = pool.map((item) => item.finalScore);
    const minScore = Math.min(...finalScores);
    const maxScore = Math.max(...finalScores);
    const scoreRange = Math.max(0.08, maxScore - minScore || 0);

    pool.forEach((candidate, index) => {
      if (reranked.length >= 5) return;
      const normalizedScore = (candidate.finalScore - minScore) / scoreRange;
      const rankComponent = 1 - index / pool.length;
      const baseSignal = Math.max(candidate.maxSim, candidate.meanSim, candidate.featureScore);
      const blendedSignal = 0.45 * baseSignal + 0.35 * normalizedScore + 0.2 * rankComponent;
      const displaySimilarity = 0.6 + Math.min(Math.max(blendedSignal, 0), 1) * 0.39;
      candidate.displaySimilarity = Math.min(Math.max(displaySimilarity, 0), 1);
      reranked.push(candidate);
      const artistKey = (candidate.artist_name || '').toLowerCase();
      usedArtists.add(artistKey);
    });

    const top = reranked;
    const metadata = token ? await getTrackMetadata(top.map((t) => t.track_id), token) : [];
    const metadataMap = new Map(metadata.map((item) => [item.track_id, item]));

    const recommendations = await Promise.all(
      top.map(async (item) => {
        const details = metadataMap.get(item.track_id) || {};
        let cover = details.cover || '';
        if (!cover) {
          cover = await fetchOEmbedCover(item.track_id);
        }

        return {
          name: details.name || item.track_name,
          artist: details.artist || item.artist_name,
          cover,
          genre: item.genre,
          similarity: Number(item.displaySimilarity?.toFixed(3) || item.similarity.toFixed(3)),
          track_id: item.track_id,
          url: `https://open.spotify.com/track/${item.track_id}`
        };
      })
    );

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
