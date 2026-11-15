type Field = string | number | boolean;

// One JSON line for operations. Field names that could carry a secret are dropped.
export function observe(event: string, fields: Record<string, Field> = {}) {
  const line: Record<string, Field> = { event };
  for (const [key, value] of Object.entries(fields)) {
    if (/otp|password|secret|token|phone|authorization|key/i.test(key)) continue;
    line[key] = value;
  }
  console.info(JSON.stringify(line));
}
