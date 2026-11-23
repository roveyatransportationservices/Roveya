# Render staging automation

Date: 23 Nov 2026. The Blueprint is committed locally and was not applied. No Render service was created, no production service was changed, and no database command was run.

## 1. Blueprint validation

File: `render.staging.yaml` at the clean-release root. Production `render.yaml` was not edited. It is not in the clean commit. The copy on disk in the clean worktree is an untracked leftover and was left untouched.

`render blueprints validate` (Render CLI 2.36.0) against the [Blueprint spec](https://render.com/docs/blueprint-spec):

| Pass | Result |
| --- | --- |
| First | Failed only because `staticPublishPath` rejects the comma in `Roveya-Bike,Auto`. |
| Second | The comma-free publish paths are accepted. The two paid web services return `need_payment_info`. Static sites have no compute plan and did not raise that error. |

`need_payment_info` is the connected workspace, not a field error. The workspace has no payment method, so Render will not create a `0.5c-512mb` service until one is added. No secret value is in the file. A scan found no production project ref, production admin host, live Razorpay key, JWT, or database URL.

## 2. Four service configurations

Every service sets `repo` to `https://github.com/roveyatransportationservices/Roveya`, `branch` to `release/roveya-staging-clean-v1`, and `autoDeployTrigger: off`. There is no preview generation and no pre-deploy command, so this file cannot run migrations.

| Service | Runtime | Root | Build | Start or publish | Plan |
| --- | --- | --- | --- | --- | --- |
| `roveya-staging-admin` | Node web | `Phase-1 code base/ADMIN_NETWORK` | `npm ci && npm run build` | `npm start`. Health `/api/v1/health`. Node `22`. `ROVEYA_TRUSTED_PROXY_HOPS=1`. Region `singapore`. | `0.5c-512mb` |
| `roveya-staging-website` | Node web | `Phase-1 code base/RoveyaOfficialWebsite` | `npm ci && npm run build` | `npm start`. Node `22`. Region `singapore`. | `0.5c-512mb` |
| `roveya-staging-customer` | Static | `Phase-1 code base` | customer `npm ci` and `npx expo export --platform web` | `staging-customer-web` | none |
| `roveya-staging-captain` | Static | `Phase-1 code base` | rider `npm ci` and `npx expo export --platform web` | `staging-captain-web` | none |

The requested static root was `Phase-1 code base/Phase-2 implementation`. Render does not expose files outside a service root at build time. The customer pool screen imports `users-app`, and `CarGate.tsx` imports `car-captains`. Both of those directories are beside `Phase-2 implementation`, so the static root is their parent, `Phase-1 code base`. The rider build is still the captain app. `CarGate.tsx` is unchanged.

`expo export` still writes `Roveya-Bike,Auto/customer/dist` and `Roveya-Bike,Auto/rider/dist`. The build then copies those files to `staging-customer-web` and `staging-captain-web`. The Render schema rejects a comma in `staticPublishPath`, which is why the publish directory is the copy.

Admin health is `GET /api/v1/health` in `src/app/api/v1/[[...path]]/route.ts`. `package.json` in both Node apps has `build` = `next build` and `start` = `next start`. Both phone apps have a `package-lock.json`, so `npm ci` is valid.

## 3. Environment variables that need founder input

Public values are in the file. Secrets use `sync: false`, which makes the Dashboard prompt on first create. Nothing secret is hardcoded. Render does not allow `sync: false` inside an environment group, so the prompts are on the services.

Enter these when the Dashboard asks. Use staging values only.

| Service | Prompt | What to enter |
| --- | --- | --- |
| Admin | `SUPABASE_SECRET_KEY` | Staging service role for `pqnfipleuztivnrsyvkd` |
| Admin | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Staging mail credentials |
| Admin | `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_TEMPLATE_ID` | Staging SMS credentials. Provider is already `2factor`. |
| Admin | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay **test** key and a new test webhook secret |
| Customer and captain | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Staging anon key, not the service role |

Already set, and not prompted:

- `NEXT_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_URL` = `https://pqnfipleuztivnrsyvkd.supabase.co`
- `NEXT_PUBLIC_API_URL`, `EXPO_PUBLIC_API_URL`, and `EXPO_PUBLIC_ADMIN_URL` reference `roveya-staging-admin` `RENDER_EXTERNAL_URL`
- `NEXT_PUBLIC_WEBSITE_URL`, `NEXT_PUBLIC_PLATFORM_URL`, and `NEXT_PUBLIC_SITE_URL` reference `roveya-staging-website` `RENDER_EXTERNAL_URL`

Those references are hostnames Render assigns when it creates the services. The file does not guess an `onrender.com` name. `RENDER_EXTERNAL_URL` includes `https://`. The apps strip a trailing slash. Confirm after the first build that the website and phone bundles call the staging admin host. If a first build ran before that value was present, rebuild that service manually. `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` are baked in at build time.

`GOOGLE_MAPS_ANDROID_KEY` is omitted. The web export does not need it. Add it later in the Dashboard for a native build. Exotel variables are omitted, so staging does not place calls. Do not paste production keys into these prompts.

The production webhook stays where it is. After the staging admin URL exists, add a separate Razorpay **test** webhook for `https://<staging-admin-host>/api/razorpay/webhook`.

## 4. Render account access

The Render CLI on this machine is logged in as Roveya (`roveyatransportationservices@gmail.com`). This session did not create, update, or list services.

## 5. Steps to create the four services

Do these only after approving this file. They were not run.

1. Add a payment method to the Roveya Render workspace. The paid plans cannot be created without it. Do not change any existing service while doing that.
2. From `C:\Users\Dell\Desktop\roveya-staging-clean-v1`, push only this branch: `git push origin release/roveya-staging-clean-v1`
3. In the Dashboard choose **New > Blueprint**. Select `roveyatransportationservices/Roveya`.
4. Set the Blueprint branch to `release/roveya-staging-clean-v1`. This file is not on `main`. Render reads the Blueprint from the branch you select here.
5. Set **Blueprint Path** to `render.staging.yaml`. The default path is `render.yaml`. Leave that default for production.
6. Do not open the existing production Blueprint and do not change its file path.
7. Read the four new names. Enter the prompted staging secrets. Check that every Razorpay key is a test key.
8. Click **Deploy Blueprint** only if that review is right. That click creates the services. `autoDeployTrigger: off` does not skip this first build. Later commits will not deploy until someone deploys manually.
9. Open `GET /api/v1/health` on the new admin URL. Confirm the deploy is this staging commit, not `main`.
10. Add the new Razorpay test webhook. Do not edit the production webhook.
11. Leave `notice_triggers_noop.sql` unapplied until this staging admin is the running build.

## 6. Estimated cost

Prices from the Render pricing page on 23 Nov 2026:

| Item | Estimate |
| --- | --- |
| Admin `0.5c-512mb` | $7 / month |
| Website `0.5c-512mb` | $7 / month |
| Two static sites | $0 compute |
| **Compute total** | **$14 / month** |

Outbound bandwidth is shared by the workspace. Hobby includes 5 GB, then $0.15 per GB. These paid services do not draw the 750 free instance hours. A free web service was not used: it sleeps after 15 minutes without traffic, which stops the admin offer timer, and it shares those 750 hours with the existing free production services.

## 7. Production isolation

- Service names are `roveya-staging-*`. Production names in the old Blueprint are `roveya-website`, `roveya-admin`, `roveya-riders`, and `roveya-captains`.
- `render.yaml` was not modified.
- Each service branch is `release/roveya-staging-clean-v1`. The spec uses that branch instead of the repository default. `main` is not selected.
- Automatic deploys are off. Pull-request previews are left unset, which disables them.
- The only Supabase URL in the file is `https://pqnfipleuztivnrsyvkd.supabase.co`.
- No database, no migration command, and no production webhook change.
- Exotel and Google Maps keys are absent, so this file cannot point staging at those production credentials.
- Staging is not linked from production, and no customer announcement is part of this file.

## 8. Ready for approval

The Blueprint is ready to review. It is not ready to apply until a payment method is added and this commit is pushed. Applying it is the Deploy Blueprint click in section 5. That click was not made.

Proposed push, not run, from `C:\Users\Dell\Desktop\roveya-staging-clean-v1`:

```powershell
git push origin release/roveya-staging-clean-v1
```
