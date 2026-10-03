import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { isProduction } from "@/lib/env";
import { unauthorized } from "@/lib/api/errors";
import { hashToken, verifySignedCookieValue } from "@/lib/security/tokens";
import { newSessionRecord } from "./session-record";

export const SESSION_COOKIE = "nazm_session";

export async function createSession(userId: string, request?: Request) {
  const session = newSessionRecord(userId, request);
  await prisma.session.create({ data: session.data });
  return session.cookie;
}

export function applySessionCookie(response: Response, session: { value: string; expiresAt: Date }) {
  const nextResponse = response as Response & {
    cookies?: {
      set: (name: string, value: string, options: Record<string, unknown>) => void;
    };
  };

  nextResponse.cookies?.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: session.expiresAt
  });
}

export function clearSessionCookie(response: Response) {
  const nextResponse = response as Response & {
    cookies?: {
      set: (name: string, value: string, options: Record<string, unknown>) => void;
    };
  };

  nextResponse.cookies?.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: 0
  });
}

export async function getSessionToken() {
  const cookieStore = await cookies();
  return verifySignedCookieValue(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser() {
  const token = await getSessionToken();
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw unauthorized();
  }
  return user;
}

export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  locale: unknown;
  timezone: string;
  theme: unknown;
  twoFactorEnabled: boolean;
  roles?: { role: { name: string } }[];
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    timezone: user.timezone,
    theme: user.theme,
    twoFactorEnabled: user.twoFactorEnabled,
    roles: user.roles?.map((item) => item.role.name) ?? []
  };
}

