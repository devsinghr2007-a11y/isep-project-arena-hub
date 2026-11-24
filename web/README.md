# ArenaHub web application

This is the supplied Stadium After Dark frontend, now embedded alongside the original ArenaHub application. It includes its own Express API and MongoDB collections, so run this app rather than the legacy `frontend` and `backend` pair when using the new interface.

## Set up

Copy `.env.example` to `.env`, then set at least:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=arenaHubWeb
JWT_SECRET=replace-with-a-long-random-secret
GMAIL_USER=your-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your-google-app-password
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

Use a separate `MONGODB_DB` such as `arenaHubWeb` so this application does not mix its collections with the legacy app.

## Gmail verification codes

ArenaHub emails each six-digit sign-up code using the Gmail account configured in `.env`. In Gmail, enable **2-Step Verification**, create an **App Password** at [Google App Passwords](https://myaccount.google.com/apppasswords), and paste the 16-character app password into `GMAIL_APP_PASSWORD`. Never use or share your normal Gmail password. Restart the app after changing `.env`.

## Run

```powershell
cd C:\Users\Devi Singh\Downloads\arenahub\web
pnpm.cmd dev
```

Open the localhost address printed by the command. For production, run `pnpm.cmd build` then `pnpm.cmd start`.

## Razorpay checkout sessions

Customer checkout creates a server-side payment session that lasts 15 minutes. It holds the selected court slot and decrements selected rental-equipment stock while Razorpay Checkout is open. The signature is verified server-side before the session becomes paid and the slot becomes booked. Expired sessions restore the slot and rental stock automatically the next time a payment session is created or verified.

Only place test-mode Razorpay credentials in `.env`; never expose `RAZORPAY_KEY_SECRET` in the browser.
