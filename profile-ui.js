const ACCOUNT_URL = "https://identity.ace-base.cc/account";

function initials(user) {
  const source = String(
    user?.name || user?.email || "A"
  ).trim();
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
  if (!container) return;

  const legacyInfo = container.querySelector(
    ".aidc-sidebar-user-info"
  );
  if (legacyInfo) {
    legacyInfo.hidden = true;
  }

  const existing = container.querySelector(".aidc-profile-link");
  const logout = container.querySelector(".aidc-icon-button");

  if (existing) {
    updateProfile(existing, user);
    return;
  }

  const link = document.createElement("a");
  link.className = "aidc-profile-link";
  link.href = ACCOUNT_URL;
  link.setAttribute("aria-label", "Open Ace ID account");
  link.title = "Open Ace ID account";

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

  const copy = document.createElement("span");
  copy.className = "aidc-profile-copy";

  const name = document.createElement("strong");
  name.className = "aidc-profile-name";

  const email = document.createElement("span");
  email.className = "aidc-profile-email";

  copy.append(name, email);
  link.append(avatar, copy);

  if (logout) {
    container.insertBefore(link, logout);
  } else {
    container.append(link);
  }

  updateProfile(link, user);
}

function updateProfile(link, user) {
  const image = link.querySelector(".aidc-profile-avatar-image");
  const letters = link.querySelector(".aidc-profile-avatar-initials");
  const name = link.querySelector(".aidc-profile-name");
  const email = link.querySelector(".aidc-profile-email");

  const displayName = String(
    user?.name || user?.email || "Ace ID"
  ).trim();
  const displayEmail = String(user?.email || "").trim();
  const picture = String(
    user?.picture || user?.avatar_url || ""
  ).trim();

  name.textContent = displayName;
  email.textContent = displayEmail;
  email.hidden = !displayEmail;
  letters.textContent = initials(user);

  if (picture) {
    image.src = picture;
    image.hidden = false;
    letters.hidden = true;
    image.onerror = () => {
      image.hidden = true;
      letters.hidden = false;
    };
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
  renderProfile(window.__AIDC_LAST_USER || null);
});

observer.observe(document.documentElement, {
  subtree: true,
  childList: true
});

queueMicrotask(() => {
  renderProfile(window.__AIDC_LAST_USER || null);
});
