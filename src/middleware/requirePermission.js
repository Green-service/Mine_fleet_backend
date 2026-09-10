/** Blocks a request unless the signed-in actor's role grants `action` on
 * `moduleId` (matching the same permissions matrix the client's Roles &
 * Rights editor writes to `roles.permissions`). Must run after requireAuth.
 * Super Admin always passes, since it's defined as full access everywhere. */
export function requirePermission(moduleId, action) {
  return (req, res, next) => {
    const actor = req.actor;
    if (!actor) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    if (actor.roleSlug === "super-admin") {
      next();
      return;
    }
    const allowed = Boolean(actor.permissions?.[moduleId]?.[action]);
    if (!allowed) {
      res.status(403).json({ error: "Your role does not have permission to do this." });
      return;
    }
    next();
  };
}
