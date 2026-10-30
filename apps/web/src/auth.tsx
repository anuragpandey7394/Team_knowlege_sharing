import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authUserSchema } from "../../../packages/contracts/src/index";
import { apiRequest, ApiClientError } from "./api";
import { Button, ErrorState, LoadingState, Panel } from "./components";

const messageSchema = z.object({ message: z.string() });
export async function mutate<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  method: "POST" | "PATCH" | "DELETE" = "POST",
): Promise<T> {
  const csrf = await apiRequest(
    "/api/v1/auth/csrf",
    z.object({ csrfToken: z.string() }),
  );
  return apiRequest(path, schema, {
    method,
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrf.csrfToken,
    },
    body: JSON.stringify(body),
  });
}
export function useAuth() {
  return useQuery({
    queryKey: ["auth"],
    queryFn: () => apiRequest("/api/v1/auth/me", authUserSchema),
    retry: false,
  });
}
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isPending) return <LoadingState />;
  if (auth.error instanceof ApiClientError && auth.error.status === 401)
    return (
      <Navigate
        to="/login"
        state={{ expired: true, returnTo: location.pathname + location.hash }}
        replace
      />
    );
  if (auth.isError)
    return (
      <ErrorState
        message="Unable to check your session."
        onRetry={() => {
          void auth.refetch();
        }}
      />
    );
  return <>{children}</>;
}
export function Account() {
  const auth = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await mutate("/api/v1/auth/logout", {}, messageSchema);
      client.clear();
      navigate("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign out failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Your account</h1>
      <p>Signed in as {auth.data?.email}</p>
      <p>
        {auth.data?.verified
          ? "Email verified."
          : "Verify your email before accessing organization knowledge."}
      </p>
      {!auth.data?.verified && (
        <Link to="/resend-verification">Resend verification email</Link>
      )}
      {error && <ErrorState message={error} />}
      <Button
        disabled={busy}
        onClick={() => {
          void logout();
        }}
      >
        Sign out
      </Button>
    </>
  );
}
type AuthMode =
  | "register"
  | "login"
  | "resend-verification"
  | "forgot-password"
  | "reset-password"
  | "verify-email";
const titles: Record<AuthMode, string> = {
  register: "Create your account",
  login: "Sign in",
  "resend-verification": "Resend verification email",
  "forgot-password": "Reset your password",
  "reset-password": "Choose a new password",
  "verify-email": "Verify your email",
};
export function AuthPage({ mode }: { mode: AuthMode }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const navigate = useNavigate();
  const client = useQueryClient();
  const location = useLocation();
  const needsEmail = [
    "login",
    "register",
    "forgot-password",
    "resend-verification",
  ].includes(mode);
  const needsPassword = ["login", "register", "reset-password"].includes(mode);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    const body: Record<string, string> = {};
    if (needsEmail) body.email = String(fields.get("email"));
    if (needsPassword) body.password = String(fields.get("password"));
    if (mode === "register")
      body.displayName = String(fields.get("displayName"));
    if (mode === "verify-email" || mode === "reset-password")
      body.token = token;
    try {
      if (mode === "login") {
        const user = await mutate("/api/v1/auth/login", body, authUserSchema);
        client.clear();
        client.setQueryData(["auth"], user);
        const returnTo = location.state?.returnTo;
        navigate(
          typeof returnTo === "string" &&
            returnTo.startsWith("/") &&
            !returnTo.startsWith("//")
            ? returnTo
            : "/account",
        );
      } else {
        const response = await mutate(
          `/api/v1/auth/${mode}`,
          body,
          messageSchema,
        );
        setMessage(response.message);
        if (mode === "reset-password") client.clear();
        if (mode === "verify-email" || mode === "reset-password")
          window.history.replaceState(null, "", window.location.pathname);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Request failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const missingToken =
    (mode === "verify-email" || mode === "reset-password") && !token;
  return (
    <>
      <h1>{titles[mode]}</h1>
      {mode === "login" && location.state?.expired && (
        <p role="status">Your session expired. Please sign in again.</p>
      )}
      <Panel title="Account access">
        {missingToken ? (
          <ErrorState message="This link is invalid. Request a new email." />
        ) : (
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            {mode === "register" && (
              <label>
                Display name
                <input
                  name="displayName"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            {needsEmail && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                />
              </label>
            )}
            {needsPassword && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>
            )}
            {error && <ErrorState message={error} />}
            {message && <p role="status">{message}</p>}
            <Button disabled={busy || Boolean(message)} type="submit">
              {busy
                ? "Please wait…"
                : mode === "verify-email"
                  ? "Verify email"
                  : mode === "login"
                    ? "Sign in"
                    : "Continue"}
            </Button>
          </form>
        )}
        <nav aria-label="Account options">
          <Link to="/login">Sign in</Link>
          <Link to="/register">Create account</Link>
          <Link to="/forgot-password">Forgot password</Link>
          <Link to="/resend-verification">Resend verification</Link>
        </nav>
        {message &&
          ["localhost", "127.0.0.1"].includes(window.location.hostname) && (
            <p>
              For local development, open{" "}
              <a href="http://localhost:8025" target="_blank" rel="noreferrer">
                the Mailpit inbox
              </a>{" "}
              for the next step.
            </p>
          )}
      </Panel>
    </>
  );
}
