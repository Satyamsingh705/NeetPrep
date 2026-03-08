import Link from "next/link";
import { notFound } from "next/navigation";
import { getTestSeriesGroupById } from "@/lib/data";
import { requireCurrentStudent } from "@/lib/student-auth";
import { partitionTestSeriesDocuments } from "@/lib/test-series";

export default async function TestSeriesGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  await requireCurrentStudent();
  const { groupId } = await params;
  const group = await getTestSeriesGroupById(groupId);

  if (!group) {
    notFound();
  }

  const { series, answerKeys } = partitionTestSeriesDocuments(group.documents);
  const totalRows = Math.max(series.length, answerKeys.length, 1);
  const rows = Array.from({ length: totalRows }, (_, index) => ({
    series: series[index] ?? null,
    answerKey: answerKeys[index] ?? null,
  }));

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-8">
      <section className="panel rounded-[1.5rem] p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b26d39]">Test Series Group</p>
            <h1 className="mt-2 text-4xl font-semibold text-[#2f241c]">{group.title}</h1>
            {group.description ? <p className="mt-3 max-w-3xl text-lg leading-7 text-[#6d5a49]">{group.description}</p> : null}
          </div>
          <Link href="/test-series" className="btn-secondary">
            Back To Groups
          </Link>
        </div>
      </section>

      <section className="panel rounded-[1.4rem] p-6">
        <div className="rounded-[1rem] border border-[#dbc5af] bg-[linear-gradient(180deg,#fffdf9, #fff7ef)] p-4 shadow-[0_18px_50px_rgba(126,88,47,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-2">
            <div>
              <h2 className="text-2xl font-semibold text-[#2f241c]">Group Documents</h2>
              <p className="mt-1 text-sm text-[#65584a]">Open any title in a new tab. Test series and answer keys are aligned side by side in one table.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
              <span className="rounded-full bg-[#fff1df] px-3 py-1 text-[#b85f20]">Series {series.length}</span>
              <span className="rounded-full bg-[#eef7ef] px-3 py-1 text-[#2f7a42]">Answer Keys {answerKeys.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-[0.9rem] border border-[#d7c0a9] bg-white">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[linear-gradient(90deg,#a95e17,#d78232)] text-white">
                  <th className="w-20 border border-[#e3b07d] px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.16em]">No.</th>
                  <th className="border border-[#e3b07d] px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.16em]">Test Series</th>
                  <th className="border border-[#e3b07d] px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.16em]">Answer Key</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`group-row-${index}`} className="align-top odd:bg-[#fffdfa] even:bg-[#fcf6ef]">
                    <td className="border border-[#eadbcd] px-4 py-4 text-center text-sm font-semibold text-[#8a6a52]">{index + 1}</td>
                    <td className="border border-[#eadbcd] p-0 text-sm text-[#5f5246]">
                      {row.series ? (
                        <a
                          href={row.series.filePath}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-full w-full px-4 py-4 font-semibold text-[#2563eb] underline-offset-4 transition hover:bg-[#eef4ff] hover:underline"
                        >
                          {row.series.title}
                        </a>
                      ) : (
                        <div className="px-4 py-4 text-[#b2a394]">No test series PDF</div>
                      )}
                    </td>
                    <td className="border border-[#eadbcd] p-0 text-sm text-[#5f5246]">
                      {row.answerKey ? (
                        <a
                          href={row.answerKey.filePath}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-full w-full px-4 py-4 font-semibold text-[#2563eb] underline-offset-4 transition hover:bg-[#eef4ff] hover:underline"
                        >
                          {row.answerKey.title}
                        </a>
                      ) : (
                        <div className="px-4 py-4 text-[#b2a394]">No answer key PDF</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}