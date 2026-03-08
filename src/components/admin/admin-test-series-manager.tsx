"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";

type AdminTestSeriesManagerProps = {
  groups: Array<{
    id: string;
    title: string;
    description: string | null;
    orderIndex: number;
    documents: Array<{
      id: string;
      title: string;
      filePath: string;
      createdAtLabel: string;
      orderIndex: number;
      groupId: string | null;
    }>;
  }>;
  ungroupedDocuments: Array<{
    id: string;
    title: string;
    filePath: string;
    createdAtLabel: string;
    orderIndex: number;
    groupId: string | null;
  }>;
};

export function AdminTestSeriesManager({ groups, ungroupedDocuments }: AdminTestSeriesManagerProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [answerKeyTitle, setAnswerKeyTitle] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupOrderIndex, setGroupOrderIndex] = useState(0);
  const [orderIndex, setOrderIndex] = useState(0);
  const [answerKeyOrderIndex, setAnswerKeyOrderIndex] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState<{ id: string; title: string } | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<{ id: string; title: string; documentCount: number } | null>(null);

  const totalDocuments = groups.reduce((sum, group) => sum + group.documents.length, 0) + ungroupedDocuments.length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setMessage("Choose a PDF file first.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("answerKeyTitle", answerKeyTitle);
      formData.set("groupTitle", groupTitle);
      formData.set("groupDescription", groupDescription);
      formData.set("groupOrderIndex", String(groupOrderIndex));
      formData.set("orderIndex", String(orderIndex));
      formData.set("answerKeyOrderIndex", String(answerKeyOrderIndex));
      formData.set("file", file);

      if (answerKeyFile) {
        formData.set("answerKeyFile", answerKeyFile);
      }

      const response = await fetch("/api/test-series", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to upload test series PDF.");
      }

      setMessage(payload.message ?? "Uploaded successfully.");
      setTitle("");
      setAnswerKeyTitle("");
      setGroupTitle("");
      setGroupDescription("");
      setGroupOrderIndex(0);
      setOrderIndex(0);
      setAnswerKeyOrderIndex(0);
      setFile(null);
      setAnswerKeyFile(null);
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to upload test series PDF.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteDocument() {
    if (!pendingDeleteDocument) {
      return;
    }

    setDeletingId(pendingDeleteDocument.id);
    setMessage("");

    try {
      const response = await fetch(`/api/test-series/${pendingDeleteDocument.id}`, { method: "DELETE" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete test series PDF.");
      }

      setMessage(`Deleted: ${pendingDeleteDocument.title}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete test series PDF.");
    } finally {
      setDeletingId(null);
      setPendingDeleteDocument(null);
    }
  }

  async function deleteGroup() {
    if (!pendingDeleteGroup) {
      return;
    }

    setDeletingGroupId(pendingDeleteGroup.id);
    setMessage("");

    try {
      const response = await fetch(`/api/test-series/groups/${pendingDeleteGroup.id}`, { method: "DELETE" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete test series group.");
      }

      setMessage(payload.message ?? `Deleted group: ${pendingDeleteGroup.title}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete test series group.");
    } finally {
      setDeletingGroupId(null);
      setPendingDeleteGroup(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="panel rounded-[1.4rem] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#2f241c]">Uploaded Test Series PDFs</h2>
            <p className="mt-2 text-sm leading-6 text-[#6d5a49]">Students can open grouped or ungrouped PDFs in a new browser tab.</p>
          </div>
          <div className="rounded-full bg-[#f6e4d3] px-3 py-1 text-sm font-semibold text-[#b85f20]">{totalDocuments} PDFs</div>
        </div>

        <div className="mt-5 max-h-[780px] space-y-4 overflow-y-auto pr-2">
          {groups.length > 0 || ungroupedDocuments.length > 0 ? (
            <>
              {groups.map((group) => (
                <div key={group.id} className="rounded-[1rem] border border-[#eadbcd] bg-[#fffdfa] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-[#2f241c]">{group.title}</div>
                      {group.description ? <div className="mt-2 text-sm text-[#6d5a49]">{group.description}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-[#f6e4d3] px-3 py-1 text-xs font-semibold text-[#b85f20]">Group {group.orderIndex}</div>
                      <button
                        type="button"
                        className="btn-danger px-3 py-2 text-xs"
                        disabled={deletingGroupId === group.id}
                        onClick={() => setPendingDeleteGroup({ id: group.id, title: group.title, documentCount: group.documents.length })}
                      >
                        {deletingGroupId === group.id ? "Deleting Group..." : "Delete Group"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {group.documents.map((document) => (
                      <div key={document.id} className="flex items-start justify-between gap-4 rounded-[0.9rem] border border-[#efe3d5] bg-white p-4">
                        <div>
                          <div className="text-base font-semibold text-[#2f241c]">{document.title}</div>
                          <div className="mt-2 text-sm text-[#6d5a49]">Order {document.orderIndex} · Uploaded on {document.createdAtLabel}</div>
                          <a href={document.filePath} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-[#d7671b]">
                            Open PDF in new tab
                          </a>
                        </div>
                        <button
                          type="button"
                          className="btn-danger px-3 py-2 text-xs"
                          disabled={deletingId === document.id}
                          onClick={() => setPendingDeleteDocument({ id: document.id, title: document.title })}
                        >
                          {deletingId === document.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {ungroupedDocuments.length > 0 ? (
                <div className="rounded-[1rem] border border-dashed border-[#d9cfc3] bg-[#fcfbf8] p-4">
                  <div className="text-lg font-semibold text-[#2f241c]">Ungrouped PDFs</div>
                  <div className="mt-4 grid gap-3">
                    {ungroupedDocuments.map((document) => (
                      <div key={document.id} className="flex items-start justify-between gap-4 rounded-[0.9rem] border border-[#efe3d5] bg-white p-4">
                        <div>
                          <div className="text-base font-semibold text-[#2f241c]">{document.title}</div>
                          <div className="mt-2 text-sm text-[#6d5a49]">Order {document.orderIndex} · Uploaded on {document.createdAtLabel}</div>
                          <a href={document.filePath} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-[#d7671b]">
                            Open PDF in new tab
                          </a>
                        </div>
                        <button
                          type="button"
                          className="btn-danger px-3 py-2 text-xs"
                          disabled={deletingId === document.id}
                          onClick={() => setPendingDeleteDocument({ id: document.id, title: document.title })}
                        >
                          {deletingId === document.id ? "Deleting..." : "Delete"}
                        </button>
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

      <section className="panel rounded-[1.4rem] p-6">
        <h2 className="text-2xl font-semibold text-[#2f241c]">Add Test Series</h2>
        <p className="mt-2 text-sm leading-6 text-[#6d5a49]">Upload a test series PDF, optionally add an answer key PDF in the same submission, assign them to a group, and control the ordering students see.</p>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm text-[#6f5d4d]">
            Test Series Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" placeholder="e.g. NEET Test Series 01" required />
          </label>
          <label className="grid gap-2 text-sm text-[#6f5d4d]">
            Answer Key Title
            <input value={answerKeyTitle} onChange={(event) => setAnswerKeyTitle(event.target.value)} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" placeholder="e.g. NEET Test Series 01 Answer Key" />
          </label>
          <label className="grid gap-2 text-sm text-[#6f5d4d]">
            Group Title
            <input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" placeholder="e.g. Physics Full Syllabus" />
          </label>
          <label className="grid gap-2 text-sm text-[#6f5d4d]">
            Group Description
            <textarea value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} rows={3} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" placeholder="Short note shown above PDFs in this group." />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-[#6f5d4d]">
              Group Order
              <input type="number" min={0} value={groupOrderIndex} onChange={(event) => setGroupOrderIndex(Number(event.target.value))} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-[#6f5d4d]">
              Test Series Order
              <input type="number" min={0} value={orderIndex} onChange={(event) => setOrderIndex(Number(event.target.value))} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
            </label>
          </div>
          <label className="grid gap-2 text-sm text-[#6f5d4d]">
            Answer Key Order
            <input type="number" min={0} value={answerKeyOrderIndex} onChange={(event) => setAnswerKeyOrderIndex(Number(event.target.value))} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
          </label>
          <label className="grid gap-2 text-sm text-[#6f5d4d]">
            Test Series PDF
            <input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" required />
          </label>
          <label className="grid gap-2 text-sm text-[#6f5d4d]">
            Answer Key PDF
            <input type="file" accept="application/pdf" onChange={(event) => setAnswerKeyFile(event.target.files?.[0] ?? null)} className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
          </label>
          <button type="submit" className="btn-primary w-full justify-center" disabled={isSubmitting}>
            {isSubmitting ? "Uploading..." : "Upload Test Series"}
          </button>
        </form>
        {message ? <div className="mt-4 text-sm text-[#6d5a49]">{message}</div> : null}
      </section>
      <ConfirmationDialog
        open={pendingDeleteDocument !== null}
        title="Delete Test Series PDF"
        description={pendingDeleteDocument ? `Delete test series PDF "${pendingDeleteDocument.title}"?` : ""}
        confirmLabel="Delete PDF"
        isProcessing={deletingId !== null}
        onCancel={() => setPendingDeleteDocument(null)}
        onConfirm={() => void deleteDocument()}
      />
      <ConfirmationDialog
        open={pendingDeleteGroup !== null}
        title="Delete Test Series Group"
        description={pendingDeleteGroup ? `Delete test series group "${pendingDeleteGroup.title}"? ${pendingDeleteGroup.documentCount} PDF${pendingDeleteGroup.documentCount === 1 ? " will become" : "s will become"} ungrouped.` : ""}
        confirmLabel="Delete Group"
        isProcessing={deletingGroupId !== null}
        onCancel={() => setPendingDeleteGroup(null)}
        onConfirm={() => void deleteGroup()}
      />
    </div>
  );
}