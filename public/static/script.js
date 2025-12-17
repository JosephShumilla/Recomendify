const input_field = document.querySelector(".input-space");
const sort_field = document.querySelector("#sort-method");
const text = document.querySelector(".user-space");
const regex = /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+(\?[a-zA-Z0-9=_-]+)?$/;

// Checks link format
function linkChecker(string) {
  return regex.test(string);
};

// Fetches data from serverless function
function fetchResponse(data, sort_method) {
  return fetch('/.netlify/functions/recommendation', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data, sort_method }),
  })
  .then(response => response.json())
  .then(data => {
        showResults(data.recommendations || []);
  })
  .catch(error => {
    console.error('Error:', error);
    throw error;
  });
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
        const reccList = document.querySelector("#recommendations-list");
        reccList.innerHTML = "";

        if (!data.length){
                document.body.setAttribute("data-appstate", "0");
                alert("Error occured while reading given playlist. Please try another.");
                return;
        }

        data.forEach((recc) => {
                const li = document.createElement('li');
                li.classList.add('recommendation');

                const img = document.createElement('img');
                img.classList.add('recommendation-album');
                img.src = recc.cover;
                img.alt = `${recc.name} album art`;

                const textWrapper = document.createElement('div');
                textWrapper.classList.add('recommendation-text');
                const title = document.createElement('h3');
                title.classList.add('recommendation-title');
                title.textContent = recc.name;
                const artist = document.createElement('h4');
                artist.classList.add('recommendation-artist');
                artist.textContent = recc.artist;
                textWrapper.appendChild(title);
                textWrapper.appendChild(artist);

                const simWrap = document.createElement('div');
                simWrap.classList.add('sim-score');
                simWrap.style.setProperty('--similarity', recc.similarity);
                simWrap.innerHTML = `<svg class="sim-score" width="10" height="10">
                                <circle cx="50%" cy="50%" r="1em" stroke="var(--theme-sec)" fill="transparent" stroke-width=".3em"  />
                        </svg>`;

                li.appendChild(img);
                li.appendChild(textWrapper);
                li.appendChild(simWrap);

                reccList.appendChild(li);
        });

        document.body.setAttribute("data-appstate", "2");
}