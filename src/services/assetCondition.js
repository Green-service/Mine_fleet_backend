function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function assessAssetCondition(asset) {
  let score = 100;
  const concerns = [];
  const strengths = [];

  const kmLeft = Number(asset.kmLeft ?? 0);
  const odometer = Number(asset.odometerKm ?? 0);
  const interval = Number(asset.serviceIntervalKm ?? 15000) || 15000;
  const kmSinceService = Math.max(0, interval - kmLeft);
  const intervalUsedPct = interval ? (kmSinceService / interval) * 100 : 0;
  const photoCount = Array.isArray(asset.photos) ? asset.photos.length : 0;
  const hasDriver = Boolean(asset.assignedDriver && asset.assignedDriver !== "Unassigned");

  if (asset.serviceStatus === "Overdue") {
    score -= 35;
    concerns.push("Service is overdue — book workshop immediately.");
  } else if (asset.serviceStatus === "Due Soon") {
    score -= 14;
    concerns.push("Service due within 1 500 km or two weeks.");
  } else {
    strengths.push(`Next service in ${kmLeft.toLocaleString("en-ZA")} km.`);
  }

  if (asset.status === "Workshop") {
    score -= 28;
    concerns.push("Vehicle is flagged in workshop.");
  } else if (asset.status === "Standby") {
    score -= 8;
    concerns.push("Asset on standby — not earning on the road.");
  } else if (asset.status === "Active") {
    strengths.push("Active on the register.");
  }

  if (intervalUsedPct >= 92) {
    score -= 10;
    concerns.push("Approaching end of current service interval.");
  }

  if (odometer >= 180000) {
    score -= 8;
    concerns.push("High odometer — watch wear items and fuel economy.");
  } else if (odometer <= 80000 && asset.serviceStatus === "Scheduled") {
    strengths.push("Moderate mileage for fleet age.");
  }

  if (photoCount === 0) {
    score -= 18;
    concerns.push("No condition photos on file.");
  } else if (photoCount >= 2) {
    score += 4;
    strengths.push(`${photoCount} condition photos documented.`);
  } else {
    strengths.push("One condition photo on file — add more for audit trail.");
  }

  if (!hasDriver) {
    score -= 6;
    concerns.push("No driver assigned.");
  } else if (asset.serviceStatus !== "Overdue" && asset.status === "Active") {
    strengths.push(`${asset.assignedDriver} assigned and accountable.`);
  }

  score = clampScore(score);

  let condition = "Excellent";
  if (score < 40) condition = "Critical";
  else if (score < 55) condition = "Poor";
  else if (score < 70) condition = "Fair";
  else if (score < 85) condition = "Good";

  const tone = score >= 85 ? "green" : score >= 70 ? "blue" : score >= 55 ? "amber" : "red";

  const headline = score >= 70
    ? `${asset.assetCode} is in ${condition.toLowerCase()} condition with minor follow-ups.`
    : `${asset.assetCode} needs attention before it is road-ready.`;

  return {
    score,
    condition,
    tone,
    headline,
    summary: concerns.length ? concerns[0] : strengths[0] || "No major flags on this asset.",
    strengths,
    concerns,
    assessedAt: new Date().toISOString(),
  };
}
