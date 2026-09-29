window.setTimeout(function () {
  if (customElements.get("aidc-app")) {
    return;
  }

  var app = document.getElementById("app");

  if (!app || app.querySelector(".aidc-boot-fallback")) {
    return;
  }

  app.innerHTML =
    '<section class="aidc-boot-fallback" role="alert">' +
    '<div>' +
    '<span class="aidc-eyebrow">AIDC</span>' +
    '<h1>Interface failed to initialise</h1>' +
    '<p>The application shell did not finish loading. Your data was not changed.</p>' +
    (window.__AIDC_BOOT_ERROR ? '<pre class="aidc-boot-fallback-error">' + String(window.__AIDC_BOOT_ERROR.message || "Unknown boot error").replace(/[&<>]/g, function (char) { return {"&":"&amp;","<":"&lt;",">":"&gt;"}[char]; }) + '</pre>' : '') +
    '<div class="aidc-boot-fallback-actions">' +
    '<button type="button" onclick="window.location.reload()">Reload AIDC</button>' +
    '<a href="/auth/login">Sign in with Ace ID</a>' +
    '</div>' +
    '</div>' +
    '</section>';
}, 2500);
