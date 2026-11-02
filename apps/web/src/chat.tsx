import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  conversationsSchema,
  conversationSchema,
  messagesSchema,
  spacesSchema,
  successSchema,
  answerEventSchema,
} from "../../../packages/contracts/src/index";
import { useAuth, mutate } from "./auth";
import { apiRequest } from "./api";
import {
  Button,
  Panel,
  ErrorState,
  LoadingState,
  EmptyState,
} from "./components";
export function ChatRoute() {
  const { orgId, conversationId } = useParams();
  return orgId ? (
    <Chat
      key={`${orgId}:${conversationId ?? "new"}`}
      orgId={orgId}
      conversationId={conversationId}
    />
  ) : null;
}
function Chat({
  orgId,
  conversationId,
}: {
  orgId: string;
  conversationId: string | undefined;
}) {
  const userId = useAuth().data?.id;
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0),
    [messageOffset, setMessageOffset] = useState(0),
    [spaceOffset, setSpaceOffset] = useState(0);
  const [error, setError] = useState(""),
    [live, setLive] = useState(""),
    [busy, setBusy] = useState(false),
    [question, setQuestion] = useState("");
  const [accepted, setAccepted] = useState(false);
  const controller = useRef<AbortController | null>(null),
    activeRequest = useRef<string | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const base = `/api/v1/organizations/${orgId}/conversations`;
  const list = useQuery({
    queryKey: ["conversations", userId, orgId, offset],
    queryFn: () => apiRequest(`${base}?offset=${offset}`, conversationsSchema),
  });
  const spaces = useQuery({
    queryKey: ["chat-spaces", userId, orgId, spaceOffset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/spaces?offset=${spaceOffset}`,
        spacesSchema,
      ),
  });
  const conversation = useQuery({
    queryKey: ["conversation", userId, orgId, conversationId],
    queryFn: () => apiRequest(`${base}/${conversationId}`, conversationSchema),
    enabled: Boolean(conversationId),
    retry: false,
  });
  const messages = useQuery({
    queryKey: ["messages", userId, orgId, conversationId, messageOffset],
    queryFn: () =>
      apiRequest(
        `${base}/${conversationId}/messages?offset=${messageOffset}`,
        messagesSchema,
      ),
    enabled: conversation.isSuccess,
    retry: false,
  });
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const c = await mutate(
        base,
        { title: form.get("title"), spaceId: form.get("spaceId") || null },
        conversationSchema,
      );
      navigate(`/organizations/${orgId}/chat/${c.id}`);
    } catch {
      setError(
        "Unable to create conversation. Check organization membership and the selected space.",
      );
    }
  }
  async function send(text: string, requestId: string = crypto.randomUUID()) {
    if (busy || !conversationId) return;
    setBusy(true);
    setAccepted(false);
    setError("");
    setLive("");
    activeRequest.current = requestId;
    const abort = new AbortController();
    controller.current = abort;
    try {
      const csrf = await apiRequest(
        "/api/v1/auth/csrf",
        z.object({ csrfToken: z.string() }),
      );
      const response = await fetch(`${base}/${conversationId}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.csrfToken,
        },
        body: JSON.stringify({ requestId, question: text }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const body = (await response.json()) as { code?: string };
        throw new Error(
          body.code === "PROVIDER_DISABLED"
            ? "AI is not connected. Your question is saved; no model was called. Retry uses the same request."
            : "Message failed. Your question is saved when accepted. Retry the saved request.",
        );
      }
      setAccepted(true);
      if (!response.body)
        throw new Error("Stream unavailable. Retry the saved request.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        received = false;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = answerEventSchema.parse(JSON.parse(line.slice(6)));
          if (event.type === "delta") setLive((value) => value + event.text);
          if (event.type === "error")
            throw new Error(
              "Simulation stream failed or was cancelled. Retry the saved request.",
            );
          if (event.type === "result") {
            setLive(event.result.content);
            received = true;
          }
        }
      }
      if (!received)
        throw new Error(
          "Stream ended before completion. Retry the saved request.",
        );
      setQuestion("");
    } catch (e) {
      setError(
        abort.signal.aborted
          ? "Request cancelled. You may retry the saved question."
          : e instanceof Error
            ? e.message
            : "Message failed. Retry.",
      );
    } finally {
      setBusy(false);
      setAccepted(false);
      controller.current = null;
      activeRequest.current = null;
      const result = await messages.refetch();
      if (result.data)
        setMessageOffset(
          Math.floor(Math.max(0, result.data.total - 1) / 20) * 20,
        );
      void list.refetch();
    }
  }
  async function cancel() {
    const id = activeRequest.current;
    if (!id) return;
    try {
      await mutate(
        `${base}/${conversationId}/requests/${id}/cancel`,
        {},
        successSchema,
      );
    } catch {
      setError(
        "Cancellation could not be confirmed. Refresh history before retrying.",
      );
    } finally {
      controller.current?.abort();
    }
  }
  const mode = list.data?.providerMode;
  return (
    <>
      <h1>Private chat</h1>
      <p>
        <Link to={`/organizations/${orgId}/knowledge`}>Knowledge spaces</Link> ·{" "}
        <Link to={`/organizations/${orgId}`}>Organization settings</Link> ·{" "}
        <Link to="/organizations">Switch organization</Link>
      </p>
      <div role="status" aria-label="AI provider status" className="panel">
        {mode === "mock"
          ? "SIMULATION ONLY — AI is not connected. Responses are deterministic UI tests, not factual answers."
          : "AI is not connected. This foundation does not call a model."}
      </div>
      {error && <ErrorState message={error} />}
      <div className="knowledge-layout">
        <aside>
          <Panel title="Your conversations">
            {list.isPending ? (
              <LoadingState />
            ) : list.isError ? (
              <ErrorState message="Conversations unavailable." />
            ) : (
              <>
                <ul>
                  {list.data.items.map((c) => (
                    <li key={c.id}>
                      <Link to={`/organizations/${orgId}/chat/${c.id}`}>
                        {c.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                {!list.data.total && (
                  <EmptyState>No conversations yet.</EmptyState>
                )}
                <Button
                  disabled={!offset}
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  Previous conversations
                </Button>
                <Button
                  disabled={offset + 20 >= list.data.total}
                  onClick={() => setOffset(offset + 20)}
                >
                  Next conversations
                </Button>
              </>
            )}
          </Panel>
          <Panel title="New conversation">
            <form onSubmit={create}>
              <label>
                Conversation title
                <input
                  name="title"
                  required
                  maxLength={100}
                  defaultValue="New conversation"
                />
              </label>
              <label>
                Search scope
                <select name="spaceId">
                  <option value="">Organization-wide</option>
                  {spaces.data?.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
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
              <Button>Create conversation</Button>
            </form>
          </Panel>
        </aside>
        <section>
          {!conversationId ? (
            <EmptyState>
              Create or choose a private conversation. Its scope is fixed at
              creation.
            </EmptyState>
          ) : conversation.isPending ? (
            <LoadingState />
          ) : conversation.isError ? (
            <ErrorState message="Conversation unavailable or belongs to another user." />
          ) : (
            <>
              <h2>{conversation.data.title}</h2>
              <p>
                Scope:{" "}
                {conversation.data.spaceId
                  ? (spaces.data?.items.find(
                      (s) => s.id === conversation.data.spaceId,
                    )?.name ?? "Selected space")
                  : "Organization-wide"}
              </p>
              <Button
                disabled={busy}
                onClick={() => {
                  void mutate(
                    `${base}/${conversationId}`,
                    {},
                    successSchema,
                    "DELETE",
                  )
                    .then(() => navigate(`/organizations/${orgId}/chat`))
                    .catch(() => setError("Unable to delete conversation."));
                }}
              >
                Delete conversation
              </Button>
              {messages.isPending ? (
                <LoadingState />
              ) : messages.isError ? (
                <ErrorState
                  message="Messages unavailable."
                  onRetry={() => {
                    void messages.refetch();
                  }}
                />
              ) : (
                <>
                  <ol aria-label="Conversation messages">
                    {messages.data.items.map((m) => (
                      <li key={m.id}>
                        <strong>
                          {m.role === "USER" ? "You" : "Assistant"}
                        </strong>
                        <p className="comment-text">
                          {m.content ||
                            (m.state === "PENDING"
                              ? "Pending…"
                              : m.state === "CANCELLED"
                                ? "Cancelled"
                                : "No answer — provider disabled or unavailable")}
                        </p>
                        <p>
                          {m.state}
                          {m.providerMode === "mock" &&
                            m.role === "ASSISTANT" &&
                            " · Simulation only"}
                        </p>
                        {m.citations.length > 0 && (
                          <aside aria-label="Simulation sources">
                            <p>
                              Simulation source preview; no real retrieval was
                              performed.
                            </p>
                            <ul>
                              {m.citations.map((c) => (
                                <li key={`${c.sourceId}:${c.sourceVersionId}`}>
                                  <Link
                                    to={`/organizations/${orgId}/pages/${c.pageId}/versions/${c.pageVersionId}`}
                                  >
                                    {c.title} — exact published version
                                  </Link>
                                  <blockquote>{c.quote}</blockquote>
                                </li>
                              ))}
                            </ul>
                          </aside>
                        )}
                        {m.role === "ASSISTANT" &&
                          ["FAILED", "CANCELLED"].includes(m.state) && (
                            <Button
                              disabled={busy}
                              onClick={() => {
                                const original = messages.data.items.find(
                                  (item) =>
                                    item.requestId === m.requestId &&
                                    item.role === "USER",
                                );
                                if (original)
                                  void send(original.content, m.requestId);
                              }}
                            >
                              Retry saved request
                            </Button>
                          )}
                      </li>
                    ))}
                  </ol>
                  <Button
                    disabled={!messageOffset}
                    onClick={() =>
                      setMessageOffset(Math.max(0, messageOffset - 20))
                    }
                  >
                    Previous messages
                  </Button>
                  <Button
                    disabled={messageOffset + 20 >= messages.data.total}
                    onClick={() => setMessageOffset(messageOffset + 20)}
                  >
                    Next messages
                  </Button>
                </>
              )}
              {busy && <p role="status">{live || "Waiting for response…"}</p>}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(question);
                }}
              >
                <label>
                  Question
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    required
                    maxLength={4000}
                  />
                </label>
                <Button disabled={busy || !question.trim()}>
                  Send question
                </Button>
                {busy && accepted && (
                  <Button
                    type="button"
                    onClick={() => {
                      void cancel();
                    }}
                  >
                    Cancel request
                  </Button>
                )}
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}
