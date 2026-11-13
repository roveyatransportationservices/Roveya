// Every permission a role can have. The founder ticks these when creating a role.
export const PERMISSIONS = {
  "view.dashboard": { group: "See", label: "Dashboard", help: "Money and booking charts on the home page" },
  "view.finance": { group: "See", label: "Fares, profit and payments", help: "Fares & profit, payments, ledger, payouts, wallet balances" },
  "view.bookings": { group: "See", label: "Bookings", help: "Every seat booking and its money split" },
  "view.trips": { group: "See", label: "Trips and live map", help: "Published trips, seat maps, cars on the road" },
  "view.rides": { group: "See", label: "Bike and auto rides", help: "ROVEYA Bike and ROVEYA Auto rides, captains on duty, fare card" },
  "view.captains": { group: "See", label: "Captains and cars", help: "Profiles, documents, cars" },
  "view.travellers": { group: "See", label: "Travellers", help: "Profiles, bookings, emergency contacts" },
  "view.offers": { group: "See", label: "Offers and promo codes", help: "All coupons and their cost" },
  "view.support": { group: "See", label: "Support desk", help: "Tickets, feedback and call notes" },
  "view.safety": { group: "See", label: "Safety and SOS", help: "SOS presses and route alerts" },
  "view.audit": { group: "See", label: "Audit log", help: "Who changed what" },
  "bookings.manage": { group: "Do", label: "Cancel and board bookings", help: "Cancel with a full refund, mark boarded" },
  "trips.manage": { group: "Do", label: "Manage trips", help: "Reprice open seats, start, complete or cancel trips" },
  "rides.manage": { group: "Do", label: "Manage bike and auto rides", help: "Cancel open rides, mark cash collected, change the bike and auto fare card" },
  "captains.review": { group: "Do", label: "Verify captains", help: "Verify or reject documents, approve or reject cars, approve or suspend captains" },
  "captains.edit": { group: "Do", label: "Edit captains and cars", help: "Change captain details, car details, payout cycle" },
  "travellers.edit": { group: "Do", label: "Edit travellers", help: "Change traveller name and email" },
  "money.payouts": { group: "Do", label: "Pay captains", help: "Mark payouts paid with the UTR, or reject them" },
  "money.wallets": { group: "Do", label: "Adjust wallets", help: "Credit or debit ROVEYA Cash and captain wallets" },
  "offers.manage": { group: "Do", label: "Manage offers", help: "Create, edit, switch off and delete promo codes" },
  "support.reply": { group: "Do", label: "Answer support", help: "Reply, add notes, log calls, close tickets" },
  "safety.respond": { group: "Do", label: "Respond to SOS", help: "Acknowledge, resolve or close safety alerts" },
  "calls.make": { group: "Do", label: "Call people", help: "Call captains and travellers from the dashboard" },
  "notify.send": { group: "Do", label: "Send notifications", help: "Push a message to one rider, one Vado, or everyone on a trip" },
  "notify.broadcast": { group: "Do", label: "Send to everyone", help: "Push one message to all riders or all Vado at once" },
  "tasks.assign": { group: "Do", label: "Assign work", help: "Give tasks to team members" },
  "settings.manage": { group: "Do", label: "Platform settings", help: "Commission and seat hold time" },
  "admins.manage": { group: "Do", label: "Team and roles", help: "Add people, create roles, give access" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export type Role = string;

export const can = (permissions: readonly string[] | undefined, permission: Permission) => Boolean(permissions?.includes(permission));
