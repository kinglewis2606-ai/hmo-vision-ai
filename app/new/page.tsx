const data = await res.json();

if (!data.success) {
  alert(data.error || "Analysis failed");
  return;
}

setReport(data.result);