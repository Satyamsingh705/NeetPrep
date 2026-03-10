import type { QuestionTable } from "@/lib/types";

type QuestionContentProps = {
  prompt: string | null;
  table?: QuestionTable | null;
  promptClassName?: string;
  tableClassName?: string;
};

export function QuestionContent({ prompt, table, promptClassName, tableClassName }: QuestionContentProps) {
  return (
    <>
      {prompt ? <div className={promptClassName}>{prompt}</div> : null}
      {table ? (
        <div className={tableClassName}>
          {table.caption ? <div className="mb-3 text-sm font-semibold text-[#5d4d40]">{table.caption}</div> : null}
          <div className="flex justify-center overflow-x-auto rounded-[0.9rem] border border-[#ddd0c3] bg-white">
            <table className="mx-auto min-w-full border-collapse text-left text-sm text-[#2d241d] sm:min-w-0">
              {table.headers && table.headers.length > 0 ? (
                <thead className="bg-[#0d14ff] text-white">
                  <tr>
                    {table.headers.map((header, index) => (
                      <th key={`header-${index}`} className="border border-[#98a1ff] px-4 py-3 text-center text-base font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`} className="bg-[#ffffff] even:bg-[#fbf8f3]">
                    {row.map((cell, cellIndex) => (
                      <td key={`cell-${rowIndex}-${cellIndex}`} className="border border-[#ddd0c3] px-4 py-3 align-top whitespace-pre-line">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}