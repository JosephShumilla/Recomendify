const input_field = document.querySelector(".input-space");
const sort_field = document.querySelector("#sort-method");
const text = document.querySelector(".user-space");
const regex = /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+$/;

// Checks link format
function linkChecker(string) {
  return regex.test(string);
};

// Fetches data from python server
function fetchResponse(data, sort_method) {
  return fetch('/server', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data, sort_method }),
  })
  .then(response => response.json())
  .then(data => {
	console.log(data);
	showResults(data.recommendations);
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
	reccs = data
	reccEls = document.querySelectorAll("#recommendations-container li")
	hasReccs = false
	reccs.forEach((recc, i) => {
		hasReccs = true
		reccEls[i].querySelector("h3").textContent = recc.name
		reccEls[i].querySelector("h4").textContent = recc.artist
		reccEls[i].querySelector("img").src = recc.cover
		reccEls[i].style.setProperty("--similarity", recc.similarity)
	});
	if (hasReccs){
		document.body.setAttribute("data-appstate", "2");
	}
	else{
		document.body.setAttribute("data-appstate", "0")
		alert("Error occured while reading given playlist. Please try another.")
	}
}