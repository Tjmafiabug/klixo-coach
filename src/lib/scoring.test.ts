import { describe, expect, it } from "vitest";
import { scoreAttempt } from "@/lib/data";
import type { QuestionRow, TestRow } from "@/lib/types";

/**
 * MCQ scoring decides a mark a parent will see and argue about. It is pure, so
 * it is cheap to pin exactly — and it has three traps worth naming:
 *   - a blank answer must never be penalised, only a *wrong* one
 *   - the total floors at 0, so negative marking can't produce a negative mark
 *   - a malformed `correct` cell defaults to "A", which silently marks real
 *     answers wrong rather than erroring (the Sheet is hand-editable)
 */

const q = (id: string, correct: string, marks = "1"): QuestionRow =>
  ({
    question_id: id,
    test_id: "TEST1",
    text: `Q${id}`,
    opt_a: "a",
    opt_b: "b",
    opt_c: "c",
    opt_d: "d",
    correct,
    marks,
  }) as QuestionRow;

const test = (neg: boolean, cut = "1"): Pick<TestRow, "negative_marking" | "marks_to_cut"> => ({
  negative_marking: neg ? "TRUE" : "FALSE",
  marks_to_cut: cut,
});

const answers = (o: Record<string, string>) => new Map(Object.entries(o));

describe("scoreAttempt", () => {
  it("awards marks for a correct answer", () => {
    const r = scoreAttempt(test(false), [q("1", "B")], answers({ "1": "B" }));
    expect(r).toMatchObject({ score: 1, max: 1 });
  });

  it("awards nothing for a wrong answer when negative marking is off", () => {
    const r = scoreAttempt(test(false), [q("1", "B")], answers({ "1": "C" }));
    expect(r).toMatchObject({ score: 0, max: 1 });
  });

  it("deducts marks_to_cut for a wrong answer when negative marking is on", () => {
    const r = scoreAttempt(test(true, "1"), [q("1", "B", "4"), q("2", "A", "4")], answers({ "1": "B", "2": "C" }));
    expect(r.score, "4 correct, 1 deducted").toBe(3);
  });

  it("never penalises a blank answer, even with negative marking on", () => {
    const r = scoreAttempt(test(true, "2"), [q("1", "B"), q("2", "A")], answers({ "1": "B" }));
    expect(r.score, "Q2 unanswered — no deduction").toBe(1);
  });

  it("floors the total at zero", () => {
    // All wrong, heavy negative marking — a student cannot owe marks.
    const r = scoreAttempt(test(true, "5"), [q("1", "A"), q("2", "A")], answers({ "1": "B", "2": "B" }));
    expect(r.score).toBe(0);
  });

  it("sums max from the question marks, not the count", () => {
    const r = scoreAttempt(test(false), [q("1", "A", "3"), q("2", "A", "7")], answers({}));
    expect(r.max).toBe(10);
  });

  it("accepts a lower-case answer", () => {
    const r = scoreAttempt(test(false), [q("1", "B")], answers({ "1": "b" }));
    expect(r.score).toBe(1);
  });

  it("treats an out-of-range answer as blank, not wrong", () => {
    // "Z" isn't an option key. With negative marking on, mis-classifying it as
    // a wrong answer would deduct marks for what is effectively no answer.
    const r = scoreAttempt(test(true, "2"), [q("1", "B")], answers({ "1": "Z" }));
    expect(r.score).toBe(0);
    expect(r.perQuestion[0].chosen).toBe("");
  });

  it("defaults a malformed correct-key to A", () => {
    // Documents existing behaviour: a typo'd `correct` cell doesn't throw, it
    // silently makes "A" the right answer. Worth knowing when a parent disputes
    // a mark — the fix is validation at write time, not here.
    const r = scoreAttempt(test(false), [q("1", "")], answers({ "1": "A" }));
    expect(r.score).toBe(1);
    expect(r.perQuestion[0].correctKey).toBe("A");
  });

  it("scores an empty test as 0/0 rather than dividing by zero downstream", () => {
    const r = scoreAttempt(test(false), [], answers({}));
    expect(r).toMatchObject({ score: 0, max: 0 });
  });

  it("reports per-question detail for the result screen", () => {
    const r = scoreAttempt(test(true, "1"), [q("1", "A", "2"), q("2", "B", "2")], answers({ "1": "A", "2": "C" }));
    expect(r.perQuestion).toMatchObject([
      { question_id: "1", chosen: "A", correctKey: "A", isCorrect: true, awarded: 2 },
      { question_id: "2", chosen: "C", correctKey: "B", isCorrect: false, awarded: -1 },
    ]);
  });
});
