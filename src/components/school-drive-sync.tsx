import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { useAuth } from "@/lib/auth";
import { getAccessToken } from "@/lib/app-access";
import { listDriveSchools, syncSchoolWorkbook } from "@/lib/school-drive.functions";

type Result = { message: string; fileId?: string; conflicts?: string[]; error?: boolean };
export function SchoolDriveSync() {
  const { isAdmin } = useAuth();
  return isAdmin ? <DriveControls /> : null;
}
function DriveControls() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const running = useRef(false);
  const schools = useQuery({
    queryKey: ["drive-sync-schools"],
    queryFn: () => listDriveSchools({ data: { token: getAccessToken() } }),
    staleTime: 60000,
  });
  const sync = useCallback(
    async (ids: string[]) => {
      if (running.current) return;
      running.current = true;
      try {
        for (const schoolId of ids) {
          setBusy(schoolId);
          try {
            const result = await syncSchoolWorkbook({
              data: { token: getAccessToken(), schoolId },
            });
            setResults((prev) => ({
              ...prev,
              [schoolId]: {
                fileId: result.fileId,
                conflicts: result.conflicts,
                message: result.conflicts.length
                  ? "Sync paused — review conflicting rows."
                  : `Synced ${new Date(result.syncedAt!).toLocaleTimeString()}. ${result.imported} spreadsheet edits applied.`,
              },
            }));
            if (result.conflicts.length) {
              setAuto(false);
              break;
            }
            // Refresh student lists, school reports and any currently observed data after imports.
            if (result.imported) await queryClient.invalidateQueries();
          } catch (error) {
            setResults((prev) => ({
              ...prev,
              [schoolId]: {
                ...prev[schoolId],
                error: true,
                message: error instanceof Error ? error.message : "Sync failed",
              },
            }));
            setAuto(false);
            break;
          }
        }
      } finally {
        running.current = false;
        setBusy(null);
      }
    },
    [queryClient],
  );
  useEffect(() => {
    if (!auto || !schools.data?.length) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void sync(schools.data.map((s) => s.id));
    }, 120000);
    return () => clearInterval(timer);
  }, [auto, schools.data, sync]);
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">School Excel files in Google Drive</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each school gets one workbook in your{" "}
        <a
          className="underline"
          href="https://drive.google.com/drive/folders/1tUpZACLsarpCEiY0-43SFCvBQnASSusY"
          target="_blank"
          rel="noreferrer"
        >
          Drive folder
        </a>
        . Sync exports current app data and imports supported spreadsheet edits.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Read the workbook’s “Read Me” sheet before editing. Add/delete students and change
        calculated results in the app. Deleting spreadsheet rows never deletes app records. Photos
        are links; accounts and passwords are excluded. Files use the folder’s existing sharing
        permissions.
      </p>
      <div className="my-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={!!busy || !schools.data?.length}
          onClick={() => void sync(schools.data!.map((s) => s.id))}
        >
          {busy ? "Syncing…" : "Sync all schools"}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Sync every 2 minutes while this page is open
        </label>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Keep this page open until sync finishes. Conflicts or errors pause automatic sync. More
        Drive space stores more files; database capacity is managed separately.
      </p>
      {schools.isPending && <p role="status">Loading schools…</p>}
      {schools.error && (
        <div role="alert">
          <p>Unable to load schools.</p>
          <Button variant="outline" onClick={() => void schools.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {schools.data?.length === 0 && <p>No schools yet. Add a school to begin.</p>}
      <div className="max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
        {schools.data?.map((school) => (
          <div key={school.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{school.name}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => void sync([school.id])}
              >
                {busy === school.id ? "Syncing…" : "Sync"}
              </Button>
            </div>
            {results[school.id] && (
              <div className="mt-2 text-xs">
                <p role={results[school.id].error ? "alert" : undefined}>
                  {results[school.id].message}
                </p>
                {results[school.id].fileId && (
                  <a
                    className="underline"
                    href={`https://drive.google.com/file/d/${encodeURIComponent(results[school.id].fileId!)}/view`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open workbook
                  </a>
                )}
                {!!results[school.id].conflicts?.length && (
                  <details>
                    <summary>View conflicts ({results[school.id].conflicts!.length})</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {results[school.id].conflicts!.map((message, i) => (
                        <li key={i}>{message}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
