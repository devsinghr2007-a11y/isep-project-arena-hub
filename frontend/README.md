# ArenaHub Frontend

React + Vite + Tailwind v4 + React Router + Axios.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL if backend isn't on localhost:5000
npm run dev
```

## Structure

- `src/api/` — axios instance (JWT interceptor) + one function per backend endpoint
- `src/context/AuthContext.jsx` — session state, login/register/logout, persisted in localStorage
- `src/components/` — Navbar, ProtectedRoute, ArenaCard, StarRating
- `src/pages/` — Landing, Login, Register, Search, ArenaDetails, Booking, Profile
- `src/pages/dashboard/` — CustomerDashboard, OwnerDashboard, AdminDashboard

## Notes

- Routing and role-gating live in `App.jsx` / `ProtectedRoute.jsx`.
- Booking uses Cashfree Checkout (loaded in `index.html`). Add Cashfree sandbox credentials to `backend/.env` to open the payment sheet; the client never receives the Cashfree secret key.
- The owner dashboard is also where courts get their bookable slots (`Open a booking slot` form) — a newly created court has none by default.
