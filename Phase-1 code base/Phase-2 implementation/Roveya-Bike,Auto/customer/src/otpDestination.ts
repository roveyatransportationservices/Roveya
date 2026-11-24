export function otpDestination(phone: string, email?: string) {
  const address = email?.trim().toLowerCase();
  if (address) return address;
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) return "";
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
