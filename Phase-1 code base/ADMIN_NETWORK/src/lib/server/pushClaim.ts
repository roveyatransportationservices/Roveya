export function canClaimPushToken(existingUserId: string | null, callerId: string) {
  return !existingUserId || existingUserId === callerId;
}
