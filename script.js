const inputField = document.querySelector('.input-space');
const sortField = document.querySelector('#sort-method');
const form = document.querySelector('#playlist-form');
const messageEl = document.querySelector('#form-message');
const sortLabel = document.querySelector('#sort-label');
const recommendationsList = document.querySelector('#recommendations-list');
const template = document.querySelector('#recommendation-template');

const playlistRegex = /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+(?:\?.*)?$/;

function setAppState(state) {
  document.body.setAttribute('data-appstate', state);
}

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle('form-message--error', isError);
}

function validateLink(link) {
  return playlistRegex.test(link.trim());
}

async function fetchRecommendations(link, sortMethod) {
  const response = await fetch('/.netlify/functions/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: link, sort_method: sortMethod }),
  });

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error || 'Request failed');
  }

  return response.json();
}

function renderRecommendations(items, sortMethod) {
  recommendationsList.innerHTML = '';

  if (!items?.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No recommendations yet. Try another playlist.';
    recommendationsList.appendChild(empty);
    return;
  }

  sortLabel.textContent = sortMethod === 'merge' ? 'Merge sort' : 'Heap sort';

  items.forEach((item) => {
    const clone = template.content.firstElementChild.cloneNode(true);
    const similarity = Math.min(Math.max(item.similarity ?? 0, 0), 1);
    const percent = Math.round(similarity * 100);
    const placeholder =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%"><stop stop-color="%231db954" offset="0%"/><stop stop-color="%230b1022" offset="100%"/></linearGradient></defs><rect width="200" height="200" fill="url(%23g)"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="Inter, Arial" font-size="22" fill="white">Track</text></svg>';

    clone.querySelector('.recommendation-title').textContent = item.name;
    clone.querySelector('.recommendation-artist').textContent = item.artist;
    const genreEl = clone.querySelector('.recommendation-genre');
    if (genreEl) {
      genreEl.textContent = item.genre ? item.genre.toUpperCase() : '';
      genreEl.hidden = !item.genre;
    }
    clone.querySelector('.recommendation-album').src = item.cover || placeholder;
    clone.querySelector('.recommendation-album').alt = `${item.name} album cover`;

    const progress = clone.querySelector('.sim-score__progress');
    progress.setAttribute('stroke-dasharray', `${percent} 100`);
    clone.querySelector('.sim-score__value').textContent = `${percent}%`;

    recommendationsList.appendChild(clone);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const link = inputField.value.trim();

  if (!validateLink(link)) {
    inputField.classList.add('input-error');
    showMessage('Enter a valid Spotify playlist URL.', true);
    return;
  }

  inputField.classList.remove('input-error');
  showMessage('');
  setAppState('1');

  try {
    const sortMethod = sortField.value;
    const { recommendations, meta } = await fetchRecommendations(link, sortMethod);
    renderRecommendations(recommendations, sortMethod);
    if (meta?.mode === 'fallback') {
      showMessage(`Using offline picks: ${meta.reason}. Add Spotify API keys for live results.`);
    } else {
      showMessage('Playlist processed. Here are your picks!');
    }
    setAppState('2');
  } catch (error) {
    console.error(error);
    setAppState('0');
    showMessage('Could not fetch recommendations. Please try again.', true);
  }
});

inputField.addEventListener('input', () => {
  if (inputField.classList.contains('input-error')) {
    inputField.classList.remove('input-error');
    showMessage('');
  }
});
