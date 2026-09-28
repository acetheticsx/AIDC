const API_BASE = window.AIDC_API_URL || "/api";

function readCookie(name) {
  const escaped = name.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const match = document.cookie.match(
    new RegExp("(?:^|; )" + escaped + "=([^;]*)")
  );

  return match ? decodeURIComponent(match[1]) : null;
}

async function request(path, options = {}) {
  const method = (
    options.method || "GET"
  ).toUpperCase();

  const useApiBase = options.base !== false;
  const fetchOptions = { ...options };
  const redirectOnAuthFailure =
    options.authRedirect !== false;

  delete fetchOptions.base;
  delete fetchOptions.authRedirect;

  const headers = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers || {})
  };

  /*
   * Double-submit CSRF: echo the value of the
   * aidc_csrf cookie back as a header. The server
   * compares them with timingSafeEqual.
   */
  if (
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    const csrf = readCookie("aidc_csrf");

    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
    }
  }

  const base = useApiBase ? API_BASE : "";
  const response = await fetch(`${base}${path}`, {
    ...fetchOptions,
    credentials: "include",
    headers
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Empty response body is valid for some requests.
  }

  if (!response.ok) {
    const error = new Error(
      data?.error ||
        `Request failed with status ${response.status}.`
    );

    error.status = response.status;
    error.data = data;

    /*
     * Let the app layer know it should redirect
     * to /auth/login. Doing this here means every
     * API caller gets the behaviour for free.
     */
    if (
      response.status === 401 &&
      redirectOnAuthFailure
    ) {
      window.dispatchEvent(
        new CustomEvent("aidc-auth-required", {
          detail: {
            status: response.status,
            message: error.message
          }
        })
      );
    }

    throw error;
  }

  return data;
}

function id(value) {
  return encodeURIComponent(value);
}

export const api = {
  auth: {
    me() {
      return request("/me", {
        authRedirect: false
      });
    },

    logout() {
      return request("/auth/logout", {
        method: "POST",
        base: false
      });
    }
  },

  applications: {
    list() {
      return request("/applications");
    },

    get(applicationId) {
      return request(
        `/applications/${id(applicationId)}`
      );
    },

    create(payload) {
      return request("/applications", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },

    update(applicationId, payload) {
      return request(`/applications/${id(applicationId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },

    remove(applicationId) {
      return request(`/applications/${id(applicationId)}`, {
        method: "DELETE"
      });
    }
  },

  originVerification: {
    get(applicationId) {
      return request(
        `/applications/${id(applicationId)}/origin-verification`
      );
    },

    verify(applicationId) {
      return request(
        `/applications/${id(applicationId)}/origin-verification/verify`,
        {
          method: "POST"
        }
      );
    }
  },

  redirectUris: {
    list(applicationId) {
      return request(
        `/applications/${id(applicationId)}/redirect-uris`
      );
    },

    add(applicationId, uri) {
      return request(
        `/applications/${id(applicationId)}/redirect-uris`,
        {
          method: "POST",
          body: JSON.stringify({ uri })
        }
      );
    },

    remove(applicationId, uriId) {
      return request(
        `/applications/${id(applicationId)}/redirect-uris/${id(uriId)}`,
        {
          method: "DELETE"
        }
      );
    }
  },

  scopes: {
    list(applicationId) {
      return request(
        `/applications/${id(applicationId)}/scopes`
      );
    },

    update(applicationId, scopes) {
      return request(
        `/applications/${id(applicationId)}/scopes`,
        {
          method: "PUT",
          body: JSON.stringify({ scopes })
        }
      );
    }
  },

  credentials: {
    list(applicationId) {
      return request(`/applications/${id(applicationId)}/credentials`);
    },

    rotate(applicationId) {
      return request(
        `/applications/${id(applicationId)}/credentials/rotate`,
        { method: "POST" }
      );
    },

    revoke(applicationId, credentialId) {
      return request(
        `/applications/${id(applicationId)}/credentials/${id(
          credentialId
        )}`,
        { method: "DELETE" }
      );
    }
  },

  branding: {
    get(applicationId) {
      return request(
        `/applications/${id(applicationId)}/branding`
      );
    },

    update(applicationId, payload) {
      return request(
        `/applications/${id(applicationId)}/branding`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );
    }
  },

  analytics: {
    logins(days = 7) {
      return request(`/analytics/logins?days=${encodeURIComponent(days)}`);
    }
  },

  playground: {
    config() {
      return request("/playground/config");
    }
  },

  activity: {
    list(applicationId, limit = 50) {
      return request(
        `/applications/${id(applicationId)}/activity?limit=${encodeURIComponent(
          limit
        )}`
      );
    }
  }
};

export { request };