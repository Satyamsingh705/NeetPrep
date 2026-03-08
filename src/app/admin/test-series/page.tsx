import { AdminTestSeriesManager } from "@/components/admin/admin-test-series-manager";
import { requireCurrentAdmin } from "@/lib/admin-auth";
import { getTestSeriesGroupsWithDocuments, getUngroupedTestSeriesDocuments } from "@/lib/data";

function formatDateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export default async function AdminTestSeriesPage() {
  await requireCurrentAdmin();
  const [groups, documents] = await Promise.all([getTestSeriesGroupsWithDocuments(), getUngroupedTestSeriesDocuments()]);

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-8">
      <section className="panel rounded-[1.4rem] p-7">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b26d39]">Test Series</p>
        <h1 className="mt-3 text-4xl font-semibold text-[#2f241c]">Upload PDF test series for students.</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-[#65584a]">Use this page to upload PDF-based test series. Students will see grouped PDFs in the Test Series section and can open each one in a new tab.</p>
      </section>
      <AdminTestSeriesManager
        groups={groups.map((group) => ({
          id: group.id,
          title: group.title,
          description: group.description,
          orderIndex: group.orderIndex,
          documents: group.documents.map((document) => ({
            id: document.id,
            title: document.title,
            filePath: document.filePath,
            createdAtLabel: formatDateLabel(document.createdAt),
            orderIndex: document.orderIndex,
            groupId: document.groupId,
          })),
        }))}
        ungroupedDocuments={documents.map((document) => ({
          id: document.id,
          title: document.title,
          filePath: document.filePath,
          createdAtLabel: formatDateLabel(document.createdAt),
          orderIndex: document.orderIndex,
          groupId: document.groupId,
        }))}
      />
    </main>
  );
}