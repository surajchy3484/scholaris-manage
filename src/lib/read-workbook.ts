/** Transfer parsing to a short-lived worker so large imports do not block navigation. */
export async function readWorkbook(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/workbook.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Spreadsheet parsing timed out. Split the file into smaller batches."));
    }, 120_000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = ({ data }) => {
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.rows);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Unable to read spreadsheet. Check the file and retry."));
    };
    worker.postMessage(buffer, [buffer]);
  });
}
