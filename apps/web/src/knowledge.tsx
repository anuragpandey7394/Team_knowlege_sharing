import { ArchiveManager } from "./publication";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  spacesSchema,
  spaceSchema,
  treeSchema,
  pageSummarySchema,
  draftSchema,
  organizationSummarySchema,
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
import { PageEditor } from "./page-editor";
export function KnowledgeRoute() {
  const { orgId, spaceId, pageId } = useParams();
  return orgId ? (
    <Workspace
      key={`${orgId}:${spaceId ?? pageId ?? "root"}`}
      orgId={orgId}
      selectedSpace={spaceId}
      pageId={pageId}
    />
  ) : null;
}
function Workspace({
  orgId,
  selectedSpace,
  pageId,
}: {
  orgId: string;
  selectedSpace: string | undefined;
  pageId: string | undefined;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const userId = auth.data?.id;
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [parent, setParent] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const org = useQuery({
    queryKey: ["organization", userId, orgId],
    queryFn: () =>
      apiRequest(`/api/v1/organizations/${orgId}`, organizationSummarySchema),
  });
  const edit = org.data ? can(org.data.role, "edit") : false;
  const spaces = useQuery({
    queryKey: ["spaces", userId, orgId, offset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/spaces?offset=${offset}`,
        spacesSchema,
      ),
    enabled: org.isSuccess,
  });
  const draft = useQuery({
    queryKey: ["draft", userId, orgId, pageId],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/pages/${pageId}/draft`,
        draftSchema,
      ),
    enabled: Boolean(pageId && edit),
    retry: false,
  });
  const spaceId = draft.data?.page.spaceId ?? selectedSpace;
  const space = useQuery({
    queryKey: ["space", userId, orgId, spaceId],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/spaces/${spaceId}`,
        spaceSchema,
      ),
    enabled: Boolean(spaceId && org.isSuccess),
  });
  async function refresh() {
    await client.invalidateQueries({
      predicate: (query) =>
        query.queryKey.includes(orgId) && query.queryKey[0] !== "draft",
    });
  }
  async function createSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const data = await mutate(
        `/api/v1/organizations/${orgId}/spaces`,
        { name: fields.get("name"), description: fields.get("description") },
        spaceSchema,
      );
      await refresh();
      navigate(`/organizations/${orgId}/spaces/${data.id}`);
    } catch {
      setError("Unable to create space. Check your permissions and retry.");
    } finally {
      setBusy(false);
    }
  }
  async function createPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const title = new FormData(event.currentTarget).get("title");
    try {
      const data = await mutate(
        `/api/v1/organizations/${orgId}/pages`,
        { spaceId, title, parentId: parent?.id ?? null },
        pageSummarySchema,
      );
      await refresh();
      navigate(`/organizations/${orgId}/pages/${data.id}/edit`);
    } catch {
      setError(
        "Unable to create page. Check the parent, depth and your permissions.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function move(parentId: string | null) {
    if (!draft.data) return;
    setError("");
    setBusy(true);
    try {
      await mutate(
        `/api/v1/organizations/${orgId}/pages/${pageId}/move`,
        { parentId, expectedRevision: draft.data.page.revision },
        pageSummarySchema,
      );
      await refresh();
      await draft.refetch();
    } catch {
      setError(
        "Move rejected. Reload the location; check for a cycle, depth limit or stale revision. Your draft edits are preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (org.isPending) return <LoadingState />;
  if (org.isError) return <ErrorState message="Organization unavailable." />;
  return (
    <>
      <p>
        <Link to={`/organizations/${orgId}`}>{org.data.name} settings</Link> ·{" "}
        <Link to="/organizations">All organizations</Link> ·{" "}
        <Link to={`/organizations/${orgId}/search`}>
          Search published pages
        </Link>
      </p>
      <div className="knowledge-layout">
        <aside>
          <Panel title="Spaces">
            {spaces.isPending ? (
              <LoadingState />
            ) : spaces.isError ? (
              <ErrorState message="Unable to load spaces." />
            ) : (
              <>
                <ul>
                  {spaces.data.items.map((item) => (
                    <li key={item.id}>
                      <Link to={`/organizations/${orgId}/spaces/${item.id}`}>
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                {!spaces.data.items.length && (
                  <EmptyState>No spaces yet.</EmptyState>
                )}
                <Button
                  disabled={!offset}
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  Previous spaces
                </Button>
                <Button
                  disabled={offset + 20 >= spaces.data.total}
                  onClick={() => setOffset(offset + 20)}
                >
                  Next spaces
                </Button>
              </>
            )}
          </Panel>
          {edit && (
            <Panel title="Create a space">
              <form
                onSubmit={(event) => {
                  void createSpace(event);
                }}
              >
                <label>
                  Space name
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  Space description
                  <input name="description" maxLength={1000} />
                </label>
                <Button disabled={busy}>Create space</Button>
              </form>
            </Panel>
          )}
          {spaceId && (
            <Panel title="Page tree">
              <TreeBranch
                orgId={orgId}
                spaceId={spaceId}
                userId={userId}
                edit={edit}
                parentId={null}
                depth={1}
                onParent={setParent}
                currentPage={pageId}
                onMove={move}
              />
              {edit && pageId && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void move(null);
                  }}
                >
                  Move current page to space root
                </Button>
              )}
            </Panel>
          )}
        </aside>
        <section>
          {error && <ErrorState message={error} />}
          {edit && (
            <ArchiveManager
              orgId={orgId}
              space={space.data}
              onChanged={refresh}
            />
          )}
          {space.data && (
            <>
              <h2>{space.data.name}</h2>
              <p>{space.data.description}</p>
              {edit && (
                <details>
                  <summary>Edit space</summary>
                  <form
                    key={`${spaceId}:${space.data.revision}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const values = new FormData(event.currentTarget);
                      void mutate(
                        `/api/v1/organizations/${orgId}/spaces/${spaceId}`,
                        {
                          name: values.get("name"),
                          description: values.get("description"),
                          expectedRevision: space.data.revision,
                        },
                        spaceSchema,
                        "PATCH",
                      )
                        .then(refresh)
                        .catch(() =>
                          setError(
                            "Space changed or update failed. Refresh and retry.",
                          ),
                        );
                    }}
                  >
                    <label>
                      Rename space
                      <input
                        name="name"
                        defaultValue={space.data.name}
                        maxLength={100}
                        required
                      />
                    </label>
                    <label>
                      Update space description
                      <input
                        name="description"
                        defaultValue={space.data.description}
                        maxLength={1000}
                      />
                    </label>
                    <Button>Update space</Button>
                  </form>
                </details>
              )}
            </>
          )}
          {edit && spaceId && (
            <Panel title="Create a page">
              <p>Parent: {parent?.title ?? "Space root"}</p>
              {parent && (
                <Button onClick={() => setParent(null)}>
                  Create at root instead
                </Button>
              )}
              <form
                onSubmit={(event) => {
                  void createPage(event);
                }}
              >
                <label>
                  New page title
                  <input name="title" maxLength={200} required />
                </label>
                <Button disabled={busy}>Create page</Button>
              </form>
            </Panel>
          )}
          {pageId &&
            (draft.isError || !edit ? (
              <ErrorState message="Draft unavailable or you do not have editing access." />
            ) : draft.isPending ? (
              <LoadingState />
            ) : (
              <PageEditor
                key={pageId}
                orgId={orgId}
                initial={draft.data}
                onSaved={(data) => {
                  client.setQueryData(["draft", userId, orgId, pageId], data);
                  void refresh();
                }}
              />
            ))}
          {!spaceId && !pageId && (
            <>
              <h1>Knowledge spaces</h1>
              <EmptyState>Choose a space to browse its pages.</EmptyState>
            </>
          )}
        </section>
      </div>
    </>
  );
}
function TreeBranch({
  orgId,
  spaceId,
  userId,
  edit,
  parentId,
  depth,
  onParent,
  currentPage,
  onMove,
}: {
  orgId: string;
  spaceId: string;
  userId: string | undefined;
  edit: boolean;
  parentId: string | null;
  depth: number;
  onParent: (parent: { id: string; title: string }) => void;
  currentPage: string | undefined;
  onMove: (id: string | null) => Promise<void>;
}) {
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string[]>([]);
  const tree = useQuery({
    queryKey: ["tree", userId, orgId, spaceId, parentId, offset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/spaces/${spaceId}/tree?offset=${offset}${parentId ? `&parentId=${parentId}` : ""}`,
        treeSchema,
      ),
  });
  if (tree.isPending) return <LoadingState />;
  if (tree.isError)
    return <ErrorState message="Unable to load this page branch." />;
  return (
    <>
      <ul>
        {tree.data.items.map((node) => (
          <li key={node.id}>
            <Link
              to={`/organizations/${orgId}/pages/${node.id}${edit ? "/edit" : ""}`}
            >
              {node.title}
            </Link>
            {!node.published && <span> (Draft)</span>}
            {depth < 10 && (
              <Button
                onClick={() =>
                  setExpanded((value) =>
                    value.includes(node.id)
                      ? value.filter((id) => id !== node.id)
                      : [...value, node.id],
                  )
                }
              >
                Browse children of {node.title}
              </Button>
            )}
            {edit && (
              <>
                <Button
                  onClick={() => onParent({ id: node.id, title: node.title })}
                >
                  New child of {node.title}
                </Button>
                {currentPage && currentPage !== node.id && (
                  <Button
                    onClick={() => {
                      void onMove(node.id);
                    }}
                  >
                    Move current page under {node.title}
                  </Button>
                )}
              </>
            )}
            {expanded.includes(node.id) && (
              <TreeBranch
                orgId={orgId}
                spaceId={spaceId}
                userId={userId}
                edit={edit}
                parentId={node.id}
                depth={depth + 1}
                onParent={onParent}
                currentPage={currentPage}
                onMove={onMove}
              />
            )}
          </li>
        ))}
      </ul>
      {!tree.data.items.length && (
        <EmptyState>No visible pages in this branch.</EmptyState>
      )}
      <Button
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >
        Previous pages
      </Button>
      <Button
        disabled={offset + 20 >= tree.data.total}
        onClick={() => setOffset(offset + 20)}
      >
        Next pages
      </Button>
    </>
  );
}
