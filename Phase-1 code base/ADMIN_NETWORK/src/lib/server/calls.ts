// Exotel click-to-call: rings the team member's phone first, then connects the other side.
// Both see only the ROVEYA number. Same Exotel account as the platform website.
function exotel() {
  const sid = process.env.EXOTEL_SID?.trim();
  const key = process.env.EXOTEL_API_KEY?.trim();
  const token = process.env.EXOTEL_API_TOKEN?.trim();
  const callerId = process.env.EXOTEL_CALLER_ID?.trim();
  const host = (process.env.EXOTEL_SUBDOMAIN || "api.exotel.com").trim();
  return sid && key && token && callerId ? { sid, key, token, callerId, host } : null;
}

export const bridgeReady = () => Boolean(exotel());

export async function bridge(from: string, to: string) {
  const config = exotel();
  if (!config) return null;
  const body = new URLSearchParams({ From: `0${from}`, To: `0${to}`, CallerId: config.callerId, TimeLimit: "1800", Record: "true", CallType: "trans" });
  try {
    const response = await fetch(`https://${config.host}/v1/Accounts/${config.sid}/Calls/connect.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${config.key}:${config.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const json = (await response.json().catch(() => ({}))) as { Call?: { Sid?: string } };
    return response.ok ? { ok: true as const, sid: json.Call?.Sid ?? null } : { ok: false as const, sid: null };
  } catch {
    return { ok: false as const, sid: null };
  }
}
