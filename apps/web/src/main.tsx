import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { healthSchema } from "../../../packages/contracts/src/index";
import { apiRequest } from "./api";
import { EmptyState, ErrorState, LoadingState, Panel } from "./components";
import "./style.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
function Home() {
  const status = useQuery({
    queryKey: ["readiness"],
    queryFn: () => apiRequest("/health/ready", healthSchema),
  });
  return (
    <>
      <h1>Team Knowledge Assistant</h1>
      <p>Shared technical knowledge, with a history you can trust.</p>
      <Panel title="Local foundation">
        {status.isPending ? (
          <LoadingState />
        ) : status.isError ? (
          <ErrorState
            message="The knowledge service is unavailable."
            onRetry={() => {
              void status.refetch();
            }}
          />
        ) : (
          <p role="status">Knowledge service connected.</p>
        )}
        <EmptyState>
          Authentication and organization setup arrive in the next milestones.
        </EmptyState>
      </Panel>
      <p className="badge">AI not connected</p>
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <header>
          <Link to="/" className="brand">
            Team Knowledge
          </Link>
        </header>
        <main id="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="*"
              element={
                <>
                  <h1>Page not found</h1>
                  <Link to="/">Return home</Link>
                </>
              }
            />
          </Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
