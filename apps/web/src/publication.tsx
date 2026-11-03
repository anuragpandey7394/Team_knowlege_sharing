import { IndexStatus } from "./index-status";
import { Comments } from "./comments";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  publishedPageSchema,
  historySchema,
  organizationSummarySchema,
  searchResultSchema,
  spacesSchema,
  treeSchema,
  spaceSchema,
  successSchema,
} from "../../../packages/contracts/src/index";
import { can } from "../../../packages/contracts/src/policy";
import { useAuth, mutate } from "./auth";
import { apiRequest } from "./api";
import { RichText } from "./rich-text";
import {
  Button,
  Panel,
  LoadingState,
  ErrorState,
  EmptyState,
} from "./components";
export function PublishedPage() {
  const { orgId, pageId, versionId } = useParams();
  const userId = useAuth().data?.id;
  const [offset, setOffset] = useState(0);
  const [comparisonId, setComparisonId] = useState("");
  const [error, setError] = useState("");
  const base = `/api/v1/organizations/${orgId}/pages/${pageId}`;
  const page = useQuery({
    queryKey: ["published", userId, orgId, pageId, versionId],
    queryFn: () =>
      apiRequest(
        `${base}${versionId ? `/versions/${versionId}` : ""}`,
        publishedPageSchema,
      ),
    retry: false,
  });
  const org = useQuery({
    queryKey: ["organization", userId, orgId],
    queryFn: () =>
      apiRequest(`/api/v1/organizations/${orgId}`, organizationSummarySchema),
  });
  const history = useQuery({
    queryKey: ["history", userId, orgId, pageId, offset],
    queryFn: () =>
      apiRequest(`${base}/versions?offset=${offset}`, historySchema),
    enabled: page.isSuccess,
  });
  const comparison = useQuery({
    queryKey: ["comparison", userId, orgId, pageId, comparisonId],
    queryFn: () =>
      apiRequest(`${base}/versions/${comparisonId}`, publishedPageSchema),
    enabled: Boolean(comparisonId) && page.isSuccess,
  });
  if (page.isPending) return <LoadingState />;
  if (page.isError)
    return (
      <ErrorState
        message="Published page unavailable. Check the link and your organization membership."
        onRetry={() => {
          void page.refetch();
        }}
      />
    );
  const data = page.data;
  return (
    <>
      <p>
        <Link to={`/organizations/${orgId}/spaces/${data.spaceId}`}>
          Browse space
        </Link>{" "}
        · <Link to={`/organizations/${orgId}/search`}>Search</Link>
      </p>
      <article>
        <h1>{data.title}</h1>
        {data.archived && (
          <p role="status">
            Archived — historical content, excluded from search and new
            retrieval.
          </p>
        )}
        {versionId && <p>Historical version {data.number}</p>}
        {data.changed && (
          <p>
            This page has changed.{" "}
            <Link to={`/organizations/${orgId}/pages/${pageId}`}>
              View current published version
            </Link>
          </p>
        )}
        <p>
          Created by {data.creator} · <time>{data.createdAt}</time>
        </p>
        <p>
          Version {data.number} · Published by {data.publisher} ·{" "}
          <time>{data.publishedAt}</time>
        </p>
        <IndexStatus
          orgId={orgId!}
          sourceId={pageId!}
          canRetry={Boolean(
            org.data &&
            can(org.data.role, "edit") &&
            !data.archived &&
            !data.changed,
          )}
        />
        <RichText document={data.body as JSONContent} />
        <p>
          <Link
            to={`/organizations/${orgId}/pages/${pageId}/versions/${data.versionId}`}
          >
            Permanent link to this version
          </Link>
        </p>
        {org.data && can(org.data.role, "edit") && !data.archived && (
          <p>
            <Link to={`/organizations/${orgId}/pages/${pageId}/edit`}>
              Edit shared draft
            </Link>
          </p>
        )}
      </article>
      {error && <ErrorState message={error} />}
      {org.data && can(org.data.role, "edit") && !data.archived && (
        <Button
          onClick={() => {
            // Fetch a current structural revision; the server checks it again atomically.
            void apiRequest(`${base}/draft`, draftForArchiveSchema)
              .then((draft) =>
                mutate(
                  `${base}/archive`,
                  { expectedRevision: draft.page.revision },
                  successSchema,
                ),
              )
              .then(() =>
                window.location.assign(
                  `/organizations/${orgId}/pages/${pageId}/versions/${data.versionId}`,
                ),
              )
              .catch(() => setError("Archive failed. Reload and retry."));
          }}
        >
          Archive page and descendants
        </Button>
      )}
      <Comments
        key={`${orgId}:${pageId}:${versionId ?? "latest"}`}
        orgId={orgId!}
        pageId={pageId!}
        versionNumber={data.number}
        archived={data.archived}
        historical={Boolean(versionId)}
        role={org.data?.role}
      />
      <Panel title="Version history">
        {history.isPending ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState message="History unavailable." />
        ) : (
          <>
            <ul>
              {history.data.items.map((v) => (
                <li key={v.versionId}>
                  <Link
                    to={`/organizations/${orgId}/pages/${pageId}/versions/${v.versionId}`}
                  >
                    Version {v.number}: {v.title}
                  </Link>{" "}
                  · {v.publisher} · {v.publishedAt}{" "}
                  <Button onClick={() => setComparisonId(v.versionId)}>
                    Compare version {v.number} with displayed version
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous versions
            </Button>
            <Button
              disabled={offset + 20 >= history.data.total}
              onClick={() => setOffset(offset + 20)}
            >
              Next versions
            </Button>
          </>
        )}
        {comparison.isError && <ErrorState message="Comparison unavailable." />}
        {comparison.data && (
          <section aria-label="Plain-text version diff">
            <h3>
              Version {comparison.data.number} → version {data.number}
            </h3>
            {comparison.data.text === data.text &&
            comparison.data.title === data.title ? (
              <p>No text changes.</p>
            ) : (
              <>
                <h4>Removed text</h4>
                <pre>
                  <del>
                    {comparison.data.title}
                    {"\n"}
                    {comparison.data.text}
                  </del>
                </pre>
                <h4>Added text</h4>
                <pre>
                  <ins>
                    {data.title}
                    {"\n"}
                    {data.text}
                  </ins>
                </pre>
              </>
            )}
          </section>
        )}
      </Panel>
    </>
  );
}
const draftForArchiveSchema = z.object({
  page: z.object({ revision: z.number().int() }),
});
export function ManualSearch() {
  const { orgId } = useParams();
  const userId = useAuth().data?.id;
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const spaceId = params.get("spaceId") ?? "";
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const [spaceOffset, setSpaceOffset] = useState(0);
  const spaces = useQuery({
    queryKey: ["search-spaces", userId, orgId, spaceOffset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/spaces?offset=${spaceOffset}`,
        spacesSchema,
      ),
  });
  const search = useQuery({
    queryKey: ["search", userId, orgId, q, spaceId, offset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/search?q=${encodeURIComponent(q)}&offset=${offset}${spaceId ? `&spaceId=${encodeURIComponent(spaceId)}` : ""}`,
        searchResultSchema,
      ),
    enabled: Boolean(q.trim()),
    retry: false,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setParams({
      q: String(data.get("q") ?? ""),
      spaceId: String(data.get("spaceId") ?? ""),
    });
  }
  return (
    <>
      <h1>Search published pages</h1>
      <p>Manual PostgreSQL search. AI retrieval is not connected.</p>
      <p>
        <Link to={`/organizations/${orgId}/knowledge`}>Knowledge spaces</Link>
      </p>
      <form onSubmit={submit}>
        <label>
          Search words
          <input name="q" defaultValue={q} required maxLength={200} />
        </label>
        <label>
          Space
          <select
            name="spaceId"
            defaultValue={spaceId}
            key={`${spaceOffset}:${spaceId}`}
          >
            <option value="">All spaces</option>
            {spaces.data?.items.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={!spaceOffset}
          onClick={() => setSpaceOffset(Math.max(0, spaceOffset - 20))}
        >
          Previous spaces
        </Button>
        <Button
          type="button"
          disabled={!spaces.data || spaceOffset + 20 >= spaces.data.total}
          onClick={() => setSpaceOffset(spaceOffset + 20)}
        >
          More spaces
        </Button>
        <Button>Search</Button>
      </form>
      {q &&
        (search.isPending ? (
          <LoadingState />
        ) : search.isError ? (
          <ErrorState
            message="Search unavailable. Check the space and retry."
            onRetry={() => {
              void search.refetch();
            }}
          />
        ) : (
          <>
            <p>{search.data.total} results</p>
            <ul>
              {search.data.items.map((item) => (
                <li key={item.pageId}>
                  <Link to={`/organizations/${orgId}/pages/${item.pageId}`}>
                    {item.title}
                  </Link>
                  <p>{item.snippet}</p>
                </li>
              ))}
            </ul>
            {!search.data.total && (
              <EmptyState>
                No published pages match. Try different words or another space.
              </EmptyState>
            )}
            <Button
              disabled={!offset}
              onClick={() =>
                setParams({
                  q,
                  spaceId,
                  offset: String(Math.max(0, offset - 20)),
                })
              }
            >
              Previous results
            </Button>
            <Button
              disabled={offset + 20 >= search.data.total}
              onClick={() =>
                setParams({ q, spaceId, offset: String(offset + 20) })
              }
            >
              Next results
            </Button>
          </>
        ))}
    </>
  );
}
export function ArchiveManager({
  orgId,
  space,
  onChanged,
}: {
  orgId: string;
  space: z.infer<typeof spaceSchema> | undefined;
  onChanged: () => Promise<void>;
}) {
  const userId = useAuth().data?.id;
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [spaceOffset, setSpaceOffset] = useState(0);
  const [error, setError] = useState("");
  const spaces = useQuery({
    queryKey: ["archived-spaces", userId, orgId, spaceOffset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/spaces?archived=true&offset=${spaceOffset}`,
        spacesSchema,
      ),
    enabled: open,
  });
  const pages = useQuery({
    queryKey: ["archived-pages", userId, orgId, offset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/archived-pages?offset=${offset}`,
        treeSchema,
      ),
    enabled: open,
  });
  async function action(path: string, body: unknown) {
    setError("");
    try {
      await mutate(
        `/api/v1/organizations/${orgId}/${path}`,
        body,
        successSchema,
      );
      await onChanged();
      await spaces.refetch();
      await pages.refetch();
    } catch {
      setError(
        "Action rejected. Reload; restore the space and parent first, or restore the page at root.",
      );
    }
  }
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Archive and restore</summary>
      {error && <ErrorState message={error} />}
      {space && (
        <Button
          onClick={() => {
            void action(`spaces/${space.id}/archive`, {
              expectedRevision: space.revision,
            });
          }}
        >
          Archive this space
        </Button>
      )}
      <h3>Archived spaces</h3>
      {spaces.data?.items.map((s) => (
        <p key={s.id}>
          {s.name}{" "}
          <Button
            onClick={() => {
              void action(`spaces/${s.id}/restore`, {
                expectedRevision: s.revision,
              });
            }}
          >
            Restore space {s.name}
          </Button>
        </p>
      ))}
      {spaces.isError && <ErrorState message="Archived spaces unavailable." />}
      <Button
        disabled={!spaceOffset}
        onClick={() => setSpaceOffset(Math.max(0, spaceOffset - 20))}
      >
        Previous archived spaces
      </Button>
      <Button
        disabled={!spaces.data || spaceOffset + 20 >= spaces.data.total}
        onClick={() => setSpaceOffset(spaceOffset + 20)}
      >
        Next archived spaces
      </Button>
      <h3>Archived pages</h3>
      <p>
        Restore restores one page. Descendants remain archived until
        individually restored.
      </p>
      {pages.data?.items.map((p) => (
        <p key={p.id}>
          {p.title}{" "}
          <Button
            onClick={() => {
              void action(`pages/${p.id}/restore`, {
                expectedRevision: p.revision,
              });
            }}
          >
            Restore {p.title}
          </Button>{" "}
          <Button
            onClick={() => {
              void action(`pages/${p.id}/restore`, {
                expectedRevision: p.revision,
                parentId: null,
              });
            }}
          >
            Restore {p.title} at root
          </Button>
        </p>
      ))}
      {pages.isError && <ErrorState message="Archived pages unavailable." />}
      <Button
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >
        Previous archived pages
      </Button>
      <Button
        disabled={!pages.data || offset + 20 >= pages.data.total}
        onClick={() => setOffset(offset + 20)}
      >
        Next archived pages
      </Button>
    </details>
  );
}
