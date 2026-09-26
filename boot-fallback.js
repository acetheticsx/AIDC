window.setTimeout(function () {
  if (customElements.get("aidc-app")) {
    return;
  }

  var app = document.getElementById("app");

  if (!app || app.textContent.trim()) {
    return;
  }

  app.innerHTML =
    '<section class="aidc-boot-fallback">' +
    '<h1>Failed to load AIDC</h1>' +
    '<p>The interface could not be initialised. Open the browser console for details. Most commonly, this means a module failed to load.</p>' +
    '</section>';
}, 2500);
