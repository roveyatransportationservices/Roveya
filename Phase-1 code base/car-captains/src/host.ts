// The bike/auto captain app hosts this screen. Logout there returns to its login page.
let leave: (() => void) | null = null;

export function bindHostSignOut(next: (() => void) | null) {
  leave = next;
}

export function leaveHost() {
  if (!leave) return false;
  leave();
  return true;
}
