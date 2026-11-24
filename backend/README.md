# ArenaHub Backend

## Setup

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Needs a running MongoDB instance (local `mongod` or a MongoDB Atlas URI in `.env`).

## Email verification setup

New accounts are created only after the person verifies a six-digit code sent to their email address. Add the following values to `backend/.env` before testing registration:

```env
GMAIL_USER=your-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your-16-character-google-app-password
GMAIL_FROM=ArenaHub <your-gmail-address@gmail.com>
OTP_TTL_MINUTES=10
```

- Create a Google **App Password** for the Gmail account; a normal Gmail password will not work.
- A phone number is saved on the profile, but it is not SMS-verified in this no-cost setup.
- Restart the backend after changing `.env`.

## Google Maps verification and directions

New arena listings can be approved automatically when Google Places confirms a matching active venue at the submitted address. In Google Cloud, enable **Places API (New)**, create a restricted server API key, then add it to `backend/.env`:

```env
GOOGLE_MAPS_API_KEY=your-server-api-key
GOOGLE_MAPS_REGION=IN
```

If a listing cannot be verified (or the key is not configured), it remains pending for an admin to review. Customers can always use the Google Maps directions link on an approved arena's details page; that link does not require an API key.

## API surface

All routes are mounted under `/api`. Roles are enforced via `middleware/auth.js` (`protect` + `authorize(...roles)`).

| Resource | Routes |
|---|---|
| Auth | `POST /register`, `POST /login` |
| Arena | `GET /arenas` (public, approved only), `GET /arenas/mine` (owner, any status), `GET /arenas/all` (admin, any status), `GET /arenas/:id`, `POST /arena`, `PUT /arena/:id`, `DELETE /arena/:id` |
| Court | `GET /courts?arenaId=`, `POST /court`, `PUT /court/:id`, `POST /court/:id/slots` (owner adds bookable slots) |
| Equipment | `GET /equipment?arenaId=&sport=`, `POST /equipment` |
| Equipment Rental | `POST /rental`, `GET /rental` (scoped by role), `PUT /rental/:id/return` |
| Booking | `POST /booking` (atomic slot-locking, prevents double-booking), `GET /booking` (scoped by role) |
| Payment | `POST /payment/order`, `POST /payment/verify`, `POST /payment/cashfree/webhook` (Cashfree) |
| Review | `GET /arenas/:arenaId/reviews`, `POST /arenas/:arenaId/reviews`, `DELETE /reviews/:id` — auto-syncs `Arena.rating` |
| Admin | `GET /users?role=`, `PUT /users/:id/verify`, `DELETE /users/:id`, `GET /admin/reports` |

## Important flow notes

- A court has zero bookable slots until the owner calls `POST /court/:id/slots` — creating a court alone does not make it bookable.
- `GET /arenas` always filters to `status: 'approved'`; owners must use `/arenas/mine` and admins `/arenas/all` to see pending/rejected listings.
- Arena owner accounts start with `isVerified: false`; admin verifies them via `PUT /users/:id/verify`. That admin action also approves the owner’s existing pending arena submissions. `users.isVerified` and `arenas.status` are separate MongoDB fields, so changing only the user field directly in Compass does not approve an already-created arena; set the arena’s `status` to `approved` or use the Admin dashboard → Arenas → Approve.
- Booking flow: `POST /booking` claims the slot and creates a `pending` booking → `POST /payment/order` creates a Cashfree payment session → Cashfree Checkout → `POST /payment/verify` fetches the final Cashfree order status before confirming the booking. The signed Cashfree webhook also confirms successful payments.

## Cashfree checkout

Create a Cashfree **Payment Gateway** app, then add its sandbox App ID and Secret Key to `backend/.env`:

```env
CASHFREE_ENVIRONMENT=sandbox
CASHFREE_CLIENT_ID=your_sandbox_app_id
CASHFREE_CLIENT_SECRET=your_sandbox_secret_key
```

For production, change `CASHFREE_ENVIRONMENT` to `production`, whitelist your website domain in Cashfree, and set `CASHFREE_NOTIFY_URL` to `https://your-domain.com/api/payment/cashfree/webhook`. The webhook verifies Cashfree's HMAC signature before a booking changes to confirmed.

## Not yet built

- Image upload wiring (multer is installed, not yet connected to a route)
- AI service (separate FastAPI service per the original plan — recommendations, cheapest slot, crowd prediction, chatbot)

## Quick test with curl

```bash
# Request an email verification code
curl -X POST http://localhost:5000/api/register/request-otp \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Owner","email":"owner@test.com","password":"pass123","phone":"9876543210","role":"arena_owner"}'

# Verify the code from the email, then save the returned token
curl -X POST http://localhost:5000/api/register/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@test.com","emailOtp":"123456"}'

# Login (grab the token from the response)
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@test.com","password":"pass123"}'

# Create an arena (use the token)
curl -X POST http://localhost:5000/api/arena \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":"Test Arena","location":{"address":"123 St","city":"Bengaluru"},"sportsAvailable":["cricket"]}'
```
