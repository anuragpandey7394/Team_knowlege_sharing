import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  commentsSchema,
  commentSchema,
  successSchema,
} from "../../../packages/contracts/src/index";
import { can } from "../../../packages/contracts/src/policy";
import { useAuth, mutate } from "./auth";
import { apiRequest } from "./api";
import {
  Button,
  Panel,
  LoadingState,
  ErrorState,
  EmptyState,
} from "./components";
export function Comments({
  orgId,
  pageId,
  versionNumber,
  archived,
  historical,
  role,
}: {
  orgId: string;
  pageId: string;
  versionNumber: number;
  archived: boolean;
  historical: boolean;
  role: string | undefined;
}) {
  const userId = useAuth().data?.id;
  const [params] = useSearchParams();
  const commentId = params.get("commentId"),
    revisionId = params.get("revisionId");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const base = `/api/v1/organizations/${orgId}/pages/${pageId}/comments`;
  const comments = useQuery({
    queryKey: ["comments", userId, orgId, pageId, offset],
    queryFn: () => apiRequest(`${base}?offset=${offset}`, commentsSchema),
  });
  const reference = useQuery({
    queryKey: [
      "comment-reference",
      userId,
      orgId,
      pageId,
      commentId,
      revisionId,
    ],
    queryFn: () =>
      apiRequest(`${base}/${commentId}/revisions/${revisionId}`, commentSchema),
    enabled: Boolean(commentId && revisionId),
    retry: false,
  });
  const writable = Boolean(
    role && can(role, "comment") && !archived && !historical,
  );
  async function write(
    path: string,
    body: unknown,
    method: "POST" | "PATCH" | "DELETE",
    form?: HTMLFormElement,
  ) {
    setError("");
    setBusy(true);
    try {
      if (method === "DELETE") await mutate(path, body, successSchema, method);
      else await mutate(path, body, commentSchema, method);
      form?.reset();
      setEditing(null);
      await comments.refetch();
      if (commentId && revisionId) await reference.refetch();
    } catch {
      setError(
        "Comment changed or action failed. Your text is preserved. Reload comments and compare before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    void write(base, { text: new FormData(form).get("text") }, "POST", form);
  }
  return (
    <Panel title="Comments">
      <p>
        Comments are attributed advice, separate from authoritative page
        content. They may refer to an older published version.
      </p>
      {(archived || historical) && (
        <p>
          Historical or archived view: comments are read-only. Revisions shown
          below are current unless an exact comment reference is selected.
        </p>
      )}
      {reference.isError && (
        <ErrorState message="Comment reference unavailable." />
      )}
      {reference.data && (
        <section id="comment-reference" aria-label="Exact comment reference">
          <h3>Referenced comment revision {reference.data.revision}</h3>
          <p>
            {reference.data.author} · {reference.data.revisionAt} · Posted on
            page version {reference.data.pageVersionNumber}
          </p>
          <p className="comment-text">
            {reference.data.tombstoned
              ? "Comment unavailable (removed)."
              : reference.data.text}
          </p>
        </section>
      )}
      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            void comments.refetch();
          }}
        />
      )}
      {comments.isPending ? (
        <LoadingState />
      ) : comments.isError ? (
        <ErrorState
          message="Comments unavailable."
          onRetry={() => {
            void comments.refetch();
          }}
        />
      ) : (
        <>
          <ol>
            {comments.data.items.map((c) => (
              <li id={`comment-${c.id}`} key={c.id}>
                <p>
                  {c.author} · Created {c.createdAt} · Edited {c.updatedAt} ·
                  Revision {c.revision}
                </p>
                <p>
                  Posted on page version {c.pageVersionNumber}
                  {c.pageVersionNumber !== versionNumber &&
                    " — may not apply to this version"}
                </p>
                <p className="comment-text">
                  {c.tombstoned ? "Comment unavailable (removed)." : c.text}
                </p>
                <Link
                  to={`/organizations/${orgId}/pages/${pageId}/versions/${c.pageVersionId}?commentId=${c.id}&revisionId=${c.revisionId}#comment-reference`}
                >
                  Permanent comment revision link
                </Link>
                {writable && !c.tombstoned && (
                  <>
                    {c.authorId === userId && (
                      <Button onClick={() => setEditing(c.id)}>
                        Edit my comment
                      </Button>
                    )}
                    {(c.authorId === userId ||
                      (role && can(role, "admin"))) && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void write(
                            `${base}/${c.id}`,
                            { expectedRevision: c.revision },
                            "DELETE",
                          );
                        }}
                      >
                        {c.authorId === userId
                          ? "Delete my comment"
                          : "Moderate comment"}
                      </Button>
                    )}
                    {editing === c.id && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          void write(
                            `${base}/${c.id}`,
                            {
                              text: new FormData(form).get("text"),
                              expectedRevision: c.revision,
                            },
                            "PATCH",
                            form,
                          );
                        }}
                      >
                        <label>
                          Edit comment text
                          <textarea
                            name="text"
                            defaultValue={c.text ?? ""}
                            maxLength={5000}
                            required
                          />
                        </label>
                        <Button disabled={busy}>Save comment revision</Button>
                        <Button type="button" onClick={() => setEditing(null)}>
                          Cancel comment edit
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
          {!comments.data.total && <EmptyState>No comments yet.</EmptyState>}
          <Button
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous comments
          </Button>
          <Button
            disabled={offset + 20 >= comments.data.total}
            onClick={() => setOffset(offset + 20)}
          >
            Next comments
          </Button>
        </>
      )}
      {writable && (
        <form onSubmit={add}>
          <label>
            New comment
            <textarea name="text" required maxLength={5000} />
          </label>
          <p>
            Your comment will refer to the current published version (
            {versionNumber}).
          </p>
          <Button disabled={busy}>Add comment</Button>
        </form>
      )}
      {!writable && !historical && !archived && (
        <p>Your role permits reading comments.</p>
      )}
    </Panel>
  );
}
