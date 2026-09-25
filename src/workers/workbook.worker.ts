import * as XLSX from "xlsx";
self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    const workbook = XLSX.read(event.data, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("That file has no readable sheet");
    self.postMessage({ rows: XLSX.utils.sheet_to_json(sheet, { defval: "" }) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Unable to read spreadsheet",
    });
  }
};
