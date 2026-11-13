# ROVEYA deployment

The application is a Next.js server. Production hosting is Fly.io. The database and staff login are Supabase. Online payments are Razorpay.

Do not put secret keys in the repository, in `NEXT_PUBLIC_` variables, or in the browser.

## Environment variables

| Name | Where it is used | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Links and the vehicle QR | Public |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Staff login in the browser session | Public |
| `SUPABASE_SECRET_KEY` | Server-side database access | Secret |
| `RAZORPAY_KEY_ID` | Sent to Razorpay Checkout from the server response | Public key id |
| `RAZORPAY_KEY_SECRET` | Orders and signature checks | Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature checks | Secret |

Development uses Razorpay **test** keys (`rzp_test_...`). Production uses Razorpay **live** keys (`rzp_live_...`). Do not mix them.

If your Supabase dashboard still labels the keys `anon` and `service_role`, paste the anon key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the service role key into `SUPABASE_SECRET_KEY`.

## Supabase

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/migrations/20261003190000_phase2_init.sql`.
3. For a development project, run `supabase/seed.sql`. Replace the placeholder fares before real passengers use `/pay`.
4. In Authentication, enable email login and create the CEO user.
5. Copy that user's id from Authentication → Users and insert an `admin_users` row with role `CEO`. Add further rows with role `ADMIN` for other staff. No other role is accepted.
6. Row Level Security is enabled. The anon key can read active destinations only. Passengers cannot read customers, rides, or payments, and they cannot mark a payment paid. The Next.js server uses the secret key after it validates each request.
7. Confirm Authentication → URL configuration includes your Fly.io domain for staff login redirects if you later add hosted auth redirects. The current desk signs in with email and password through the app.

The CEO can change destinations, fares, and contact settings. Admin and CEO can review rides, confirm cash, and publish testimonials. Every one of those actions is checked on the server and written to `audit_logs`. Changing a destination fare does not rewrite older rides.

## Razorpay

1. Create a Razorpay account and stay in Test Mode while developing.
2. In Account & Settings → API Keys, generate a test key id and key secret.
3. In Account & Settings → Webhooks, add:

   `https://YOUR_DOMAIN/api/payments/razorpay/webhook`

4. Subscribe to `payment.captured`, `payment.failed`, `order.paid`, and `refund.processed`.
5. Set a webhook secret and store it as `RAZORPAY_WEBHOOK_SECRET`.
6. Enable payment auto-capture if Razorpay offers it. The app only marks a ride paid after the payment is captured and the amount matches the stored fare. The browser cannot set that status.
7. When you go live, create a separate live webhook on the production domain and replace the three Razorpay variables with live values.

The Razorpay key secret never leaves the server. Checkout receives only the key id and the order id.

## Fly.io

Build command used by the Dockerfile: `npm run build`

Start command: `node server.js` (Next.js standalone server)

Health check: `GET /api/health`

