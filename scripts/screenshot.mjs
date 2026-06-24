// Generate the manual's screenshots from a running dev server (read-only — never
// submits a form, so the Sheet is not mutated). Regenerate with:
//   npm i -D playwright && npx playwright install chromium
//   PORT=3100 npm run dev -- -p 3100 &   # wait for ready
//   node scripts/screenshot.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "docs/screenshots";
const OWNER = { phone: "9876500001", pin: "1234" };
const TEACHER = { phone: "9876500002", pin: "1234" };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  return ctx.newPage();
}

async function login(page, { phone, pin }) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#phone", phone);
  await page.fill("#pin", pin);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function shot(page, path, name) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForSelector("main, body", { timeout: 30000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`✓ ${name}  (${path})`);
  } catch (e) {
    console.log(`✗ ${name}  (${path})  — ${e.message.split("\n")[0]}`);
  }
}

async function firstHref(page, listPath, re) {
  await page.goto(`${BASE}${listPath}`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("a", { timeout: 30000 });
  const hrefs = await page.$$eval("a", (as) => as.map((a) => a.getAttribute("href")));
  return hrefs.find((h) => h && re.test(h)) ?? null;
}

// ---- public ----
{
  const page = await newPage();
  await shot(page, "/login", "login");
}

// ---- owner ----
{
  const page = await newPage();
  await login(page, OWNER);
  await shot(page, "/dashboard", "owner-dashboard");
  await shot(page, "/today", "owner-today");
  await shot(page, "/new-session", "new-session");
  await shot(page, "/timetable", "timetable");
  const slot = await firstHref(page, "/timetable", /^\/timetable\/TT/);
  if (slot) await shot(page, slot, "timetable-edit");
  await shot(page, "/timetable/new", "timetable-new");

  await shot(page, "/manage", "manage-hub");

  await shot(page, "/manage/students", "students-list");
  const stu = await firstHref(page, "/manage/students", /^\/manage\/students\/S/);
  if (stu) await shot(page, stu, "student-profile");
  await shot(page, "/manage/students/new", "student-new");

  await shot(page, "/manage/batches", "batches-list");
  const batch = await firstHref(page, "/manage/batches", /^\/manage\/batches\/B/);
  if (batch) await shot(page, batch, "batch-detail");
  await shot(page, "/manage/batches/new", "batch-new");

  await shot(page, "/manage/teachers", "teachers-list");
  const teachers = await (async () => {
    await page.goto(`${BASE}/manage/teachers`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("a");
    const hrefs = await page.$$eval("a", (as) => as.map((a) => a.getAttribute("href")));
    return hrefs.filter((h) => h && /^\/manage\/teachers\/T/.test(h));
  })();
  const teach = teachers.find((h) => !h.endsWith("/T001")) ?? teachers[0];
  if (teach) await shot(page, teach, "teacher-edit");
  await shot(page, "/manage/teachers/new", "teacher-new");

  await shot(page, "/manage/rooms", "rooms-list");
  const room = await firstHref(page, "/manage/rooms", /^\/manage\/rooms\/R/);
  if (room) await shot(page, room, "room-edit");

  await shot(page, "/manage/holidays", "holidays");
  await shot(page, "/manage/settings", "settings");

  // a marking screen (read-only capture — not submitted)
  const sess = await firstHref(page, "/today", /^\/mark\//);
  if (sess) await shot(page, sess, "mark-roster");
}

// ---- teacher ----
{
  const page = await newPage();
  await login(page, TEACHER);
  await shot(page, "/today", "teacher-today");
  const sess = await firstHref(page, "/today", /^\/mark\//);
  if (sess) await shot(page, sess, "teacher-mark");
}

await browser.close();
console.log("done.");
