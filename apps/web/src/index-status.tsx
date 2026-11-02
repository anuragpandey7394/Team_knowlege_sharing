import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { indexViewSchema } from "../../../packages/contracts/src/index";
import { apiRequest } from "./api";
import { useAuth, mutate } from "./auth";
import { Button, ErrorState } from "./components";
export function IndexStatus({
  orgId,
  sourceId,
  canRetry,
}: {
  orgId: string;
  sourceId: string;
  canRetry: boolean;
}) {
  const userId = useAuth().data?.id;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/v1/organizations/${orgId}/index/page/${sourceId}`;
  const status = useQuery({
    queryKey: ["index", userId, orgId, sourceId],
    queryFn: () => apiRequest(base, indexViewSchema),
    refetchInterval: 5000,
  });
  return (
    <section aria-label="AI indexing status">
      <p>
        AI index: {status.data?.status.replaceAll("_", " ") ?? "loading"}
        {status.data?.simulated && " (simulation only)"}
      </p>
      {status.data?.safeError && (
        <p>Index worker unavailable. Publication remains readable.</p>
      )}
      {status.isError && (
        <ErrorState message="Index status unavailable. Page remains readable." />
      )}
      {error && <ErrorState message={error} />}
      {canRetry && (
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void mutate(`${base}/retry`, {}, indexViewSchema)
              .then(() => status.refetch())
              .catch(() =>
                setError(
                  "Unable to retry indexing. Check permissions and source status.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Retry indexing
        </Button>
      )}
      <p>
        Foundation has no real index provider connected. Retry retains durable
        work; it does not enable AI.
      </p>
    </section>
  );
}
