import { z } from "zod";

export const levelEnum = z.enum([
  "BEGINNER",
  "ELEMENTARY",
  "PRE_INTERMEDIATE",
  "INTERMEDIATE",
  "UPPER_INTERMEDIATE",
  "ADVANCED",
]);

export const skillEnum = z.enum(["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING"]);

export const questionTypeEnum = z.enum([
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "MULTIPLE_SELECT",
  "FILL_BLANK",
  "MATCHING",
  "SHORT_ANSWER",
]);

export const optionSchema = z.object({
  text: z.string().trim().min(1, "Option cannot be empty").max(600),
  isCorrect: z.boolean().default(false),
});

export const questionSchema = z
  .object({
    type: questionTypeEnum,
    text: z.string().trim().min(1, "Question text is required").max(2000),
    topic: z.string().trim().max(80).optional(),
    explanation: z.string().trim().max(1500).optional(),
    correctAnswer: z.string().max(4000).optional(),
    points: z.coerce.number().int().min(1).max(100).default(1),
    options: z.array(optionSchema).max(8).default([]),
  })
  .superRefine((q, ctx) => {
    const correctOptions = q.options.filter((o) => o.isCorrect).length;

    switch (q.type) {
      case "MULTIPLE_CHOICE": {
        if (q.options.length < 2) {
          ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least 2 options." });
        }
        if (correctOptions !== 1) {
          ctx.addIssue({ code: "custom", path: ["options"], message: "Mark exactly one correct answer." });
        }
        break;
      }
      case "MULTIPLE_SELECT": {
        if (q.options.length < 2) {
          ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least 2 options." });
        }
        if (correctOptions < 1) {
          ctx.addIssue({ code: "custom", path: ["options"], message: "Mark at least one correct answer." });
        }
        break;
      }
      case "TRUE_FALSE": {
        const derived =
          q.correctAnswer ?? q.options.find((o) => o.isCorrect)?.text ?? "";
        if (!/^(true|false|to'g'ri|noto'g'ri|ha|yo'q)/i.test(derived.trim())) {
          ctx.addIssue({
            code: "custom",
            path: ["correctAnswer"],
            message: "Set the correct answer to True or False.",
          });
        }
        break;
      }
      case "FILL_BLANK": {
        if (!q.correctAnswer?.trim()) {
          ctx.addIssue({ code: "custom", path: ["correctAnswer"], message: "Provide the correct answer." });
        }
        break;
      }
      case "MATCHING": {
        if (!q.correctAnswer?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["correctAnswer"],
            message: 'Provide pairs, e.g. [{"left":"go","right":"bormoq"}].',
          });
        }
        break;
      }
      case "SHORT_ANSWER":
        break;
    }
  });

export const createTestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  topic: z.string().trim().max(80).optional(),
  skill: skillEnum.optional(),
  difficulty: levelEnum.optional(),
  timeLimitSeconds: z.coerce.number().int().min(30).max(14400).optional(),
  passingScore: z.coerce.number().int().min(0).max(100).optional(),
  instructions: z.string().trim().max(2000).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  questions: z.array(questionSchema).min(1, "Add at least one question").max(100),
});

export const updateTestSchema = createTestSchema.partial().extend({
  questions: z.array(questionSchema).min(1).max(100).optional(),
});

export const assignSchema = z
  .object({
    groupIds: z.array(z.string().min(1)).min(1, "Select at least one group").max(20),
    startAt: z.coerce.date(),
    deadlineAt: z.coerce.date(),
    durationSeconds: z.coerce.number().int().min(30).max(14400).optional(),
    maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
  })
  .refine((v) => v.deadlineAt > v.startAt, {
    message: "The deadline must be after the start time.",
    path: ["deadlineAt"],
  });

export const saveAnswerSchema = z.object({
  questionId: z.string().min(1),
  answerText: z.string().max(4000).nullish(),
  selectedOptionIds: z.array(z.string()).max(10).default([]),
});

export const attemptEventSchema = z.object({
  type: z.enum(["TAB_BLUR", "PAGE_REFRESH", "VISIBILITY"]),
});
