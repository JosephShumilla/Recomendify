const input_field = document.querySelector(".input-space");
const sort_field = document.querySelector("#sort-method");
const text = document.querySelector(".user-space");
const regex = /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+$/;

// Checks link format
function linkChecker(string) {
  return regex.test(string);
};

// Fetches data from the Netlify serverless function (falls back to the Flask server)
async function fetchResponse(data, sort_method) {
  const payload = { data, sort_method };

  // Prefer endpoints that match the current origin to avoid mixed-content failures
  const { protocol, hostname, port } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isFlask = isLocalhost && port === '5500';

  const endpoints = [];

  // Netlify (prod/dev) first when running through Netlify
  if (!isFlask) {
    endpoints.push('/.netlify/functions/recommendify');
  }

  // Same-origin Flask route works for both python main.py and Netlify redirect
  endpoints.push('/server');

  // Only try the explicit localhost fallback when the page itself is served over http
  if (protocol === 'http:' && !isFlask && isLocalhost) {
    endpoints.push('http://localhost:5500/server');
  }

  for (const endpoint of endpoints) {
    try {
      const recommendations = await makeRequest(endpoint, payload);
      showResults(recommendations);
      return;
    } catch (error) {
      const is404 = error?.status === 404;
      const isNetworkError = error?.name === 'TypeError' ||
        (typeof error?.message === 'string' && error.message.includes('Failed to fetch'));
      const canTryNext = (is404 || isNetworkError) && endpoint !== endpoints[endpoints.length - 1];

      if (canTryNext) {
        const reason = is404 ? '404' : 'network error';
        console.warn(`Endpoint ${endpoint} failed (${reason}), trying next fallback.`);
        continue;
      }

      console.error('Error:', error);
      const hint = is404
        ? 'Start the app with "netlify dev" or "python main.py" so the API route is available.'
        : null;
      handleError(error?.message || hint || 'Something went wrong. Please try again.');
      return;
    }
  }
}

// Makes a POST request to the provided endpoint and validates the payload
async function makeRequest(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') || '';
  let payload;

  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = { message: text || 'Unexpected response from server' };
  }

  if (!response.ok) {
    const message = payload?.message || payload?.detail || 'Request failed';
    const error = new Error(`${message} (status ${response.status})`);
    error.status = response.status;
    throw error;
  }

  if (!payload?.recommendations?.length) {
    throw new Error('No recommendations were returned for this playlist.');
  }

  return payload.recommendations;
}

// Performs fetch on submit if the link is valid, else the user is shown red
document.querySelector("form#playlist-form").addEventListener("submit", (e) => {
	e.preventDefault();
        var link = input_field.value;
        if (linkChecker(link)) {
                document.body.setAttribute("data-appstate", "1");
                fetchResponse(link, sort_field.value);
        } else {
		input_field.classList.add("input-error");
	}
});

// Sets the relevant html to show data retrieved from recommendation system
function showResults (data) {
        const list = document.querySelector("#recommendations-list");
        list.innerHTML = "";

        data.slice(0, 10).forEach((recc) => {
                const item = document.createElement("li");
                item.className = "recommendation";
                item.style.setProperty("--similarity", recc.similarity || 0);

                item.innerHTML = `
                        <img src="${recc.cover}" alt="Album cover for ${recc.name}" class="recommendation-album">
                        <div class="recommendation-text">
                                <h3 class="recommendation-title">${recc.name}</h3>
                                <h4 class="recommendation-artist">${recc.artist}</h4>
                        </div>
                        <div class="sim-score">
                                <svg class="sim-score" width=10 height=10>
                                        <circle cx="50%" cy="50%" r="1em" stroke="var(--theme-sec)" fill="transparent" stroke-width=".3em"  />
                                </svg>
                        </div>
                `;

                list.appendChild(item);
        });

        if (list.children.length){
                document.body.setAttribute("data-appstate", "2");
        }
        else{
                document.body.setAttribute("data-appstate", "0")
                alert("Error occured while reading given playlist. Please try another.")
        }
}

// Handles API errors by resetting the UI and notifying the user
function handleError(message) {
        document.body.setAttribute("data-appstate", "0");
        alert(message);
}