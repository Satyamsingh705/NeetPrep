import Link from "next/link";
import { getTestSeriesGroupsWithDocuments, getUngroupedTestSeriesDocuments } from "@/lib/data";
import { requireCurrentStudent } from "@/lib/student-auth";

export default async function TestSeriesPage() {
  await requireCurrentStudent();
  const [groups, documents] = await Promise.all([getTestSeriesGroupsWithDocuments(), getUngroupedTestSeriesDocuments()]);
  const totalDocuments = groups.reduce((sum, group) => sum + group.documents.length, 0) + documents.length;

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-8">
      <section className="panel rounded-[1.5rem] p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b26d39]">Student Section</p>
            <h1 className="mt-2 text-4xl font-semibold text-[#2f241c]">Test Series</h1>
            <p className="mt-3 max-w-3xl text-lg leading-7 text-[#6d5a49]">Open any uploaded test series PDF in a new tab and review it separately.</p>
          </div>
          <Link href="/" className="btn-secondary">
            Back To Sections
          </Link>
        </div>
      </section>

      <section className="panel rounded-[1.4rem] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[#2f241c]">Available PDFs</h2>
            <p className="mt-1 text-sm text-[#65584a]">Each PDF opens in a new tab, grouped by series when configured by admin.</p>
          </div>
          <div className="rounded-full bg-[#f6e4d3] px-3 py-1 text-sm font-semibold text-[#b85f20]">{totalDocuments} PDFs</div>
        </div>

        <div className="mt-5 space-y-5">
          {groups.length > 0 || documents.length > 0 ? (
            <>
              {groups.map((group) => (
                <div key={group.id} className="rounded-[1rem] border border-[#eadbcd] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-[#2f241c]">{group.title}</h3>
                      {group.description ? <p className="mt-2 text-sm leading-6 text-[#65584a]">{group.description}</p> : null}
                    </div>
                    <div className="rounded-full bg-[#f6e4d3] px-3 py-1 text-xs font-semibold text-[#b85f20]">{group.documents.length} PDFs</div>
                  </div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {group.documents.map((document) => (
                      <div key={document.id} className="rounded-[0.9rem] border border-[#eadbcd] bg-[#fffdfa] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-lg font-semibold text-[#2f241c]">{document.title}</h4>
                            <p className="mt-2 text-sm leading-6 text-[#65584a]">Series PDF ordered by admin.</p>
                          </div>
                          <div className="rounded-full bg-[#f6e4d3] px-3 py-1 text-xs font-semibold text-[#b85f20]">PDF</div>
                        </div>
                        <div className="mt-5 flex gap-3">
                          <a href={document.filePath} target="_blank" rel="noreferrer" className="btn-primary">
                            Open PDF
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {documents.length > 0 ? (
                <div className="rounded-[1rem] border border-dashed border-[#d9cfc3] bg-[#fcfbf8] p-5">
                  <h3 className="text-xl font-semibold text-[#2f241c]">More PDFs</h3>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {documents.map((document) => (
                      <div key={document.id} className="rounded-[0.9rem] border border-[#eadbcd] bg-white p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-lg font-semibold text-[#2f241c]">{document.title}</h4>
                            <p className="mt-2 text-sm leading-6 text-[#65584a]">Uploaded test series PDF.</p>
                          </div>
                          <div className="rounded-full bg-[#f6e4d3] px-3 py-1 text-xs font-semibold text-[#b85f20]">PDF</div>
                        </div>
                        <div className="mt-5 flex gap-3">
                          <a href={document.filePath} target="_blank" rel="noreferrer" className="btn-primary">
                            Open PDF
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-[1rem] border border-dashed border-[#d9cfc3] bg-[#fcfbf8] p-5 text-sm text-[#736455]">
              No test series PDFs uploaded yet.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}