import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useBeforeUnload } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import { draftSchema } from "../../../packages/contracts/src/index";
import {
  editorExtensions,
  safeLink,
} from "../../../packages/contracts/src/rich-text";
import { mutate } from "./auth";
import { apiRequest, ApiClientError } from "./api";
import { Button, ErrorState } from "./components";
import { RichText } from "./rich-text";
type Draft = z.infer<typeof draftSchema>;
export function PageEditor({
  orgId,
  initial,
  onSaved,
}: {
  orgId: string;
  initial: Draft;
  onSaved: (draft: Draft) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body as JSONContent);
  const [baseline, setBaseline] = useState(
    JSON.stringify([initial.title, initial.body]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [latest, setLatest] = useState<Draft | null>(null);
  const [link, setLink] = useState("");
  const revision = useRef(initial.revision);
  const saving = useRef(false);
  const dirty = JSON.stringify([title, body]) !== baseline;
  const extensions = useMemo(editorExtensions, []);
  const editor = useEditor({
    extensions,
    content: initial.body as JSONContent,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Page body",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => setBody(editor.getJSON()),
  });
  async function save(expectedRevision = revision.current) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    const snapshot = JSON.stringify([title, body]);
    try {
      const data = await mutate(
        `/api/v1/organizations/${orgId}/pages/${initial.page.id}/draft`,
        { expectedRevision, title, body },
        draftSchema,
        "PATCH",
      );
      revision.current = data.revision;
      setBaseline(snapshot);
      setLatest(null);
      onSaved(data);
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409
          ? "Another editor saved a newer draft. Your edits are kept here. Load the latest draft to compare before saving a merge."
          : "Save failed. Your edits are kept here. Retry when the connection recovers.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!dirty || busy || error) return;
    const timer = window.setTimeout(() => {
      void save();
    }, 800);
    return () => window.clearTimeout(timer);
    // Every captured draft change replaces this debounce; in-flight saves retain their own snapshot.
  }, [title, body, dirty, busy, error]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  if (!editor) return <p role="status">Loading editor…</p>;
  return (
    <section aria-label="Shared draft editor">
      <h1>Edit page</h1>
      <p>
        Created by {initial.creator} ·{" "}
        {new Date(initial.createdAt).toLocaleString()}
      </p>
      <p>
        Last saved: {new Date(initial.updatedAt).toLocaleString()} · Shared
        draft revision {revision.current}
      </p>
      <label>
        Page title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          required
        />
      </label>
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label="Text formatting"
      >
        <Button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          Heading
        </Button>
        <Button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Bold
        </Button>
        <Button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Italic
        </Button>
        <Button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bullet list
        </Button>
        <Button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          Numbered list
        </Button>
        <Button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          Code block
        </Button>
        <Button
          type="button"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
              .run()
          }
        >
          Insert table
        </Button>
        <Button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
        >
          Undo
        </Button>
      </div>
      <label>
        Link address
        <input value={link} onChange={(event) => setLink(event.target.value)} />
      </label>
      <Button
        type="button"
        onClick={() => {
          if (!safeLink(link)) {
            setError("Use a safe http, https, mailto or local link.");
            return;
          }
          setError("");
          editor.chain().focus().setLink({ href: link }).run();
        }}
      >
        Apply link to selection
      </Button>
      <EditorContent editor={editor} />
      <p role="status">
        {busy
          ? "Saving…"
          : error
            ? "Error — edits preserved"
            : dirty
              ? "Unsaved changes"
              : "Saved"}
      </p>
      <Button
        disabled={busy || !dirty}
        onClick={() => {
          void save();
        }}
      >
        Save draft
      </Button>
      {error && (
        <>
          <ErrorState message={error} />
          <Button
            onClick={() => {
              void apiRequest(
                `/api/v1/organizations/${orgId}/pages/${initial.page.id}/draft`,
                draftSchema,
              )
                .then(setLatest)
                .catch(() =>
                  setError(
                    "Unable to load the latest draft. Your edits are kept here.",
                  ),
                );
            }}
          >
            Load latest for comparison
          </Button>
        </>
      )}
      {latest && (
        <aside aria-label="Latest server draft">
          <h2>Latest server draft</h2>
          <h3>{latest.title}</h3>
          <RichText document={latest.body as JSONContent} />
          <p>
            Compare this with your preserved edits above. Edit your draft to
            merge both versions before saving.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void save(latest.revision);
            }}
          >
            Save my merged draft
          </Button>
        </aside>
      )}
      <details>
        <summary>Safe preview</summary>
        <RichText document={body} />
      </details>
      {blocker.state === "blocked" && (
        <div role="alertdialog" aria-label="Unsaved page changes">
          <p>
            Your changes have not been saved. Stay to save them, or leave and
            discard local edits.
          </p>
          <Button onClick={() => blocker.reset()}>Keep editing</Button>
          <Button onClick={() => blocker.proceed()}>
            Leave without saving
          </Button>
        </div>
      )}
    </section>
  );
}
