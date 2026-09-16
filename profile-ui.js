const ACCOUNT_URL = "https://identity.ace-base.cc/account";

function initials(user) {
  const source = String(user?.name || user?.email || "A").trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function renderProfile(user) {
  const sidebar = document.querySelector("aidc-sidebar");
  if (!sidebar || !user) return;

  const container = sidebar.querySelector(".aidc-sidebar-user");
  const info = container?.querySelector(".aidc-sidebar-user-info");
  if (!container || !info) return;

  let link = container.querySelector(".aidc-profile-link");
  if (!link) {
    link = document.createElement("a");
    link.className = "aidc-profile-link";
    link.href = ACCOUNT_URL;
    link.setAttribute("aria-label", "Open Ace ID account");

    const avatar = document.createElement("span");
    avatar.className = "aidc-profile-avatar";
    avatar.setAttribute("aria-hidden", "true");

    const image = document.createElement("img");
    image.className = "aidc-profile-avatar-image";
    image.alt = "";
    image.decoding = "async";
    image.loading = "lazy";

    const letters = document.createElement("span");
    letters.className = "aidc-profile-avatar-initials";

    avatar.append(image, letters);
    link.append(avatar, info);
    container.insertBefore(link, container.querySelector(".aidc-icon-button"));
  }

  const image = link.querySelector(".aidc-profile-avatar-image");
  const letters = link.querySelector(".aidc-profile-avatar-initials");
  const picture = typeof user.picture === "string" ? user.picture.trim() : "";

  letters.textContent = initials(user);

  if (picture) {
    image.src = picture;
    image.hidden = false;
    letters.hidden = true;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    letters.hidden = false;
  }
}

function sync(event) {
  const user = event?.detail?.user || null;
  window.__AIDC_LAST_USER = user;
  renderProfile(user);
}

window.addEventListener("aidc-state-change", sync);

const observer = new MutationObserver(() => {
  const sidebar = document.querySelector("aidc-sidebar");
  if (!sidebar) return;
  renderProfile(window.__AIDC_LAST_USER || null);
});

observer.observe(document.documentElement, {
  subtree: true,
  childList: true
});
