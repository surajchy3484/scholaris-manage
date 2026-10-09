export type ImportSource = { file: string; row: number; fileIndex: number };
export type ImportFileSummary = { name: string; rows: number };

/** Read one workbook at a time; validate the combined rows before any upload. */
export async function readImportFiles<T>(
  files: File[],
  read: (file: File) => Promise<T[]>,
  onProgress?: (message: string) => void,
) {
  if (!files.length) throw new Error("Choose at least one spreadsheet");
  const rows: T[] = [];
  const sources: ImportSource[] = [];
  const summaries: ImportFileSummary[] = [];
  const seen = new Set<string>();
  for (const [index, file] of files.entries()) {
    if (!/\.(xlsx?|csv)$/i.test(file.name))
      throw new Error(`${file.name}: Choose an .xlsx, .xls or .csv file`);
    const identity = JSON.stringify([file.name, file.size, file.lastModified]);
    if (seen.has(identity)) throw new Error(`${file.name}: The same file was selected twice`);
    seen.add(identity);
    onProgress?.(`Reading ${index + 1} of ${files.length}: ${file.name}`);
    let data: T[];
    try {
      data = await read(file);
    } catch (error) {
      throw new Error(
        `${file.name}: ${error instanceof Error ? error.message : "Unable to read file"}`,
      );
    }
    if (!data.length)
      throw new Error(
        `${file.name}: No data rows. Remove the empty file and choose the files again.`,
      );
    summaries.push({ name: file.name, rows: data.length });
    data.forEach((row, i) => {
      rows.push(row);
      sources.push({ file: file.name, row: i + 2, fileIndex: index });
    });
  }
  return { rows, sources, summaries };
}
