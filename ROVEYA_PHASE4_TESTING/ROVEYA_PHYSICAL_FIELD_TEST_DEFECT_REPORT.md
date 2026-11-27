# ROVEYA Physical Field Test Defect Report

**Branch:** `release/roveya-staging-clean-v1`  
**Investigation / repair date:** 2026-11-27  
**Status:** Conditional founder approval received. Targeted repairs implemented locally. Commit / staging Admin deploy / APK rebuild follow regression gates below.  
**Prior HEAD:** `aca9da35` — *Fix OSM nearby search, live route polylines, and ride ETAs.*

---

## Executive status

| Area | Status | Evidence class |
|------|--------|----------------|
| Matching ring expand 2→4→6→8 | Repaired (local) | Automated `dispatch.test.ts` (12 pass) |
| Staging-only `pickupTooFar` relax | Repaired (local) | Gated by `dayFeeWaived()` = staging Supabase URL + `ROVEYA_SKIP_DAY_FEE=staging` |
| JobScreen GPS heartbeat lifecycle | Repaired (local) | Code review + unit helpers; **physical pending** |
| Marker spin / jump | Repaired (local) | Heading blend + stationary hold; **physical pending** |
| Map follow vs pan/zoom | Repaired (local) | `follow` flag + Recenter; **physical pending** |
| Off-route / reroute | Repaired (local) | Sustained away-from-goal + OSRM cooldown; **physical pending** |
| Captain stats / ratings | Repaired (local) | `captainEarnings` stats + feedback; **staging API pending** |
| Customer history / ratings | Repaired (local) | `passengerHistory` + rating insert-once; **staging API pending** |
| Lounge removal | Repaired (local) | Nav/tab/home/profile links removed; screens left on disk unused |
| Wallet / Razorpay / recharge | Unchanged policy | UI gated; server fail-closed; day-fee waive staging-only |
| Rejection→next offer ≤3s | **Not claimed** | Needs measured staging / physical evidence |
| Fresh APKs | Pending | After commit + Admin deploy + free EAS quota |

---

## Issue catalogue (yesterday’s field defects)

### FT-01 — Far Captain does not get offer after nearby reject
| | |
|--|--|
| **Root cause** | Time-gated radius + production `pickupTooFar` blocked short-trip captains beyond 3 km even inside 8 km ring. |
| **Affected files** | `dispatch.ts`, `cityRides.ts`, `dispatch.test.ts` |
| **Repair** | Immediate ring climb when current ring empty; staging-only `pickupPolicy.stagingRelax` via `dayFeeWaived()` (max still 8 km); production policy unchanged (`pickupTooFar(4,1)===true`). Reject still calls `offerNext` immediately. |
| **Test evidence** | Automated: staging relax + ring expand tests pass. Physical distances 300 m–8 km and reject→next latency: **pending**. |
| **Status** | Code complete. Do not claim ≤3 s without measurement. |

### FT-02 — Customer bike marker frozen after accept
| | |
|--|--|
| **Root cause** | DutyScreen location heartbeat stopped after navigate to Job; JobScreen did not POST `/captain/location`. |
| **Affected files** | `rider/.../JobScreen.tsx`, `geoTrack.ts` |
| **Repair** | JobScreen posts through assigned → pickup → arrived → OTP → on-trip → drop; single interval; no overlapping POSTs; rejects stale/out-of-order client stamps; stops on collect/rate; uses latest smoothed valid fix. Duty heartbeat unchanged. |
| **Test evidence** | Local code path. Physical Customer marker chase: **pending**. |
| **Status** | Code complete. |

### FT-03 — Zoom / drag fights GPS / stops tracking
| | |
|--|--|
| **Root cause** | Camera always re-framed on location updates. |
| **Affected files** | `DutyMap.native.tsx`, `RouteMap.native.tsx` (customer + rider) |
| **Repair** | Manual pan sets `follow=false`; Recenter restores follow; live mode follows captain pin only while `follow`; GPS/API/marker/route continue during manual camera control. |
| **Test evidence** | Code review. Physical pickup + drop navigation: **pending**. |
| **Status** | Code complete. |

### FT-04 — Bike marker spinning / jumping
| | |
|--|--|
| **Root cause** | Raw GPS heading noise while stationary; 0/360 wrap; `tracksViewChanges` churn. |
| **Affected files** | `geoTrack.ts`, `RouteMap.native.tsx` (both apps), JobScreen / LiveTrip |
| **Repair** | Hold position/heading when movement &lt; noise floor; blend heading across wrap; derive heading from movement when GPS heading invalid; no fabricated positions; customer LiveTrip smooths captain samples; fresher `updatedAt` already preferred in `clientSync`. |
| **Test evidence** | Local helpers. Physical Customer + Captain maps: **pending**. |
| **Status** | Code complete. |

### FT-05 — Wrong-direction / no reroute
| | |
|--|--|
| **Root cause** | Server `offRoute` flag unused by clients; no sustained wrong-direction filter; no client OSRM refresh. |
| **Affected files** | `JobScreen.tsx`, `LiveTrip.tsx`, `TripScreen.tsx`, `cityRides.ts` (offRoute exposure) |
| **Repair** | Captain: sustained growth away from goal (≥150 m across moving samples) → banner + `roadRoute` with 25 s cooldown. Customer: syncs when server `offRoute` with 30 s cooldown. No cancel / fare / penalty changes. |
| **Test evidence** | Local logic. Physical wrong-way drive: **pending**. |
| **Status** | Code complete. |

