function getApiPrefix() {
  const p = window.location.pathname;
  if (p.startsWith('/tg')) return '/tg/api';
  if (p.startsWith('/msm')) return '/msm/api';
  return '/api';
}

export function getBasePath() {
  const p = window.location.pathname;
  if (p.startsWith('/tg')) return '/tg';
  if (p.startsWith('/msm')) return '/msm';
  return '';
}

export const api = {
  getPrefix: getApiPrefix,

  async request(endpoint, options = {}) {
    const prefix = getApiPrefix();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${prefix}${cleanEndpoint}`;

    const headers = {
      Accept: 'application/json',
      ...options.headers,
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers,
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    }
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  },

  get(endpoint, options = {}) {
    return this.request(endpoint, { method: 'GET', ...options });
  },

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { method: 'POST', body, ...options });
  },

  delete(endpoint, options = {}) {
    return this.request(endpoint, { method: 'DELETE', ...options });
  },

  getSSEUrl(endpoint) {
    const prefix = getApiPrefix();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${prefix}${cleanEndpoint}`;
  },

  getDownloadUrl(endpoint) {
    const prefix = getApiPrefix();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${prefix}${cleanEndpoint}`;
  },
};
