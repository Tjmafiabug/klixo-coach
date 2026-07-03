// One-off: create the four Tests tabs (Tests, Questions, Attempts, Answers) with
// headers, then seed one published demo test + a sample graded attempt so the
// owner builder, student taker, results and dashboard all have data.
// Idempotent: skips tabs/rows that already exist. Prints a demo student login.
// Run: node --env-file=.env.local scripts/provision-tests.mjs
import { sheets as sheetsApi, auth as googleAuth } from "@googleapis/sheets";

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const authClient = new googleAuth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = sheetsApi({ version: "v4", auth: authClient });
const spreadsheetId = process.env.SHEET_ID;

const HEADERS = {
  Tests: ["test_id", "title", "batch_id", "pass_pct", "negative_marking", "marks_to_cut", "duration_min", "published", "created"],
  Questions: ["question_id", "test_id", "text", "opt_a", "opt_b", "opt_c", "opt_d", "correct", "marks"],
  Attempts: ["attempt_id", "test_id", "student_id", "score", "max_score", "submitted_at"],
  Answers: ["attempt_id", "question_id", "chosen", "correct"],
};

const meta = await sheets.spreadsheets.get({ spreadsheetId });
const existing = new Set(meta.data.sheets.map((s) => s.properties.title));

// --- create missing tabs + write their header row ---
const toAdd = Object.keys(HEADERS).filter((t) => !existing.has(t));
if (toAdd.length) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: toAdd.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  for (const title of toAdd) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS[title]] },
    });
  }
  console.log(`Created tabs: ${toAdd.join(", ")}.`);
} else {
  console.log("All four Tests tabs already exist.");
}

// --- pick a demo student + their active batch ---
const readCol = async (tab) => (await sheets.spreadsheets.values.get({ spreadsheetId, range: tab })).data.values ?? [];
const asObjs = (rows) => {
  const [h, ...body] = rows;
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};
const students = asObjs(await readCol("Students"));
const enrolls = asObjs(await readCol("Enrollments"));
const batches = asObjs(await readCol("Batches"));

const activeEnroll = (sid) => enrolls.find((e) => e.student_id === sid && e.status === "active" && e.end_date === "");
const demo = students.find((s) => s.status === "active" && activeEnroll(s.student_id));
if (!demo) throw new Error("No active student with an active enrollment — cannot seed a demo test.");
const demoBatch = activeEnroll(demo.student_id).batch_id;
const batchName = batches.find((b) => b.batch_id === demoBatch)?.name ?? demoBatch;

// --- seed a demo test only if none exists yet ---
const testsRows = await readCol("Tests");
if (testsRows.length <= 1) {
  const today = new Date().toISOString().slice(0, 10);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Tests",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [["TST0001", `${batchName} — Quick Quiz`, demoBatch, "40", "FALSE", "0", "0", "TRUE", today]],
    },
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Questions",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        ["QST0001", "TST0001", "What is 5 + 7?", "10", "11", "12", "13", "C", "1"],
        ["QST0002", "TST0001", "Which of these is a prime number?", "9", "15", "21", "7", "D", "1"],
        ["QST0003", "TST0001", "What is 6 × 9?", "54", "56", "48", "63", "A", "1"],
      ],
    },
  });

  // a sample graded attempt by a DIFFERENT enrolled student (so results/dashboard
  // show data while the demo login can still take the test fresh)
  const other = students.find(
    (s) => s.student_id !== demo.student_id && activeEnroll(s.student_id)?.batch_id === demoBatch,
  );
  if (other) {
    const ts = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Attempts",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [["ATT0001", "TST0001", other.student_id, "2", "3", ts]] },
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Answers",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          ["ATT0001", "QST0001", "C", "TRUE"],
          ["ATT0001", "QST0002", "A", "FALSE"],
          ["ATT0001", "QST0003", "A", "TRUE"],
        ],
      },
    });
    console.log(`Seeded a sample attempt by ${other.name} (2/3).`);
  }
  console.log(`Seeded published test TST0001 for ${batchName}.`);
} else {
  console.log("Tests already seeded — skipping demo rows.");
}

console.log("\n--- DEMO PORTAL LOGIN ---");
console.log(`Student: ${demo.name} (${demo.student_id}), batch: ${batchName}`);
console.log(`Phone:   ${demo.phone || "(none)"}   Parent: ${demo.parent_phone || "(none)"}   PIN: 1234`);
console.log("Done.");