### FT-06 — Captain completed trip count / profile stats incomplete
| | |
|--|--|
| **Root cause** | Live trip card used incomplete count path; earnings API lacked offers/ratings/rates; UI invented 100% acceptance. |
| **Affected files** | `cityRides.ts` (completed count), `phoneDesk.ts` (`captainEarnings`), `route.ts`, rider `store.tsx`, `EarningsScreens.tsx`, `ProfileScreens.tsx` |
| **Repair** | Earnings returns real `stats` + `feedback` + `ratingReceived` from DB (zeros when empty). UI shows "—" when no offer decisions. Rejected offers ≠ cancelled assigned rides. |
| **Test evidence** | Code + mapping. Staging profile after completed ride: **pending**. |
| **Status** | Code complete. |

### FT-07 — Customer trip history / ratings incomplete; fake “4.90”
| | |
|--|--|
| **Root cause** | History omitted captain/rating joins; Profile fabricated 4.90; ratings upsert allowed overwrite. |
| **Affected files** | `passengerHistory`, `saveRating`, customer `store.tsx`, `ProfileScreen.tsx`, `LiveTrip.tsx` |
| **Repair** | History includes captain, duration, cancel reason, rating given/received; Profile uses real captain→rider average or "New"; `saveRating` insert-once (409 on duplicate); only after `completed`; unauthorized party still 404. |
| **Test evidence** | Code. Physical rating + history + Admin consistency: **pending**. |
| **Status** | Code complete. Receipt email / Admin dashboard parity: verify on staging after deploy. |

### FT-08 — Lounge still in navigation
| | |
|--|--|
| **Root cause** | Prior removal never landed on this staging branch. |
| **Difference vs requested removal** | Staging still had Lounge tab, Home “Play & Earn”, Profile coins/rewards routes, Services Lounge/Rewards, Trivia/Game stack screens. |
| **Repair** | Removed Lounge tab + stack Trivia/Game registration; retargeted Home/Profile/Services/Wallet links; left `LoungeScreen.tsx` / `lounge.ts` on disk (no nav access). No DB deletes. |
| **Test evidence** | Source inspection. APK About/Settings will confirm after rebuild. |
| **Status** | Code complete. |

### FT-09 — Wallet / recharge regression
| | |
|--|--|
| **What changed previously** | Staging day-fee waive (`ROVEYA_SKIP_DAY_FEE=staging` + staging Supabase hard gate); client copy that recharge is unavailable; no Razorpay activation. |
| **Confirmations** | Recharge UI off (live Customer/Captain); `wallet/topup` fail-closed until `wallet_topup_enabled` + mode-matched Razorpay keys; balances preserved by not debiting waive path; cash/UPI do not invent wallet earnings; no financial policy change in this repair set. |
| **Status** | Policy preserved. No separate approval sought (none required). |

### FT-10 — Auth / OTP / Admin / duty / booking chain
Preserved from `aca9da35` (Brevo email OTP, accept race, OSM nearby, GeoJSON routes, OSRM ETA). Regression: automated dispatch + prior day-fee/accept tests; full physical matrix **pending** after APK install.

---

## Staging vs production safety

| Control | Mechanism |
|---------|-----------|
| `pickupTooFar` relax | Only when `dayFeeWaived()` true |
| `dayFeeWaived()` | `ROVEYA_SKIP_DAY_FEE===staging` **and** Supabase URL `https://pqnfipleuztivnrsyvkd.supabase.co` |
| Production | Flag omitted or URL mismatch → classic dead-km rule |

---

## Regression testing matrix

| Item | Local automated | Staging / physical |
|------|-----------------|--------------------|
| Matching + staging relax + ring expand | **Pass** (`dispatch.test.ts` 12/12) | Pending distances + latency measure |
| Wallet topup / Razorpay env unit files | Pre-existing ESM runner gaps | Server fail-closed by design |
| Auth OTP / Brevo | Not re-run this session | Pending smoke after Admin deploy |
| Ride booking → match → reject → reassign → accept → arrive → OTP → complete | Code paths preserved/extended | **Physical required** |
| GPS / map / off-route / ratings / profile | Code complete | **Physical required** |
| Concurrent requests / network recovery / app restart | Not newly automated | **Physical required** |

---

## Release sequence (approved after gates)

1. Secrets scan of intended commit set  
2. Commit + push `release/roveya-staging-clean-v1`  
3. Deploy staging Admin (`roveya-staging-admin`); verify commit + `/api/health` + Brevo configured (no secret echo) + CEO login  
4. Set `extra.sourceCommit` + versionCode **2**; free-quota EAS preview APKs for Customer + Captain  
5. Archive prior Desktop APKs; place new APKs; publish checksums / build IDs  

**Stop conditions:** SQL migration, financial policy change, paid EAS, production touch, Phase 4.8, Razorpay enable — none introduced; none required for this set.