From the project directory, after [installing the Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and signing in:

```bash
fly apps create roveya
fly secrets set \
  SUPABASE_SECRET_KEY=your_secret_key \
  RAZORPAY_KEY_ID=rzp_live_your_key_id \
  RAZORPAY_KEY_SECRET=your_live_key_secret \
  RAZORPAY_WEBHOOK_SECRET=your_live_webhook_secret
fly deploy \
  --build-arg NEXT_PUBLIC_SITE_URL=https://your-app.fly.dev \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

The public Supabase values are inlined when Next.js builds. Pass them as build args. Keep the secret key and Razorpay secrets in `fly secrets` only.

Change `app` in `fly.toml` if `roveya` is already taken. `primary_region` is `bom` (Mumbai). Change it if you want a different region.

This repository does not deploy itself and does not contain real credentials.

## Mobile platform (passenger and captain apps)

The same Next.js server is the API gateway for both apps, at `/api/v1`. Supabase holds the data, signs the sessions, and streams live ride updates.

### 1. Database

In the Supabase SQL editor, run these after the earlier migrations, in order:

1. `supabase/migrations/20261021100000_mobile_platform.sql`. This adds riders, captains, presence, trips, offers, the wallet ledger, payments, payouts, ad services, the event log, analytics, row level security, and realtime.
2. Enable **pg_cron** in Database → Extensions, then run `supabase/migrations/20261021100100_mobile_cron.sql`. This runs matching and the analytics and billing consumers every minute.

If pg_cron is not available, schedule `POST /api/v1/internal/tick` every minute with the header `x-cron-secret: <CRON_SECRET>`, for example from a Render cron job.

3. Enable **pg_net** in Database → Extensions, then run `supabase/migrations/20261021120000_operations.sql`. This adds push notifications, fare quotes and coupons, document review, passenger holds, the support desk, and fares the desk can edit.

### 2. Server environment

| Name | Purpose | Exposure |
| --- | --- | --- |
| `PLATFORM_SECRET` | Signs ad tokens and checkout links, and peppers sign-in codes. Use 32 or more random characters. | Secret |
| `MOBILE_OTP_MODE` | `demo` accepts code 1234. `sms` sends a real code through Twilio. Set `sms` before launch. | Server |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | Required when `MOBILE_OTP_MODE=sms` | Secret |
| `CRON_SECRET` | Protects `/api/v1/internal/tick` | Secret |
| `MOBILE_WEB_ORIGINS` | Comma-separated origins allowed to call the API from a browser, for example the Expo web preview | Server |
| `ADMIN_WEB_ORIGINS` | The admin desk's origin, for example `https://desk.roveya.in` | Server |
| `GOOGLE_MAPS_API_KEY` | Server key for Routes, Places, and Geocoding. Restrict it to those three APIs and to the server's IP. | Secret |
| `GOOGLE_ROUTES_TRAFFIC` | `1` uses live traffic for ETAs (Google bills this at the higher Routes rate) | Server |
| `OSRM_URL` | ROVEYA's own OSRM server, used when Google is not set or fails | Server |
| `NOMINATIM_URL` | Optional self-hosted Nominatim for search without Google | Server |

Fares, commission, bonuses, match radius, the ride request timer, and how long a fare quote holds are all edited from the admin desk under **Fares and rules**. They live in `platform_settings`.

To send push with Expo's enhanced security, store the Expo access token as `expo_access_token` in `platform_settings`. The database sends ride, offer, payout, document, and support notifications on its own through pg_net.

### 3. Razorpay

No new webhook is needed. `/api/payments/razorpay/webhook` also settles wallet top-ups, online ride payments, and ad credit. The apps open `/m/checkout` in an in-app browser, and the server confirms every payment with Razorpay before it adds money.

### 4. The apps

Create `mobile/customer/.env` and `mobile/rider/.env`:

```bash
EXPO_PUBLIC_API_URL=https://your-domain
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Without `EXPO_PUBLIC_API_URL`, the apps run on their on-device demo data. Rebuild the APKs with EAS after you set these values.

For store builds, set the same three values plus `GOOGLE_MAPS_ANDROID_KEY` (an Android-restricted Maps SDK key) as EAS environment variables for the `production` environment, then run `eas build --profile production`. Push needs Firebase Cloud Messaging credentials uploaded in EAS (Credentials → Android → FCM V1) and an Apple push key for iOS. Push and background location work in EAS builds, not in Expo Go.

### 5. The desk

The admin desk (`roveya-admin`) has a **Ride platform** section for every desk action: live board, captain review with document photos, passengers, city rides with cancel, refund, and cash confirmation, captain payouts, the support desk, coupons, fares and rules, notifications, ads, and the audit log. It calls `/api/v1/admin/*` with the signed-in staff member's Supabase session. Set `NEXT_PUBLIC_API_URL` in the desk to the website's address and add the desk's origin to `ADMIN_WEB_ORIGINS` on the website.

Refunds, wallet adjustments, coupons, fares, payouts, group notifications, and the audit log need the CEO role. Every desk change is written to `audit_logs`.
