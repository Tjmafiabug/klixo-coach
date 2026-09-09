// Pure authorization predicates. No "use server" here on purpose: this module
// holds sync helpers that actions.ts imports, and a "use server" file may only
// export async functions. Keeping them pure also makes them directly unit-testable.

/** Does `actorTeacherId` own the session assigned to `sessionTeacherId`?
 *
 *  Never compare the two ids raw. `readTab` maps a cleared or short Sheet cell to
 *  "" (sheets.ts), the Sheet is edited by humans by design, and every non-teacher
 *  session carries teacherId "" — so a raw `===` makes a blank assignment owned by
 *  whoever asks, which is how a student could reach a teacher-only action.
 *  Ownership requires both sides to actually be present. */
export function ownsSession(sessionTeacherId: string, actorTeacherId: string): boolean {
  if (!sessionTeacherId || !actorTeacherId) return false;
  return sessionTeacherId === actorTeacherId;
}
