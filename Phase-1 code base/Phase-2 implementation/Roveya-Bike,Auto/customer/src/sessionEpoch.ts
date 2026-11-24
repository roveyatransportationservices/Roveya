export type TokenTrio = { accessToken: string; refreshToken: string; expiresAt: number };

// A refresh that began before logout must not write tokens after logout.
// A newer sign-in must not be erased by that late write.
export function createTokenMemory() {
  let era = 0;
  let current: TokenTrio | null = null;

  return {
    era: () => era,
    current: () => current,
    beginSignOut() {
      const refreshToken = current?.refreshToken ?? null;
      const mine = ++era;
      current = null;
      return { refreshToken, mine };
    },
    claimWrite(seenEra: number) {
      if (seenEra !== era) return null;
      return ++era;
    },
    finishWrite(mine: number, next: TokenTrio, storedEra: number | null): "keep" | "clear" | "drop" {
      if (era !== mine) return storedEra === mine ? "clear" : "drop";
      current = next;
      return "keep";
    },
    canHydrate(seenEra: number) {
      return seenEra === era;
    },
    replace(next: TokenTrio | null) {
      current = next;
    },
  };
}

export function confirmLogout(armed: { current: boolean }, arm: (on: boolean) => void, signOut: () => void) {
  if (!armed.current) {
    armed.current = true;
    arm(true);
    return "armed";
  }
  armed.current = false;
  arm(false);
  signOut();
  return "signed-out";
}
