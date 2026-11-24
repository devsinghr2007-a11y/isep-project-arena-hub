# ArenaHub

Sports arena booking platform — customers search/book courts and rent equipment, arena owners manage listings, admins verify and moderate.

## Features
- **Razorpay Payment Gateway**: Seamless court bookings with Razorpay checkout and secure HMAC SHA256 server-side signature verification.
- **Stadium After Dark Design**: Modern, responsive UI built with React 19, Vite, and Tailwind CSS.
- **Full Backend API**: Express.js + MongoDB backend covering arenas, courts, bookings, payments, reviews, and admin management.
- **Vercel Ready**: Configured for direct deployment to Vercel with Serverless Functions (`api/index.js`) and SPA routing (`vercel.json`).

## Environment Variables

### Backend (`backend/.env` / Vercel Environment Variables)
```env
MONGO_URI=your_mongodb_connection_string
PORT=5000
JWT_SECRET=your_jwt_secret

# Razorpay credentials
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Optional Email / Twilio
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=/api
```
*(When deployed on Vercel, `/api` is routed directly to the serverless function. For local separate servers, default is `http://localhost:5000/api`)*

## Run locally

```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and Backend runs on `http://localhost:5000`.

## Deploy on Vercel

1. Import this repository in [Vercel](https://vercel.com).
2. Set the Environment Variables in Vercel project settings:
   - `MONGO_URI`: Your MongoDB Atlas connection URI.
   - `JWT_SECRET`: A long random secret string.
   - `RAZORPAY_KEY_ID`: Your Razorpay Key ID (`rzp_test_...` or `rzp_live_...`).
   - `RAZORPAY_KEY_SECRET`: Your Razorpay Key Secret.
3. Deploy! Vercel will automatically build the frontend into `frontend/dist` and serve `/api/*` through Serverless Functions.
