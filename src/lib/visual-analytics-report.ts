import {
  classify,
  buildSchoolComparison,
  distribution,
  mean,
  type AnalyticsView,
  type Area,
  type Thresholds,
} from "./visual-analytics";
export const escape = (v: unknown) =>
  String(v ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export const pct = (v: number | null) => (v == null ? "Not assessed" : `${v.toFixed(1)}%`);
export type SessionSummary = { unit: string; complete: number; total: number };
export type ReportOptions = {
  school: string;
  classLabel: string;
  thresholds: Thresholds;
  remarks: string;
  sessions?: SessionSummary[];
  sessionMessage?: string;
  student?: boolean;
  excluded: number;
  duplicates: number;
};
export const analyticsStyles = `
.va{color:#172033;background:#fff;font:12px/1.5 Arial,sans-serif;padding:20px;border-radius:12px;overflow-wrap:anywhere}.va *{box-sizing:border-box}.va h2{font-size:21px;color:#243d78;margin:0 0 12px}.va h3{font-size:16px;color:#243d78;border-left:5px solid #7c3aed;background:#eef2ff;padding:9px;margin:22px 0 12px;break-after:avoid}.va h4{margin:14px 0 6px;color:#334155}.va p{margin:8px 0}.va .va-muted{color:#64748b}.va .va-note{padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px}.va .va-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;break-inside:avoid}.va .va-stat{border:1px solid #ddd6fe;border-top:4px solid #7c3aed;border-radius:8px;padding:12px}.va .va-stat:nth-child(2){border-top-color:#0891b2}.va .va-stat:nth-child(3){border-top-color:#059669}.va .va-stat:nth-child(4){border-top-color:#d97706}.va .va-stat b{display:block;font-size:20px}.va table{border-collapse:collapse;width:100%;margin:10px 0;font-size:11px;table-layout:fixed;border-radius:0}.va th{background:#243d78;color:#fff;text-align:left}.va td,.va th{padding:7px;border:1px solid #cbd5e1;overflow-wrap:anywhere}.va tr{break-inside:avoid}.va tr:nth-child(even){background:#f8fafc}.va .va-selected{background:#ede9fe!important;font-weight:bold}.va thead{display:table-header-group}.va .va-bar{display:grid;grid-template-columns:minmax(110px,32%) 1fr 85px;gap:8px;align-items:center;margin:6px 0;break-inside:avoid}.va .va-track{height:12px;background:#e2e8f0;border-radius:5px;overflow:hidden}.va .va-fill{height:100%;min-width:0;background:#7c3aed}.va .va-chart{padding:12px;border:1px solid #e2e8f0;border-radius:8px;margin:10px 0;break-inside:avoid}.va .va-focus{border-left:4px solid;padding:8px 12px;margin:7px 0;break-inside:avoid}.va svg{width:100%;height:auto;display:block}.va .va-remarks{white-space:pre-wrap;border:1px dashed #94a3b8;padding:14px;min-height:80px}.va .va-legend{display:flex;gap:18px;flex-wrap:wrap}.va .va-page{break-inside:avoid}
@media(max-width:600px){.va{padding:10px}.va .va-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.va .va-bar{grid-template-columns:35% 1fr 70px}.va td,.va th{padding:4px;font-size:10px}}
@media print{.va{padding:0;font-size:10px}.va h3{margin-top:16px}.va .va-chart{box-shadow:none}.va *{-webkit-print-color-adjust:exact;print-color-adjust:exact}thead{display:table-header-group}tr{break-inside:avoid}.report-frame{border:0!important;padding:0!important;box-shadow:none!important}}
`;
const table = (headers: string[], rows: unknown[][], selected = -1) =>
  rows.length
    ? `<table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r, i) => `<tr${i === selected ? ' class="va-selected"' : ""}>${r.map((c) => `<td>${escape(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : '<p class="va-muted">No data available for this selection.</p>';
const section = (title: string, body: string) =>
  `<section><h3>${escape(title)}</h3>${body}</section>`;
const stats = (s: AnalyticsView["summary"]) =>
  `<div class="va-stats">${[
    [pct(s.score), "Average score"],
    [pct(s.rate), "Average correct rate"],
    [`${s.assessed} / ${s.students}`, "Students assessed / enrolled"],
    [s.assessments, "Assessments with results"],
  ]
    .map(([v, l]) => `<div class="va-stat"><b>${escape(v)}</b>${l}</div>`)
    .join("")}</div>`;
function bars(
  title: string,
  rows: { name: string; value: number | null; color?: string }[],
  color = "#7c3aed",
  percent = true,
) {
  if (!rows.length) return `<p class="va-muted">${escape(title)}: no data available.</p>`;
  // Small chart blocks paginate naturally, including every student, with no top-N truncation.
  let html = "";
  const max = percent ? 100 : Math.max(1, ...rows.map((r) => r.value ?? 0));
  for (let i = 0; i < rows.length; i += 18) {
    html += `<div class="va-chart"><h4>${escape(title)}${i ? " (continued)" : ""}</h4>${rows
      .slice(i, i + 18)
      .map(
        (r) =>
          `<div class="va-bar"><span>${escape(r.name)}</span><div class="va-track"><div class="va-fill" style="width:${Math.max(0, Math.min(100, ((r.value ?? 0) / max) * 100))}%;background:${r.color ?? color}"></div></div><b>${r.value == null ? "No data" : percent ? pct(r.value) : r.value}</b></div>`,
      )
      .join("")}</div>`;
  }
  return html;
}
function trendChart(view: Pick<AnalyticsView, "trend">) {
  const dated = view.trend.filter((r) => r.assessment.date);
  if (!dated.length)
    return '<p class="va-muted">Add assessment dates to show chronological progress.</p>';
  let out = "";
  for (let start = 0; start < dated.length; start += 12) {
    const rows = dated.slice(start, start + 12),
      x = (i: number) => 45 + (i * 560) / Math.max(1, rows.length - 1),
      y = (n: number) => 170 - n * 1.4;
    const series = (field: "score" | "rate", color: string) => {
      let path = "";
      let previous = false;
      rows.forEach((r, i) => {
        const v = r[field];
        if (v == null) {
          previous = false;
          return;
        }
        path += `${previous ? "L" : "M"}${x(i)},${y(v)} `;
        previous = true;
      });
      return (
        `<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>` +
        rows
          .map((r, i) =>
            r[field] == null
              ? ""
              : `<circle cx="${x(i)}" cy="${y(r[field]!)}" r="4" fill="${color}"><title>${escape(r.assessment.name)}: ${pct(r[field])}</title></circle>`,
          )
          .join("")
      );
    };
    out += `<div class="va-chart"><h4>Assessment performance trend${start ? " (continued)" : ""}</h4><svg viewBox="0 0 650 210" role="img" aria-label="Average score and correct rate across dated assessments">${[0, 25, 50, 75, 100].map((v) => `<line x1="45" x2="605" y1="${y(v)}" y2="${y(v)}" stroke="#e2e8f0"/><text x="4" y="${y(v) + 4}" font-size="10">${v}%</text>`).join("")}${series("score", "#7c3aed")}${series("rate", "#0891b2")}${rows.map((r, i) => `<text x="${x(i)}" y="193" text-anchor="middle" font-size="10">${start + i + 1}</text>`).join("")}</svg><div class="va-legend"><span style="color:#7c3aed">● Score</span><span style="color:#0891b2">● Correct rate</span></div><p class="va-muted">${rows.map((r, i) => `${start + i + 1}: ${escape(r.assessment.name)} (${escape(r.assessment.date)})`).join(" · ")}</p></div>`;
  }
  return out;
}
function areaTable(rows: Area[], thresholds: Thresholds) {
  return table(
    ["Area", "Questions", "Responses", "Correct rate", "Status", "Improvement"],
    rows.map((a) => [
      a.name,
      a.questions,
      a.responses,
      pct(a.rate),
      classify(a.rate, thresholds).status,
      classify(a.rate, thresholds).priority,
    ]),
  );
}
function areaSection(title: string, rows: Area[], t: Thresholds) {
  return section(
    title,
    bars(
      "Correct rate · highest to lowest",
      rows.map((a) => ({ name: a.name, value: a.rate })),
      "#0891b2",
    ) + areaTable(rows, t),
  );
}
export function analyticsReport(view: AnalyticsView, options: ReportOptions) {
  const { thresholds: t } = options;
  const allAreas = [
    ...view.subjects.map((a) => ({ ...a, name: `Subject: ${a.name}` })),
    ...view.parameters.map((a) => ({ ...a, name: `Parameter: ${a.name}` })),
    ...view.topics.map((a) => ({ ...a, name: `Topic: ${a.name}` })),
    ...view.chapters.map((a) => ({ ...a, name: `Chapter: ${a.name}` })),
  ].filter((a) => !/Unspecified (subject|parameter|topic|chapter)$/.test(a.name));
  const focus = (label: string, rows: Area[], color: string) =>
    `<div class="va-focus" style="border-color:${color}"><h4>${escape(label)}</h4>${rows.length ? rows.map((a) => `<p>${escape(a.name)} — ${pct(a.rate)} · ${classify(a.rate, t).priority}</p>`).join("") : "<p>No assessed areas in this band.</p>"}</div>`;
  const dist = (title: string, values: (number | null)[]) =>
    bars(
      title,
      distribution(values).map((r) => ({ name: r.name, value: r.count })),
      "#0891b2",
      false,
    ) +
    `<p class="va-muted">${values.filter((v) => v == null).length} students have no valid value and are excluded from these ranges.</p>`;
  const studentName = (s: AnalyticsView["students"][number]) =>
    `${s.name} · Roll ${s.roll_number} · ${s.class}/${s.division}`;
  const overviewLabel = options.student
    ? "Student Overview"
    : options.classLabel === "All classes"
      ? "School Overview"
      : "Class Overview";
  let body = `<style>${analyticsStyles}</style><div class="va"><h2>Visual Analytics &amp; Improvement</h2><p><b>${escape(options.school)}</b> · ${escape(options.classLabel)}${options.student && view.students[0] ? ` · ${escape(view.students[0].name)}` : ""}</p><p class="va-note">Based on linked Clicker assessment results. Score % = stored correct-answer score / assessment question count × 100. Correct rate uses the stored Clicker percentage; question breakdowns are independently calculated from Question Master. Averages include recorded results only. Questions = unique questions; responses = student-question opportunities. Latest record per student/assessment is used. Blank responses count as incorrect when question answers are supplied; summary-only imports have no question breakdown. Rankings use competition ties within school/class/section for each assessment (lower is better).</p>`;
  body += `<p class="va-muted">Question breakdown coverage: ${view.attempts.filter((a) => a.responses.length).length} / ${view.attempts.length} results. Missing or invalid score: ${view.attempts.filter((a) => a.score == null).length}; missing or invalid correct rate: ${view.attempts.filter((a) => a.rate == null).length}. Summary-only results contribute to overall averages, but not question breakdowns.</p>`;
  if (options.excluded || options.duplicates)
    body += `<p class="va-note">Dataset quality: ${options.excluded} unlinked or inconsistent records excluded; ${options.duplicates} repeated student/assessment records replaced by their latest record. These counts cover the loaded dataset.</p>`;
  body += section(`1. ${overviewLabel}`, stats(view.summary));
  const schoolByStudent = new Map<string, { score: (number | null)[]; rate: (number | null)[] }>();
  for (const a of view.schoolAttempts) {
    const g = schoolByStudent.get(a.student.id) ?? { score: [], rate: [] };
    g.score.push(a.score);
    g.rate.push(a.rate);
    schoolByStudent.set(a.student.id, g);
  }
  body += section(
    "2. School-wise Performance Context",
    stats(view.school) +
      trendChart({ trend: view.schoolTrend }) +
      bars("Overall school performance", [
        { name: "Average score", value: view.school.score },
        { name: "Average correct rate", value: view.school.rate },
      ]) +
      dist(
        "School score distribution · students",
        view.schoolStudents.map((s) => mean(schoolByStudent.get(s.id)?.score ?? [])),
      ) +
      dist(
        "School correct-rate distribution · students",
        view.schoolStudents.map((s) => mean(schoolByStudent.get(s.id)?.rate ?? [])),
      ),
  );
  body += section(
    "3. Class-wise Comparison",
    bars(
      "Average score by class",
      view.classes.map((c) => ({ name: `Class ${c.name}`, value: c.score })),
    ) +
      bars(
        "Correct rate by class",
        view.classes.map((c) => ({ name: `Class ${c.name}`, value: c.rate })),
        "#0891b2",
      ) +
      table(
        ["Class", "Students", "Assessed", "Avg. score", "Correct rate", "Assessments"],
        view.classes.map((c) => [
          c.name,
          c.students,
          c.assessed,
          pct(c.score),
          pct(c.rate),
          c.assessments,
        ]),
        view.classes.findIndex((c) => options.classLabel.startsWith(`Class ${c.name} ·`)),
      ),
  );
  body += section(
    "4. Individual Student Performance",
    bars(
      "Student vs average score",
      view.compare.map((s) => ({ name: studentName(s.student), value: s.score })),
    ) +
      bars(
        "Student vs correct rate",
        view.compare.map((s) => ({ name: studentName(s.student), value: s.rate })),
        "#0891b2",
      ) +
      table(
        ["Student", "Roll", "Section", "Assessments", "Avg. score", "Correct rate"],
        view.compare.map((s) => [
          s.student.name,
          s.student.roll_number,
          s.student.division,
          s.assessments,
          pct(s.score),
          pct(s.rate),
        ]),
      ),
  );
  body += section(
    "5. Assessment Trend",
    trendChart(view) +
      (options.student
        ? bars(
            "Ranking across assessments · lower is better",
            view.trend.map((r) => ({ name: r.assessment.name, value: r.rank })),
            "#d97706",
            false,
          )
        : "") +
      table(
        [
          "Assessment",
          "Date",
          "Score",
          "Correct rate",
          "Rank",
          "Score Δ (pp)",
          "Rate Δ (pp)",
          "Rank improvement",
        ],
        view.trend.map((r, i) => {
          const previous = view.trend[i - 1];
          const change =
            previous?.assessment.date &&
            r.assessment.date &&
            r.score != null &&
            previous.score != null
              ? r.score - previous.score
              : null;
          const rateChange =
            previous?.assessment.date &&
            r.assessment.date &&
            r.rate != null &&
            previous.rate != null
              ? r.rate - previous.rate
              : null;
          const rankChange =
            previous?.assessment.date &&
            r.assessment.date &&
            r.rank != null &&
            previous.rank != null
              ? previous.rank - r.rank
              : null;
          const delta = (n: number | null) =>
            n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
          return [
            r.assessment.name,
            r.assessment.date ?? "Undated",
            pct(r.score),
            pct(r.rate),
            r.rank ?? "—",
            delta(change),
            delta(rateChange),
            delta(rankChange),
          ];
        }),
      ) +
      '<p class="va-muted">Undated assessments are listed last and excluded from the chronological chart. Changes use percentage points (pp).</p>',
  );
  body +=
    areaSection("6. Subject-wise Performance", view.subjects, t) +
    areaSection("7. Parameter-wise Performance", view.parameters, t) +
    section(
      "8. Topic / Chapter Analysis",
      bars(
        "Topics · highest to lowest",
        view.topics.map((a) => ({ name: a.name, value: a.rate })),
        "#059669",
      ) +
        areaTable(view.topics, t) +
        bars(
          "Chapters · highest to lowest",
          view.chapters.map((a) => ({ name: a.name, value: a.rate })),
          "#0891b2",
        ) +
        areaTable(view.chapters, t),
    );
  body +=
    section(
      "9. Improvement Required – Subject-wise",
      areaTable(
        view.subjects
          .filter((a) => a.rate < t.strong)
          .slice()
          .reverse(),
        t,
      ),
    ) +
    section(
      "10. Improvement Required – Parameter-wise",
      areaTable(
        view.parameters
          .filter((a) => a.rate < t.strong)
          .slice()
          .reverse(),
        t,
      ),
    );
  body += section(
    "11. Student Performance Distribution",
    dist(
      "Average score ranges · students",
      view.compare.map((s) => s.score),
    ) +
      dist(
        "Correct-rate ranges · students",
        view.compare.map((s) => s.rate),
      ),
  );
  body += section(
    "12. Session Progress",
    options.sessions
      ? table(
          ["Unit", "Completed", "Pending", "Total", "Progress"],
          options.sessions.map((s) => [
            s.unit,
            s.complete,
            s.total - s.complete,
            s.total,
            s.total ? pct((s.complete / s.total) * 100) : "No sessions",
          ]),
        )
      : `<p class="va-muted">${escape(options.sessionMessage ?? "Select a class and section to view session progress.")}</p>`,
  );
  body += section(
    "13. Strong Areas",
    focus(
      "Strong areas",
      allAreas.filter((a) => a.rate >= t.strong),
      "#059669",
    ),
  );
  body += section(
    "14. Focus Areas / Improvement Required",
    `<p>Thresholds: Strong ≥ ${t.strong}%; Good ≥ ${t.good}%; Needs Attention ≥ ${t.attention}%; Weak &lt; ${t.attention}%.</p>` +
      focus(
        "High priority",
        allAreas.filter((a) => a.rate < t.good).sort((a, b) => a.rate - b.rate),
        "#dc2626",
      ) +
      focus(
        "Moderate priority",
        allAreas.filter((a) => a.rate >= t.good && a.rate < t.strong),
        "#d97706",
      ),
  );
  if (options.student)
    body += section(
      "Question-level Detail",
      table(
        ["Assessment", "Question", "Subject", "Parameter", "Response", "Correct answer", "Result"],
        view.attempts.flatMap((a) =>
          a.responses.map((r) => [
            a.assessment.name,
            r.question.question_no,
            r.question.subject || a.assessment.subject || "Unspecified",
            r.question.parameter || "Unspecified",
            r.answer || "Blank",
            r.question.correct_answer,
            r.correct ? "Correct" : "Incorrect",
          ]),
        ),
      ),
    );
  body += section(
    "15. Teacher Remarks",
    `<div class="va-remarks">${escape(options.remarks || "Teacher / trainer remarks:")}</div>`,
  );
  if (!view.attempts.some((a) => a.responses.length))
    body +=
      '<p class="va-note">No linked question responses are available. Import S1, S2, … answers and matching Question Master rows to calculate subject, parameter, topic, and chapter performance.</p>';
  return body + "</div>";
}

/** Same printable charts are used in the all-schools dashboard and PDF/Word exports. */
export function schoolPerformanceReport(
  rows: ReturnType<typeof buildSchoolComparison>,
  thresholds: Thresholds,
  remarks: string,
) {
  const label = (r: (typeof rows)[number]) => `${r.school.name} (${r.school.code || r.school.id})`;
  const levels = ["Strong", "Good", "Needs Attention", "Weak", "No data"];
  const colors = ["#059669", "#d97706", "#ea580c", "#dc2626", "#64748b"];
  return `<style>${analyticsStyles}</style><div class="va"><h2>School-wise Performance Report</h2>
    <p>All schools · ${rows.length} schools · highest to lowest average score</p>
    <p class="va-note">Based on linked Clicker assessment results. Average score is the mean of recorded score percentages (correct-answer score / assessment question count × 100). Average correct rate uses recorded Clicker percentages. Missing results are excluded from averages; schools without results remain visible as No data. Class and student-search filters do not narrow this school comparison.</p>
    <p class="va-muted">Performance colours: Strong ≥ ${thresholds.strong}%; Good ≥ ${thresholds.good}%; Needs Attention ≥ ${thresholds.attention}%; Weak below ${thresholds.attention}%. Categories use average score.</p>
    ${section(
      "Average score by school",
      bars(
        "Score percentage · 0–100%",
        rows.map((r) => ({
          name: label(r),
          value: r.score,
          color: classify(r.score, thresholds).color,
        })),
      ),
    )}
    ${section(
      "Correct rate by school",
      bars(
        "Correct-rate percentage · 0–100%",
        rows.map((r) => ({ name: label(r), value: r.rate })),
        "#0891b2",
      ),
    )}
    ${section(
      "Schools grouped by performance",
      bars(
        "Number of schools in each performance range",
        levels.map((name, i) => ({
          name,
          value: rows.filter((r) => classify(r.score, thresholds).status === name).length,
          color: colors[i],
        })),
        "#7c3aed",
        false,
      ),
    )}
    ${section(
      "Performance comparison",
      table(
        ["School", "Students", "Assessed", "Avg. score", "Correct rate", "Assessments", "Status"],
        rows.map((r) => [
          label(r),
          r.students,
          r.assessed,
          pct(r.score),
          pct(r.rate),
          r.assessments,
          classify(r.score, thresholds).status,
        ]),
      ),
    )}
    ${section("Teacher Remarks", `<div class="va-remarks">${escape(remarks || "Teacher / trainer remarks:")}</div>`)}</div>`;
}
