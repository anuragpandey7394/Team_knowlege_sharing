import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  organizationsSchema,
  organizationSchema,
  organizationSummarySchema,
  membersSchema,
  invitesSchema,
  inviteInspectionSchema,
  roleSchema,
} from "../../../packages/contracts/src/index";
import { can } from "../../../packages/contracts/src/policy";
import { apiRequest } from "./api";
import { mutate, useAuth } from "./auth";
import {
  Button,
  Panel,
  LoadingState,
  ErrorState,
  EmptyState,
} from "./components";
const labels = {
  READER: "Reader",
  REVIEWER: "Reviewer",
  EDITOR: "Editor",
  ADMIN: "Admin",
};
function RoleOptions() {
  return (
    <>
      {roleSchema.options.map((role) => (
        <option key={role} value={role}>
          {labels[role]}
        </option>
      ))}
    </>
  );
}
function failure(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Request failed. Please retry.";
}
export function Organizations() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["organizations", auth.data?.id, offset],
    queryFn: () =>
      apiRequest(`/api/v1/organizations?offset=${offset}`, organizationsSchema),
    enabled: Boolean(auth.data?.verified),
  });
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const name = new FormData(event.currentTarget).get("name");
    try {
      const org = await mutate(
        "/api/v1/organizations",
        { name },
        organizationSchema,
      );
      navigate(`/organizations/${org.id}`);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }
  if (!auth.data?.verified)
    return (
      <>
        <h1>Verify your email</h1>
        <p>Verify your email before creating or joining an organization.</p>
        <Link to="/resend-verification">Resend verification</Link>
      </>
    );
  return (
    <>
      <h1>Your organizations</h1>
      <Panel title="Choose an organization">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            message="Unable to load organizations."
            onRetry={() => {
              void query.refetch();
            }}
          />
        ) : (
          <>
            {query.data.items.length ? (
              <ul>
                {query.data.items.map((org) => (
                  <li key={org.id}>
                    <Link to={`/organizations/${org.id}`}>{org.name}</Link>{" "}
                    <span className="muted">{labels[org.role]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>
                You have no organizations yet. Create one or accept an
                invitation.
              </EmptyState>
            )}
            <Button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous organizations
            </Button>{" "}
            <Button
              disabled={offset + 20 >= query.data.total}
              onClick={() => setOffset(offset + 20)}
            >
              Next organizations
            </Button>
          </>
        )}
      </Panel>
      <Panel title="Create an organization">
        <form
          onSubmit={(event) => {
            void create(event);
          }}
        >
          <label>
            Organization name
            <input name="name" required minLength={2} maxLength={100} />
          </label>
          {error && <ErrorState message={error} />}
          <Button disabled={busy}>Create organization</Button>
        </form>
      </Panel>
    </>
  );
}
export function OrganizationRoute() {
  const { orgId } = useParams();
  return orgId ? <OrganizationWorkspace key={orgId} orgId={orgId} /> : null;
}
function OrganizationWorkspace({ orgId }: { orgId: string }) {
  const auth = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [memberOffset, setMemberOffset] = useState(0);
  const [inviteOffset, setInviteOffset] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const org = useQuery({
    queryKey: ["organization", auth.data?.id, orgId],
    queryFn: () =>
      apiRequest(`/api/v1/organizations/${orgId}`, organizationSummarySchema),
  });
  const list = useQuery({
    queryKey: ["organizations", auth.data?.id, "switcher"],
    queryFn: () =>
      apiRequest("/api/v1/organizations?limit=100", organizationsSchema),
  });
  const members = useQuery({
    queryKey: ["members", auth.data?.id, orgId, memberOffset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/members?offset=${memberOffset}`,
        membersSchema,
      ),
    enabled: org.isSuccess,
  });
  const admin = org.data ? can(org.data.role, "admin") : false;
  const invites = useQuery({
    queryKey: ["invitations", auth.data?.id, orgId, inviteOffset],
    queryFn: () =>
      apiRequest(
        `/api/v1/organizations/${orgId}/invitations?offset=${inviteOffset}`,
        invitesSchema,
      ),
    enabled: admin,
  });
  async function switchOrganization(next: string) {
    await client.cancelQueries();
    client.removeQueries({
      predicate: (query) => query.queryKey[0] !== "auth",
    });
    navigate(`/organizations/${next}`);
  }
  async function action(
    path: string,
    body: unknown,
    method: "POST" | "PATCH" | "DELETE" = "POST",
  ) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const csrf = await apiRequest(
        "/api/v1/auth/csrf",
        z.object({ csrfToken: z.string() }),
      );
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.csrfToken,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = (await response.json()) as { code?: string };
        throw new Error(
          result.code === "LAST_ADMIN"
            ? "Keep at least one Admin in this organization."
            : result.code === "ALREADY_MEMBER"
              ? "This email is already a member."
              : "This action is unavailable. Refresh and check your permissions.",
        );
      }
      setNotice("Changes saved.");
      await client.invalidateQueries();
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }
  if (org.isPending) return <LoadingState />;
  if (org.isError)
    return (
      <>
        <h1>Organization unavailable</h1>
        <ErrorState
          message="You may no longer have access to this organization."
          onRetry={() => {
            void org.refetch();
          }}
        />
        <Link to="/organizations">Choose an organization</Link>
      </>
    );
  return (
    <>
      <p>
        <Link to="/organizations">All organizations</Link>
      </p>
      <label>
        Current organization
        <select
          value={orgId}
          onChange={(event) => {
            void switchOrganization(event.target.value);
          }}
        >
          {!list.data?.items.some((item) => item.id === orgId) && (
            <option value={orgId}>{org.data.name}</option>
          )}
          {list.data?.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <h1>{org.data.name}</h1>
      <p>Your role: {labels[org.data.role]}</p>
      {error && <ErrorState message={error} />}
      {notice && <p role="status">{notice}</p>}
      {admin && (
        <Panel title="Organization settings">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(
                `/api/v1/organizations/${orgId}`,
                { name: new FormData(event.currentTarget).get("name") },
                "PATCH",
              );
            }}
          >
            <label>
              Organization name
              <input
                name="name"
                defaultValue={org.data.name}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <Button disabled={busy}>Save organization name</Button>
          </form>
        </Panel>
      )}
      <Panel title="Members">
        {members.isPending ? (
          <LoadingState />
        ) : members.isError ? (
          <ErrorState message="Unable to load members." />
        ) : (
          <>
            <ul className="member-list">
              {members.data.items.map((member) => (
                <li key={member.userId}>
                  <strong>{member.displayName}</strong>{" "}
                  <span>{member.email}</span>
                  <p>{labels[member.role]}</p>
                  {admin && (
                    <>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void action(
                            `/api/v1/organizations/${orgId}/members/${member.userId}`,
                            {
                              role: new FormData(event.currentTarget).get(
                                "role",
                              ),
                            },
                            "PATCH",
                          );
                        }}
                      >
                        <label>
                          Role for {member.email}
                          <select name="role" defaultValue={member.role}>
                            <RoleOptions />
                          </select>
                        </label>
                        <Button disabled={busy}>Save role</Button>
                      </form>
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void action(
                            `/api/v1/organizations/${orgId}/members/${member.userId}`,
                            {},
                            "DELETE",
                          );
                        }}
                      >
                        Remove {member.email}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <Button
              disabled={memberOffset === 0}
              onClick={() => setMemberOffset(Math.max(0, memberOffset - 20))}
            >
              Previous members
            </Button>{" "}
            <Button
              disabled={memberOffset + 20 >= members.data.total}
              onClick={() => setMemberOffset(memberOffset + 20)}
            >
              Next members
            </Button>
          </>
        )}
      </Panel>
      {admin && (
        <>
          <Panel title="Invite a member">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void action(`/api/v1/organizations/${orgId}/invitations`, {
                  email: data.get("email"),
                  role: data.get("role"),
                });
              }}
            >
              <label>
                Invite email
                <input name="email" type="email" required />
              </label>
              <label>
                Invite role
                <select name="role" defaultValue="READER">
                  <RoleOptions />
                </select>
              </label>
              <Button disabled={busy}>Send invitation</Button>
            </form>
          </Panel>
          <Panel title="Invitations">
            {invites.isPending ? (
              <LoadingState />
            ) : invites.isError ? (
              <ErrorState message="Unable to load invitations." />
            ) : (
              <>
                {invites.data.items.length ? (
                  <ul>
                    {invites.data.items.map((invite) => (
                      <li key={invite.id}>
                        {invite.email} — {labels[invite.role]} —{" "}
                        {invite.acceptedAt
                          ? "Accepted"
                          : invite.revokedAt
                            ? "Revoked"
                            : new Date(invite.expiresAt) <= new Date()
                              ? "Expired"
                              : "Pending"}
                        {!invite.acceptedAt && !invite.revokedAt && (
                          <>
                            <Button
                              disabled={busy}
                              onClick={() => {
                                void action(
                                  `/api/v1/organizations/${orgId}/invitations/${invite.id}/resend`,
                                  {},
                                );
                              }}
                            >
                              Resend {invite.email}
                            </Button>
                            <Button
                              disabled={busy}
                              onClick={() => {
                                void action(
                                  `/api/v1/organizations/${orgId}/invitations/${invite.id}`,
                                  {},
                                  "DELETE",
                                );
                              }}
                            >
                              Revoke {invite.email}
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No invitations.</EmptyState>
                )}
                <Button
                  disabled={inviteOffset === 0}
                  onClick={() =>
                    setInviteOffset(Math.max(0, inviteOffset - 20))
                  }
                >
                  Previous invitations
                </Button>{" "}
                <Button
                  disabled={inviteOffset + 20 >= invites.data.total}
                  onClick={() => setInviteOffset(inviteOffset + 20)}
                >
                  Next invitations
                </Button>
              </>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
export function Invitation() {
  const auth = useAuth();
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const client = useQueryClient();
  const tokenValid = /^[a-f0-9]{64}$/.test(token);
  const query = useQuery({
    queryKey: ["invite", auth.data?.id, token],
    queryFn: () =>
      mutate("/api/v1/invitations/inspect", { token }, inviteInspectionSchema),
    enabled: Boolean(auth.data?.verified && tokenValid),
    retry: false,
  });
  async function accept() {
    try {
      const invite = await mutate(
        "/api/v1/invitations/accept",
        { token },
        inviteInspectionSchema,
      );
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
      window.history.replaceState(null, "", "/invite");
      navigate(`/organizations/${invite.organizationId}`);
    } catch {
      setError(
        "Invitation is no longer available. Request a new invitation from an Admin.",
      );
    }
  }
  return (
    <>
      <h1>Organization invitation</h1>
      {!auth.data?.verified ? (
        <>
          <p>
            Sign in with the exact invited email and verify it, then reopen this
            invitation link.
          </p>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Create account</Link>
        </>
      ) : !tokenValid || query.isError ? (
        <ErrorState message="Invitation unavailable for this account. It may be expired, revoked or addressed to another email." />
      ) : query.isPending ? (
        <LoadingState />
      ) : (
        <Panel title={query.data.organizationName}>
          <p>Join as {labels[query.data.role]}.</p>
          {error && <ErrorState message={error} />}
          <Button
            onClick={() => {
              void accept();
            }}
          >
            Accept invitation
          </Button>
        </Panel>
      )}
    </>
  );
}
