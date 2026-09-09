const API_BASE = ''; // Same origin

const handleResponse = async (res) => {
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP error ${res.status}`);
    }
    return res.json();
};

const API = {
  tmdb: {
    trending: (type = 'movie', window = 'week') => fetch(`${API_BASE}/api/tmdb/trending/${type}/${window}`).then(handleResponse),
    search: (type, query, page = 1) => fetch(`${API_BASE}/api/tmdb/search/${type}?query=${encodeURIComponent(query)}&page=${page}`).then(handleResponse),
    movieDetails: (id) => fetch(`${API_BASE}/api/tmdb/movie/${id}`).then(handleResponse),
    tvDetails: (id) => fetch(`${API_BASE}/api/tmdb/tv/${id}`).then(handleResponse),
    genres: (type) => fetch(`${API_BASE}/api/tmdb/genre/${type}/list`).then(handleResponse),
    popular: () => fetch(`${API_BASE}/api/tmdb/movie/popular`).then(handleResponse),
    topRated: () => fetch(`${API_BASE}/api/tmdb/movie/top_rated`).then(handleResponse),
    discover: (type, params) => fetch(`${API_BASE}/api/tmdb/discover/${type}?${new URLSearchParams(params)}`).then(handleResponse),
    posterUrl: (path, size = 'w342') => path ? `${API_BASE}/api/image?path=${encodeURIComponent(path)}&size=${size}` : '',
    backdropUrl: (path, size = 'w1280') => path ? `${API_BASE}/api/image?path=${encodeURIComponent(path)}&size=${size}` : '',
  },
  jacred: {
    search: (query, category) => fetch(`${API_BASE}/api/jacred/search?query=${encodeURIComponent(query)}${category ? '&category=' + category : ''}`).then(handleResponse),
    status: () => fetch(`${API_BASE}/api/jacred/status`).then(handleResponse),
  },
  downloads: {
    list: () => fetch(`${API_BASE}/api/downloads`).then(handleResponse),
    add: (data) => fetch(`${API_BASE}/api/downloads`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }).then(handleResponse),
    remove: (id) => fetch(`${API_BASE}/api/downloads/${id}`, { method: 'DELETE' }).then(handleResponse),
    action: (id, action) => fetch(`${API_BASE}/api/downloads/${id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action}) }).then(handleResponse),
    stats: () => fetch(`${API_BASE}/api/downloads/stats`).then(handleResponse),
  },
  library: {
    list: () => fetch(`${API_BASE}/api/library`).then(handleResponse),
    get: (id) => fetch(`${API_BASE}/api/library/${id}`).then(handleResponse),
    remove: (id) => fetch(`${API_BASE}/api/library/${id}`, { method: 'DELETE' }).then(handleResponse),
    updateProgress: (id, data) => fetch(`${API_BASE}/api/library/${id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }).then(handleResponse),
  },
  stream: {
    url: (filePath, transcode = false) => `${API_BASE}/api/stream?file=${encodeURIComponent(filePath)}${transcode ? '&transcode=1' : ''}`,
    probe: (filePath) => fetch(`${API_BASE}/api/stream/probe?file=${encodeURIComponent(filePath)}`).then(handleResponse),
  },
  settings: {
    get: () => fetch(`${API_BASE}/api/settings`).then(handleResponse),
    save: (data) => fetch(`${API_BASE}/api/settings`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }).then(handleResponse),
  },
  system: {
    status: () => fetch(`${API_BASE}/api/status`).then(handleResponse),
    disk: () => fetch(`${API_BASE}/api/disk`).then(handleResponse),
  }
};
