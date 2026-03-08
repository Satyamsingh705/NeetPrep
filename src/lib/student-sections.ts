import { getTestsForListing } from "@/lib/data";
import { isSubjectInCategory, type AdminSubjectCategory } from "@/lib/subject-categories";

export type ListedTest = Awaited<ReturnType<typeof getTestsForListing>>[number];

export const studentSections = [
  { id: "physics", title: "Physics", category: "PHYSICS", description: "Physics tests and chapter drills." },
  { id: "chemistry", title: "Chemistry", category: "CHEMISTRY", description: "Chemistry tests and topic practice." },
  { id: "biology", title: "Biology", category: "BIOLOGY", description: "Biology tests in one combined section." },
  { id: "major-tests", title: "Major Tests", category: "MAJOR_TEST", description: "Major mock exams and full-paper practice." },
] as const;

export type StudentSectionId = (typeof studentSections)[number]["id"];

function getAssignedSection(test: ListedTest) {
  if (!test.config || typeof test.config !== "object" || Array.isArray(test.config)) {
    return null;
  }

  const assignedSection = (test.config as { assignedSection?: unknown }).assignedSection;

  return typeof assignedSection === "string" ? assignedSection as AdminSubjectCategory : null;
}

export function getSectionChapters(test: ListedTest, category: AdminSubjectCategory) {
  return Array.from(
    new Set(
      test.testQuestions
        .filter((question) => isSubjectInCategory(question.subject, category))
        .map((question) => question.chapter),
    ),
  );
}

export function getSectionTests(tests: ListedTest[], category: AdminSubjectCategory) {
  return tests
    .filter((test) => {
      const assignedSection = getAssignedSection(test);

      return assignedSection ? assignedSection === category : true;
    })
    .map((test) => ({
      ...test,
      sectionChapters: getSectionChapters(test, category),
    }))
    .filter((test) => test.sectionChapters.length > 0);
}

export function getMajorTests(tests: ListedTest[]) {
  return tests
    .filter(
      (test) =>
        test.mode === "NEET_PATTERN"
        || getAssignedSection(test) === "MAJOR_TEST"
        || test.testQuestions.some((question) => isSubjectInCategory(question.subject, "MAJOR_TEST")),
    )
    .map((test) => ({
      ...test,
      sectionChapters: Array.from(
        new Set(
          (test.mode === "NEET_PATTERN"
            ? test.testQuestions
            : test.testQuestions.filter((question) => isSubjectInCategory(question.subject, "MAJOR_TEST")))
            .map((question) => question.chapter),
        ),
      ),
    }));
}

export function getTestsBySection(tests: ListedTest[]) {
  const customTests = tests.filter((test) => test.mode !== "NEET_PATTERN");

  return {
    physics: getSectionTests(customTests, "PHYSICS"),
    chemistry: getSectionTests(customTests, "CHEMISTRY"),
    biology: getSectionTests(customTests, "BIOLOGY"),
    "major-tests": getMajorTests(tests),
  } satisfies Record<StudentSectionId, Array<ListedTest & { sectionChapters: string[] }>>;
}