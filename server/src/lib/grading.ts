import type { Question, QuestionOption } from "@prisma/client";

export type AnswerPayload = {
  answerText?: string | null;
  selectedOptionIds?: string[];
};

export type GradedAnswer = {
  isCorrect: boolean | null;
  earnedPoints: number;
};

/** Normalises free text for comparison: case, spacing, punctuation, apostrophes. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAnswerText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Accepts several correct variants separated by `|` or `;`. */
export function matchesAcceptedAnswer(given: string, accepted: string): boolean {
  const variants = accepted
    .split(/[|;]/)
    .map((v) => normalizeText(v))
    .filter(Boolean);
  const candidate = normalizeText(given);
  if (!candidate) return false;
  return variants.includes(candidate);
}

export function gradeQuestion(
  question: Question & { options: QuestionOption[] },
  response: AnswerPayload,
): GradedAnswer {
  const points = question.points ?? 1;
  const wrong = (earned = 0): GradedAnswer => ({ isCorrect: false, earnedPoints: earned });

  switch (question.type) {
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE": {
      const correct = question.options.filter((o) => o.isCorrect).map((o) => o.id);
      const given = response.selectedOptionIds ?? [];
      if (given.length !== 1) return wrong();
      return { isCorrect: correct.includes(given[0]), earnedPoints: correct.includes(given[0]) ? points : 0 };
    }

    case "MULTIPLE_SELECT": {
      const correct = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
      const given = new Set(response.selectedOptionIds ?? []);
      if (correct.size === 0 || given.size === 0) return wrong();
      const exact =
        correct.size === given.size && [...correct].every((id) => given.has(id));
      return { isCorrect: exact, earnedPoints: exact ? points : 0 };
    }

    case "FILL_BLANK":
    case "SHORT_ANSWER": {
      if (!question.correctAnswer) {
        // No answer key → needs manual review by the teacher.
        return { isCorrect: null, earnedPoints: 0 };
      }
      const correct = matchesAcceptedAnswer(
        normalizeAnswerText(response.answerText),
        question.correctAnswer,
      );
      return { isCorrect: correct, earnedPoints: correct ? points : 0 };
    }

    case "MATCHING": {
      if (!question.correctAnswer) return { isCorrect: null, earnedPoints: 0 };
      const expected = parsePairs(question.correctAnswer);
      const given = parsePairs(normalizeAnswerText(response.answerText));
      if (!expected.length || expected.length !== given.length) return wrong();
      const key = (pairs: Array<[string, string]>) =>
        pairs.map(([l, r]) => `${normalizeText(l)}=>${normalizeText(r)}`).sort().join("|");
      const exact = key(expected) === key(given);
      return { isCorrect: exact, earnedPoints: exact ? points : 0 };
    }

    default:
      return { isCorrect: null, earnedPoints: 0 };
  }
}

/** Matching pairs are stored as JSON: [{"left":"1","right":"a"}, ...] or "a:b" lines. */
function parsePairs(raw: string): Array<[string, string]> {
  const text = raw.trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as Array<{ left: string; right: string }>;
      return parsed.map((p) => [String(p.left), String(p.right)]);
    } catch {
      return [];
    }
  }
  return text
    .split(/\n|,/)
    .map((line) => line.split(/[=:]/))
    .filter((parts) => parts.length === 2)
    .map((parts) => [parts[0].trim(), parts[1].trim()]);
}

export type AttemptGradingResult = {
  score: number;
  totalPoints: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  pendingCount: number;
  details: Array<{
    questionId: string;
    isCorrect: boolean | null;
    earnedPoints: number;
    answered: boolean;
  }>;
};

export function gradeAttempt(
  questions: Array<Question & { options: QuestionOption[] }>,
  answers: Array<{ questionId: string; answerText: string | null; selectedOptionIds: string[] }>,
): AttemptGradingResult {
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));
  const totalPoints = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let pendingCount = 0;
  const details: AttemptGradingResult["details"] = [];

  for (const question of questions) {
    const answer = answerMap.get(question.id);
    const answered = Boolean(
      answer && ((answer.selectedOptionIds?.length ?? 0) > 0 || (answer.answerText ?? "").trim().length > 0),
    );

    if (!answered) {
      unansweredCount += 1;
      details.push({ questionId: question.id, isCorrect: false, earnedPoints: 0, answered: false });
      continue;
    }

    const graded = gradeQuestion(question, {
      answerText: answer!.answerText,
      selectedOptionIds: answer!.selectedOptionIds,
    });

    score += graded.earnedPoints;
    if (graded.isCorrect === null) pendingCount += 1;
    else if (graded.isCorrect) correctCount += 1;
    else wrongCount += 1;

    details.push({
      questionId: question.id,
      isCorrect: graded.isCorrect,
      earnedPoints: graded.earnedPoints,
      answered: true,
    });
  }

  return {
    score,
    totalPoints,
    percentage: totalPoints > 0 ? Math.round((score / totalPoints) * 1000) / 10 : 0,
    correctCount,
    wrongCount,
    unansweredCount,
    pendingCount,
    details,
  };
}
