import { handler } from "@/lib/platform/gateway";
import { signOut } from "@/lib/platform/session";

export const POST = handler(async (request) => signOut(request));
