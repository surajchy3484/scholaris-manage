import {
  classify,
  buildSchoolComparison,
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
  const overviewLabel = options.student
    ? "Student Overview"
    : options.classLabel === "All classes"
      ? "School Overview"
      : "Class Overview";
  let body = `<style>${analyticsStyles}</style><div class="va"><h2>Student Performance Report</h2><p><b>${escape(options.school)}</b> · ${escape(options.classLabel)}${options.student && view.students[0] ? ` · ${escape(view.students[0].name)}` : ""}</p>`;
  body += section(`1. ${overviewLabel}`, stats(view.summary));
  if (options.student)
    body += section(
      "Question Details",
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
    "2. Teacher Remarks",
    `<div class="va-remarks">${escape(options.remarks || "Teacher / trainer remarks:")}</div>`,
  );
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
