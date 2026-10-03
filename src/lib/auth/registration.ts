/**
 * Whether sign-up needs an invite code right now (the invite-only trial). Read on the server so the page can label the
 * field as required; only the yes/no goes to the browser, never the code. Mirrors requireInvite in the register route.
 */
export function inviteCodeRequired(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.REGISTRATION_INVITE_CODE?.trim());
}
