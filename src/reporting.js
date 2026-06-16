const reportHeaders = [
  "rank",
  "hotspotId",
  "station",
  "area",
  "impactScore",
  "window",
  "action",
  "reason",
  "violations",
  "pcuObstruction",
  "peakShare",
  "junctionShare",
  "lat",
  "lng",
];

export function reportRows(data) {
  const hotspotById = new Map(data.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  return data.enforcementPlan.map((item) => {
    const hotspot = hotspotById.get(item.hotspotId);
    return {
      rank: item.rank,
      hotspotId: item.hotspotId,
      station: item.station,
      area: item.area,
      impactScore: item.impactScore,
      window: item.window,
      action: item.action,
      reason: item.why,
      violations: hotspot?.violations ?? "",
      pcuObstruction: hotspot ? Math.round(hotspot.weightedObstruction) : "",
      peakShare: hotspot ? `${Math.round(hotspot.peakShare * 100)}%` : "",
      junctionShare: hotspot ? `${Math.round(hotspot.junctionShare * 100)}%` : "",
      lat: item.lat,
      lng: item.lng,
    };
  });
}

export function buildCsvText(data) {
  const rows = reportRows(data);
  return [
    reportHeaders.join(","),
    ...rows.map((row) => reportHeaders.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
}

export function downloadCsvReport(data) {
  saveBlob(new Blob([buildCsvText(data)], { type: "text/csv;charset=utf-8" }), "parksight-enforcement-report.csv");
}

export async function createPdfDocument(data) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const rows = reportRows(data);
  const margin = 42;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let y = 46;

  const addText = (text, x, options = {}) => {
    const { size = 10, weight = "normal", color = [23, 32, 42], maxWidth = width - margin * 2, lineGap = 4 } = options;
    doc.setFont("helvetica", weight);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text), maxWidth);
    doc.text(lines, x, y);
    y += lines.length * (size + lineGap);
  };

  const ensurePage = (space = 80) => {
    if (y + space < height - margin) return;
    doc.addPage();
    y = margin;
  };

  doc.setFillColor(4, 117, 111);
  doc.roundedRect(margin, 30, width - margin * 2, 74, 8, 8, "F");
  y = 57;
  addText("ParkSight AI Enforcement Brief", margin + 18, { size: 20, weight: "bold", color: [255, 255, 255], maxWidth: width - 120 });
  addText(`${data.summary.dateRange.start} to ${data.summary.dateRange.end} | ${data.summary.totalViolations.toLocaleString("en-IN")} violations analyzed`, margin + 18, {
    size: 10,
    color: [225, 247, 240],
  });
  y = 132;

  addText("Executive Signal", margin, { size: 14, weight: "bold" });
  addText(
    `Top priority: ${data.hotspots[0].area} (${data.hotspots[0].station}) with impact score ${data.hotspots[0].impactScore}. The plan below prioritizes ${data.enforcementPlan.length} enforcement beats based on congestion impact, not just violation volume.`,
    margin,
    { size: 10, color: [80, 91, 105], lineGap: 5 },
  );

  const metrics = [
    ["Scored cells", data.summary.cellsAnalyzed.toLocaleString("en-IN")],
    ["Junction-linked", `${Math.round(data.summary.junctionLinkedShare * 100)}%`],
    ["Peak-hour share", `${Math.round(data.summary.peakHourShare * 100)}%`],
    ["Top station", data.summary.topStation],
  ];
  y += 6;
  metrics.forEach(([label, value], index) => {
    const x = margin + (index % 2) * 255;
    if (index === 2) y += 54;
    doc.setFillColor(244, 248, 245);
    doc.roundedRect(x, y, 235, 38, 6, 6, "F");
    doc.setTextColor(101, 112, 125);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), x + 12, y + 14);
    doc.setTextColor(23, 32, 42);
    doc.setFontSize(13);
    doc.text(String(value), x + 12, y + 31);
  });
  y += 68;

  addText("Deployable Enforcement Beats", margin, { size: 14, weight: "bold" });
  y += 4;
  rows.forEach((row) => {
    ensurePage(92);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, width - margin * 2, 76, 6, 6, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(4, 117, 111);
    doc.text(`#${row.rank} ${row.area}`, margin + 12, y + 18);
    doc.setTextColor(23, 32, 42);
    doc.text(`${row.station} | ${row.window} | Score ${row.impactScore}`, margin + 12, y + 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 91, 105);
    const reasonLines = doc.splitTextToSize(`${row.action}. ${row.reason}`, width - margin * 2 - 24);
    doc.text(reasonLines.slice(0, 2), margin + 12, y + 50);
    y += 88;
  });

  ensurePage(100);
  addText("Method Note", margin, { size: 14, weight: "bold" });
  addText(data.method.index, margin, { size: 9, color: [80, 91, 105], lineGap: 5 });
  return doc;
}

export async function downloadPdfReport(data) {
  const doc = await createPdfDocument(data);
  doc.save("parksight-enforcement-brief.pdf");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
