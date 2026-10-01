import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listQuestionSetVersions, saveQuestionSetVersion } from "@/lib/academic.functions";
import { fetchExamTypes } from "@/lib/question-bank";
import { getAccessToken } from "@/lib/app-access";
import { getAcademicYear } from "@/lib/academic-year";
import { useAuth } from "@/lib/auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function QuestionSetVersions() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [exam, setExam] = useState("ICA"),
    [cls, setCls] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false);
  const versions = useQuery({
    queryKey: ["question-versions"],
    queryFn: () => listQuestionSetVersions({ data: { token: getAccessToken() } }),
  });
  const types = useQuery({ queryKey: ["exam-types"], queryFn: fetchExamTypes });
  async function save() {
    setBusy(true);
    try {
      await saveQuestionSetVersion({
        data: {
          token: getAccessToken(),
          examType: exam,
          className: cls,
          name,
          year: getAcademicYear(),
        },
      });
      await qc.invalidateQueries({ queryKey: ["question-versions"] });
      toast.success("Question set version saved");
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save version");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border p-4">
      <summary className="font-semibold">Question set versions</summary>
      <p className="my-2 text-sm">
        Save a fixed copy of the current class answer key before changing it. Select a saved version
        in an assessment. Evaluated assessments also keep their own answer-key snapshot.
      </p>
      {versions.error && <p role="alert">{versions.error.message}</p>}
      {can("questions", "add") && (
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Version exam type"
            value={exam}
            onChange={(e) => setExam(e.target.value)}
          >
            {types.data?.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
          <Input
            aria-label="Version class"
            className="w-24"
            placeholder="Class"
            value={cls}
            onChange={(e) => setCls(e.target.value)}
          />
          <Input
            aria-label="Version name"
            placeholder="Version name, e.g. ICA Class 8 2026–27"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button disabled={busy || !name.trim() || !cls.trim()} onClick={() => void save()}>
            Save version
          </Button>
        </div>
      )}
      <div className="max-h-60 overflow-auto">
        {versions.data?.map((v) => (
          <p key={v.id} className="py-1 text-sm">
            {v.name} · {v.exam_type} · Class {v.class} · {v.academic_year ?? "Any year"}
          </p>
        ))}
      </div>
    </details>
  );
}
