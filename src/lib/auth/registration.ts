type Env = Record<string, string | undefined>;

/** How sign-up works on this server right now: with an invite code, for anyone, or not at all (the administrator creates accounts). */
export type RegistrationMode = "invite" | "open" | "closed";

/**
 * The server's sign-up mode, read on the server so a page can describe sign-up the way the API will treat it. Only the
 * mode goes to the browser, never the invite code. Mirrors requireInvite in the register route exactly:
 * - "invite": a non-blank REGISTRATION_INVITE_CODE is set (the code decides, whatever else is set);
 * - "closed": production, no code, and REGISTRATION_OPEN is not exactly "true" (a forgotten variable must not open sign-up);
 * - "open": everything else (no code and either not production or REGISTRATION_OPEN=true).
 */
export function registrationMode(env: Env = process.env): RegistrationMode {
  if (env.REGISTRATION_INVITE_CODE?.trim()) return "invite";
  if (env.NODE_ENV === "production" && env.REGISTRATION_OPEN !== "true") return "closed";
  return "open";
}

/**
 * Whether sign-up needs an invite code right now (the invite-only trial). Read on the server so the page can label the
 * field as required; only the yes/no goes to the browser, never the code.
 */
export function inviteCodeRequired(env: Env = process.env) {
  return registrationMode(env) === "invite";
}
