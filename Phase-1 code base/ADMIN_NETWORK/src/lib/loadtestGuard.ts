// Refuses a load-test process that can reach anything except the local stack.
// Normal servers do not set ROVEYA_LOADTEST, so every check stays inactive.

const PROVIDERS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "BREVO_API_KEY", "BREVO_FROM_EMAIL", "EMAIL_PROVIDER", "SMS_API_KEY", "SMS_PROVIDER", "SMS_SENDER_ID", "SMS_TEMPLATE_ID", "EXPO_ACCESS_TOKEN", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "NOMINATIM_URL"];
const PROJECTS = ["gecz", "pcyk", "pqnfipleuztivnrsyvkd"];

const ALLOWED_HTTP = new Set(["http://127.0.0.1:54321", "http://localhost:54321"]);
const ALLOWED_POSTGRES = new Set(["127.0.0.1:54322", "localhost:54322"]);

function origin(value: string) {
  const parsed = new URL(value);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : "");
  return { parsed, port, origin: `${parsed.protocol}//${parsed.hostname}:${port}` };
}

export function loadtestBlocks(target: string): boolean {
  if (process.env.ROVEYA_LOADTEST !== "1") return false;
  try {
    const parsed = origin(target);
    return !ALLOWED_HTTP.has(parsed.origin);
  } catch {
    return true;
  }
}

export function loadtestIsolationError(env: Record<string, string | undefined>): string | null {
  if (env.ROVEYA_LOADTEST !== "1") return null;
  if ((env.STAGING_DATABASE_URL ?? "").trim() !== "") return "Load-test mode refuses a staging database setting.";
  let api: ReturnType<typeof origin>;
  try {
    api = origin(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    return "Load-test mode requires the local API allowlist.";
  }
  if (api.parsed.protocol !== "http:" || !ALLOWED_HTTP.has(api.origin)) return "Load-test mode refuses this API address.";
  let database: URL;
  try {
    database = new URL(env.DATABASE_URL ?? "");
  } catch {
    return "Load-test mode requires the local database allowlist.";
  }
  const databasePort = database.port || "5432";
  if (!/^postgres(ql)?:$/.test(database.protocol) || !ALLOWED_POSTGRES.has(`${database.hostname}:${databasePort}`)) {
    return "Load-test mode refuses this database address.";
  }
  if (database.username !== "" && database.username !== "postgres") return "Load-test mode refuses this database user.";
  if (database.pathname !== "/postgres" && database.pathname !== "/roveya_loadtest") return "Load-test mode refuses this database name.";
  const haystack = [env.NEXT_PUBLIC_SUPABASE_URL, env.DATABASE_URL, env.SUPABASE_SECRET_KEY].join(" ").toLowerCase();
  if (PROJECTS.some((mark) => haystack.includes(mark))) return "Load-test mode refuses a protected or staging project.";
  if (PROVIDERS.some((name) => (env[name] ?? "").trim() !== "")) return "Load-test mode refuses a live provider setting.";
  if ((env.ROVEYA_ALLOW_AUTOVERIFY ?? "").trim() !== "") return "Load-test mode refuses automatic verification.";
  return null;
}
