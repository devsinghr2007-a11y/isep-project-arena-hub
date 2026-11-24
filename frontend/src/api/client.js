import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const client = axios.create({ baseURL: apiUrl });

export const mediaUrl = (value) => {
  if (!value || /^https?:\/\//i.test(value)) return value;
  const serverUrl = apiUrl.replace(/\/api\/?$/, '');
  return `${serverUrl}${value.startsWith('/') ? value : `/${value}`}`;
};

export const googleMapsDirectionsUrl = (arena) => {
  const destination = arena.location?.lat != null && arena.location?.lng != null
    ? `${arena.location.lat},${arena.location.lng}`
    : [arena.name, arena.location?.address, arena.location?.city].filter(Boolean).join(', ');
  const params = new URLSearchParams({ api: '1', destination });
  if (arena.googlePlaceId) params.set('destination_place_id', arena.googlePlaceId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('arenahub_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('arenahub_token');
      localStorage.removeItem('arenahub_user');
    }
    return Promise.reject(err);
  }
);

export default client;
