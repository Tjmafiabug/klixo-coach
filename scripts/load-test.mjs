// Find the quota cliff: how many concurrent staff before Sheets throttling
// degrades the app, and what the user actually receives when it does.
//
// Measured 2026-09-11 against the E2E Sheet (24 tabs, ~960 sessions, ~7.6k
// attendance rows), one page render = one batchGet = one quota unit:
//
//   users  think   views  wall    p50     p95      >5s   errors
//   9      1500ms  29     9.1s    784ms   1148ms   0     0
//   12     0       38     4.2s    1132ms  2311ms   0     0
//   18     1500ms  57     10.4s   1108ms  1528ms   0     0
//   20     0       64     55.6s   1588ms  20594ms  16    0   <- cliff
//   25     0       80     37.6s   2015ms  17931ms  6     0
//   40     0       127    50.5s   3352ms  23419ms  50    0
//
// The cliff sits between 12 and 20 users with zero think time: 38 views in
// 4.2s, then 64 views in 55.6s. 1.7x the load, 13x the wall clock — the
// signature of a hard rate limit rather than gradual saturation.
//
// Think time is what saves you: 18 users WITH think time run clean at p95
// 1.5s, while 20 WITHOUT hit p95 20.6s. The quota is per-minute, so human
// pauses spread the requests. Nine real staff are far inside the envelope.
//
// The finding is the ERRORS column. Nothing sheds load: withRetry absorbs every
// 429 (295 of them at 40 users) and converts a quota breach into queueing, so
// the user gets a 28-second page rather than a failure. There is no circuit
// breaker — the app degrades silently into looking hung.
//
// Degradation starts around 60 requests/min, which is the documented Sheets
// read quota. Nine concurrent staff with realistic think time is comfortably
// inside it; the cliff needs roughly 3x the whole centre's staff hammering with
// zero pause, which is not a real 6pm.
//
// Models the 6pm rush — every teacher opening the app to mark a register at
// once — rather than a naive parallel hammer. Each virtual user logs in, then
// navigates a few pages with think time between them, the way a person does.
//
// Writes nothing. Reads only, against whatever SHEET_ID the dev server has.
//
//   node scripts/load-test.mjs [--users 9] [--base http://localhost:3000]

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:3000");
const USERS = Number(arg("users", "9"));
const THINK_MS = Number(arg("think", "1500")); // pause between page views

// Seeded staff. A teacher's journey is the realistic one: land on /today, open
// a register, come back. The owner also hits the dashboard.
const STAFF = [
  { teacherId: "T001", name: "Priya Menon", role: "owner" },
  { teacherId: "T002", name: "Rajesh", role: "teacher" },
  { teacherId: "T003", name: "Anjali", role: "teacher" },
  { teacherId: "T004", name: "Vikram Iyer", role: "teacher" },
  { teacherId: "T005", name: "Sneha Reddy", role: "teacher" },
  { teacherId: "T006", name: "Arjun Nair", role: "teacher" },
];

const JOURNEY = {
  owner: ["/today", "/dashboard", "/manage/students", "/today"],
  teacher: ["/today", "/today?date=", "/today"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mint a session cookie directly, the way lib/auth.ts does.
 *
 *  Logging in through the form would mean harvesting a build-hashed server
 *  action id per run. Signing the same JWT the app issues is equivalent for a
 *  read-path load test and keeps the harness about page rendering rather than
 *  about the login flow (which auth.spec.ts already covers).
 */
async function sessionCookie(staff) {
  const { SignJWT } = await import("jose");
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  const token = await new SignJWT({
    teacherId: staff.teacherId,
    studentId: "",
    role: staff.role,
    name: staff.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
  return `klixo_session=${token}`;
}

/** One page view. Returns timing and what the user actually got. */
async function view(path, cookie) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    const body = await res.text();
    const ms = Date.now() - t0;
    // What a user would SEE, not just the status code.
    const outcome =
      res.status >= 500
        ? "error"
        : res.status === 307 || res.status === 302
          ? "redirect"
          : /Application error|something went wrong/i.test(body)
            ? "error-boundary"
            : "ok";
    return { path, ms, status: res.status, outcome, bytes: body.length };
  } catch (e) {
    return { path, ms: Date.now() - t0, status: 0, outcome: "throw", error: String(e).slice(0, 60) };
  }
}

/** One virtual user's session. */
async function user(staff, results) {
  const cookie = await sessionCookie(staff);
  for (const path of JOURNEY[staff.role]) {
    results.push(await view(path, cookie));
    await sleep(THINK_MS);
  }
}

const pct = (xs, p) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

console.log(`base   : ${BASE}`);
console.log(`users  : ${USERS} concurrent, ${THINK_MS}ms think time`);
console.log(`journey: owner ${JOURNEY.owner.length} views, teacher ${JOURNEY.teacher.length} views\n`);

const results = [];
const t0 = Date.now();
await Promise.all(
  Array.from({ length: USERS }, (_, i) => user(STAFF[i % STAFF.length], results)),
);
const wall = Date.now() - t0;

const times = results.map((r) => r.ms);
const byOutcome = results.reduce((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {});

console.log(`wall clock   : ${(wall / 1000).toFixed(1)}s`);
console.log(`page views   : ${results.length}`);
console.log(`outcomes     : ${JSON.stringify(byOutcome)}`);
console.log(`latency  p50 : ${pct(times, 50)}ms`);
console.log(`         p95 : ${pct(times, 95)}ms`);
console.log(`         max : ${Math.max(...times)}ms`);

const slow = results.filter((r) => r.ms > 5000);
if (slow.length) {
  console.log(`\nover 5s (${slow.length}):`);
  slow.slice(0, 8).forEach((r) => console.log(`  ${r.path.padEnd(22)} ${r.ms}ms  ${r.outcome}`));
}
const bad = results.filter((r) => r.outcome !== "ok" && r.outcome !== "redirect");
if (bad.length) {
  console.log(`\nNOT OK (${bad.length}):`);
  bad.slice(0, 8).forEach((r) => console.log(`  ${r.path.padEnd(22)} ${r.status} ${r.outcome} ${r.error ?? ""}`));
}
