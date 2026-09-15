const API_BASE = window.AIDC_API_URL || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Empty response body is valid for some requests.
  }

  if (!response.ok) {
    const error = new Error(
      data?.error || `Request failed with status ${response.status}.`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

function id(value) {
  return encodeURIComponent(value);
}

export const api = {
  applications: {
    list() {
      return request("/applications");
    },

    get(applicationId) {
      return request(`/applications/${id(applicationId)}`);
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
      return request(
        `/applications/${id(applicationId)}/credentials`
      );
    },

    rotate(applicationId) {
      return request(
        `/applications/${id(applicationId)}/credentials/rotate`,
        {
          method: "POST"
        }
      );
    },

    revoke(applicationId, credentialId) {
      return request(
        `/applications/${id(applicationId)}/credentials/${id(
          credentialId
        )}`,
        {
          method: "DELETE"
        }
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