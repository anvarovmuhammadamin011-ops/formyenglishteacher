import ExcelJS from "exceljs";
import { createRequire } from "node:module";
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";

type PdfKitDoc = {
  on(event: "data", cb: (chunk: Buffer) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  end(): void;
};

type PrinterCtor = new (
  fonts: TFontDictionary,
  virtualfs?: unknown,
  urlResolver?: unknown,
  localAccessPolicy?: (path: string) => boolean,
) => {
  createPdfKitDocument(def: TDocumentDefinitions): Promise<PdfKitDoc>;
};

// @types/pdfmake only describes the browser build; wire the Node printer the
// same way pdfmake's own base.js does.
const nodeRequire = createRequire(__filename);
const pickDefault = <T>(mod: T | { default?: T }): T =>
  mod && typeof mod === "object" && "default" in mod && mod.default ? mod.default : (mod as T);

const PdfPrinter = pickDefault(nodeRequire("pdfmake/js/Printer.js")) as PrinterCtor;
const UrlResolver = pickDefault(nodeRequire("pdfmake/js/URLResolver.js")) as new (fs: unknown) => unknown;
// virtual-fs.js exports a shared singleton instance (not the class).
const sharedVfs = pickDefault(nodeRequire("pdfmake/js/virtual-fs.js")) as unknown;

function createPrinter(fonts: TFontDictionary) {
  return new PdfPrinter(fonts, sharedVfs, new UrlResolver(sharedVfs));
}

const FONT_REGULAR = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

const FONTS: TFontDictionary = {
  Helvetica: { normal: FONT_REGULAR, bold: FONT_BOLD, bolditalics: FONT_BOLD, italics: FONT_REGULAR },
};

function setAttachmentHeaders(res: { setHeader: (k: string, v: string) => void }, filename: string) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

// ───────────────────────── students workbook ─────────────────────────

export async function studentsWorkbook(
  res: { setHeader: (k: string, v: string) => void },
): Promise<Buffer> {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", deletedAt: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      studentProfile: { select: { level: true } },
      streak: { select: { currentStreak: true, longestStreak: true } },
      groupMemberships: { include: { group: { select: { name: true } } }, take: 1 },
    },
  });

  const finished = await prisma.testAttempt.groupBy({
    by: ["userId"],
    where: { userId: { in: students.map((s) => s.id) }, status: { in: ["SUBMITTED", "TIME_UP"] } },
    _avg: { percentage: true },
    _count: { _all: true },
  });
  const stats = new Map(finished.map((r) => [r.userId, r]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ELMS";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Students");

  sheet.columns = [
    { header: "Username", key: "username", width: 22 },
    { header: "First name", key: "firstName", width: 18 },
    { header: "Last name", key: "lastName", width: 18 },
    { header: "Group", key: "group", width: 16 },
    { header: "Level", key: "level", width: 18 },
    { header: "Status", key: "status", width: 12 },
    { header: "Streak", key: "streak", width: 10 },
    { header: "Tests", key: "tests", width: 8 },
    { header: "Avg score %", key: "average", width: 12 },
    { header: "Last login", key: "lastLogin", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };

  for (const s of students) {
    const st = stats.get(s.id);
    sheet.addRow({
      username: s.username,
      firstName: s.firstName,
      lastName: s.lastName,
      group: s.groupMemberships[0]?.group.name ?? "",
      level: s.studentProfile?.level ?? "",
      status: s.status,
      streak: s.streak?.currentStreak ?? 0,
      tests: st?._count._all ?? 0,
      average: st ? Math.round((st._avg.percentage ?? 0) * 10) / 10 : "",
      lastLogin: s.lastLoginAt ? new Date(s.lastLoginAt).toISOString().slice(0, 16).replace("T", " ") : "",
    });
  }

  setAttachmentHeaders(res, "elms-students.xlsx");
  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

// ───────────────────────── test results workbook ─────────────────────────

export async function testResultsWorkbook(
  res: { setHeader: (k: string, v: string) => void },
  testId: string,
): Promise<Buffer> {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: { assignments: { include: { group: { select: { name: true } } } } },
  });
  if (!test) throw ApiError.notFound("Test not found.");

  const attempts = await prisma.testAttempt.findMany({
    where: { testId, status: { in: ["SUBMITTED", "TIME_UP"] } },
    orderBy: { submittedAt: "desc" },
    include: {
      user: { select: { firstName: true, lastName: true, username: true } },
      assignment: { include: { group: { select: { name: true } } } },
    },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Results");
  sheet.columns = [
    { header: "Student", key: "student", width: 26 },
    { header: "Username", key: "username", width: 20 },
    { header: "Group", key: "group", width: 14 },
    { header: "Score", key: "score", width: 10 },
    { header: "Max", key: "max", width: 8 },
    { header: "%", key: "percentage", width: 8 },
    { header: "Passed", key: "passed", width: 8 },
    { header: "Duration (s)", key: "duration", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Submitted", key: "submitted", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const a of attempts) {
    sheet.addRow({
      student: `${a.user.firstName} ${a.user.lastName}`,
      username: a.user.username,
      group: a.assignment?.group.name ?? "",
      score: a.score,
      max: a.totalPoints,
      percentage: a.percentage,
      passed: a.percentage >= test.passingScore ? "YES" : "NO",
      duration: a.durationSeconds ?? "",
      status: a.status,
      submitted: a.submittedAt ? new Date(a.submittedAt).toISOString().slice(0, 16).replace("T", " ") : "",
    });
  }

  const safe = test.title.replace(/[^\w\d-]+/g, "-").slice(0, 40);
  setAttachmentHeaders(res, `elms-results-${safe}.xlsx`);
  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

// ───────────────────────── attempt report PDF ─────────────────────────

export async function attemptReportPdf(
  res: { setHeader: (k: string, v: string) => void },
  attemptId: string,
  viewer: { id: string; role: "TEACHER" | "STUDENT" },
): Promise<Buffer> {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { firstName: true, lastName: true, username: true } },
      test: { select: { title: true, skill: true, difficulty: true, passingScore: true } },
      answers: true,
    },
  });
  if (!attempt) throw ApiError.notFound("Attempt not found.");
  if (viewer.role === "STUDENT" && attempt.userId !== viewer.id) {
    throw ApiError.forbidden();
  }

  const questions = await prisma.question.findMany({
    where: { testId: attempt.testId },
    orderBy: { order: "asc" },
    include: { options: true },
  });
  const answerByQ = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const rows: Array<[string, string, string, string]> = questions.map((q, i) => {
    const answer = answerByQ.get(q.id);
    let given = "—";
    if (answer && answer.selectedOptionIds.length) {
      const chosen = q.options.filter((o) => answer.selectedOptionIds.includes(o.id));
      given = chosen.map((o) => o.text).join(", ") || "—";
    } else if (answer?.answerText) {
      given = answer.answerText;
    }
    let correctMark = "✗";
    if (answer?.isCorrect === true) correctMark = "✓";
    else if (answer?.isCorrect === null && answer.answerText) correctMark = "?";
    else if (!answer) correctMark = "—";
    return [String(i + 1), q.text.slice(0, 90), given.slice(0, 60), correctMark];
  });

  const passed = attempt.percentage >= attempt.test.passingScore;
  const doc: TDocumentDefinitions = {
    defaultStyle: { font: FONT_REGULAR, fontSize: 10 },
    content: [
      { text: "ELMS — Test Result Report", style: "header" },
      { text: attempt.test.title, fontSize: 14, bold: true, margin: [0, 8, 0, 2] },
      {
        columns: [
          {
            stack: [
              `Student: ${attempt.user.firstName} ${attempt.user.lastName} (${attempt.user.username})`,
              `Skill: ${attempt.test.skill} • Level: ${attempt.test.difficulty}`,
            ],
          },
          {
            width: 160,
            stack: [
              `Date: ${attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString("en-GB") : "—"}`,
              `Status: ${attempt.status}`,
            ],
          },
        ],
        margin: [0, 6, 0, 6],
      },
      {
        table: {
          widths: [80, "*", 60, "*"],
          body: [
            [
              { text: "Score", bold: true },
              { text: `${attempt.score} / ${attempt.totalPoints}` },
              { text: "Result", bold: true },
              { text: `${attempt.percentage}% — ${passed ? "PASSED" : "NOT PASSED"} (pass ${attempt.test.passingScore}%)`, color: passed ? "#0a7d32" : "#c0392b" },
            ],
            [
              { text: "Correct", bold: true },
              { text: String(attempt.answers.filter((a) => a.isCorrect === true).length) },
              { text: "Duration", bold: true },
              { text: attempt.durationSeconds ? `${Math.round(attempt.durationSeconds / 60)} min` : "—" },
            ],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 4, 0, 10],
      },
      { text: "Question review", bold: true, margin: [0, 6, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: [24, "*", 140, 24],
          body: [
            [
              { text: "#", bold: true },
              { text: "Question", bold: true },
              { text: "Your answer", bold: true },
              { text: "", bold: true },
            ],
            ...rows.map((r) => r.map((cell) => ({ text: cell }))),
          ],
        },
        layout: "lightHorizontalLines",
      },
      { text: `Generated ${new Date().toISOString().slice(0, 10)} • ELMS`, fontSize: 8, color: "#888888", margin: [0, 12, 0, 0] },
    ],
    styles: {
      header: { fontSize: 16, bold: true, color: "#1f3a93" },
    },
  };

  const printer = createPrinter(FONTS);
  const pdf = await printer.createPdfKitDocument(doc);
  const chunks: Buffer[] = [];
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.end();
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="elms-report-${attemptId.slice(-8)}.pdf"`);
  return buffer;
}
