// Render's deploy check. This route loads no ride code, so a free instance can answer while the API stack is still starting.
export function GET() {
  return Response.json({ ok: true });
}
