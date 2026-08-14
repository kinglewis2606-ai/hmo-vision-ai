const data = await res.json();

if (!data.success) {
  alert(data.error || "Analysis failed");
  return;
}

const parsedReport =
  typeof data.result === "string"
    ? JSON.parse(
        data.result
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "")
      )
    : data.result;

setReport(parsedReport);
