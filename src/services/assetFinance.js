function num(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function money(value) {
  const n = num(value);
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function annualizeEntry(log) {
  if (String(log.entry_type || log.entryType || "income").toLowerCase() === "expense") {
    return { annualIncome: 0, annualDeductions: 0, annualNet: 0 };
  }
  const income = num(log.income);
  const deductions = num(log.deductions);
  const net = income - deductions;
  const type = String(log.period_type || log.periodType || "monthly").toLowerCase();
  if (type === "once") {
    return { annualIncome: 0, annualDeductions: 0, annualNet: 0, onceOff: true };
  }
  const factor = type === "weekly" ? 52 : 12;
  return {
    annualIncome: income * factor,
    annualDeductions: deductions * factor,
    annualNet: net * factor,
  };
}

export function projectFromLogs(logs = []) {
  const incomeLogs = logs.filter((row) => String(row.entry_type || row.entryType || "income").toLowerCase() !== "expense");
  const recurring = incomeLogs.filter((row) => {
    const type = String(row.period_type || row.periodType || "monthly").toLowerCase();
    return type === "weekly" || type === "monthly";
  });

  if (!recurring.length) {
    const hasOnceOff = incomeLogs.some((row) => String(row.period_type || row.periodType || "").toLowerCase() === "once");
    return {
      annualIncome: 0,
      annualDeductions: 0,
      annualNet: 0,
      annualIncomeLabel: money(0),
      annualDeductionsLabel: money(0),
      annualNetLabel: money(0),
      basis: hasOnceOff
        ? "Once-off income counts toward net logged but not the 12-month recurring forecast."
        : "Log weekly or monthly income to unlock a 12-month forecast.",
    };
  }

  const sorted = [...recurring].sort((a, b) => String(b.period_start || b.periodStart).localeCompare(String(a.period_start || a.periodStart)));
  const recent = sorted.slice(0, 6);
  const annualized = recent.map(annualizeEntry);
  const count = annualized.length;
  const annualIncome = annualized.reduce((sum, row) => sum + row.annualIncome, 0) / count;
  const annualDeductions = annualized.reduce((sum, row) => sum + row.annualDeductions, 0) / count;
  const annualNet = annualIncome - annualDeductions;
  const periodWord = recent[0]?.period_type === "weekly" || recent[0]?.periodType === "weekly" ? "weekly" : "monthly";

  return {
    annualIncome,
    annualDeductions,
    annualNet,
    annualIncomeLabel: money(annualIncome),
    annualDeductionsLabel: money(annualDeductions),
    annualNetLabel: money(annualNet),
    basis: `12-month estimate from the last ${count} ${periodWord} log${count === 1 ? "" : "s"}.`,
  };
}

export function buildAssetFinance(asset, logs = []) {
  const purchaseCost = num(asset.purchase_cost ?? asset.purchaseCost);
  const assetLogs = logs.filter((row) => (row.asset_id || row.assetId) === asset.id);
  const incomeLogs = assetLogs.filter((row) => String(row.entry_type || row.entryType || "income").toLowerCase() !== "expense");
  const expenseLogs = assetLogs.filter((row) => String(row.entry_type || row.entryType || "income").toLowerCase() === "expense");
  const totalIncome = incomeLogs.reduce((sum, row) => sum + num(row.income), 0);
  const periodDeductions = incomeLogs.reduce((sum, row) => sum + num(row.deductions), 0);
  const standaloneExpenses = expenseLogs.reduce((sum, row) => sum + num(row.deductions), 0);
  const totalDeductions = periodDeductions + standaloneExpenses;
  const netLogged = totalIncome - totalDeductions;
  const projection = projectFromLogs(incomeLogs);
  const recovered = netLogged;
  const remainingCost = Math.max(0, purchaseCost - recovered);
  const costRecoveryPct = purchaseCost > 0 ? Math.min(100, (recovered / purchaseCost) * 100) : 0;

  let profitStatus = "No cost set";
  let profitTone = "amber";
  if (purchaseCost > 0) {
    if (recovered >= purchaseCost) {
      profitStatus = "In profit";
      profitTone = "green";
    } else if (recovered > 0) {
      profitStatus = "Recovering cost";
      profitTone = "blue";
    } else {
      profitStatus = "Below cost";
      profitTone = "red";
    }
  } else if (netLogged > 0) {
    profitStatus = "Earning";
    profitTone = "green";
  }

  const monthlyNet = projection.annualNet / 12;
  const monthsToBreakEven = purchaseCost > 0 && monthlyNet > 0 && recovered < purchaseCost
    ? Math.ceil(remainingCost / monthlyNet)
    : null;

  return {
    purchaseCost,
    purchaseCostLabel: money(purchaseCost),
    totalIncome,
    totalIncomeLabel: money(totalIncome),
    totalDeductions,
    totalDeductionsLabel: money(totalDeductions),
    standaloneExpenses,
    standaloneExpensesLabel: money(standaloneExpenses),
    netLogged,
    netLoggedLabel: money(netLogged),
    remainingCost,
    remainingCostLabel: money(remainingCost),
    costRecoveryPct: Number(costRecoveryPct.toFixed(1)),
    profitStatus,
    profitTone,
    monthsToBreakEven,
    projection,
    logCount: assetLogs.length,
  };
}

export function buildBusinessRollup(assets, logs) {
  const byBusiness = new Map();
  for (const asset of assets) {
    const business = asset.business || "Unassigned";
    if (!byBusiness.has(business)) {
      byBusiness.set(business, { business, income: 0, deductions: 0, net: 0, projectedAnnualNet: 0, assets: 0 });
    }
    const finance = buildAssetFinance(asset, logs);
    const bucket = byBusiness.get(business);
    bucket.income += finance.totalIncome;
    bucket.deductions += finance.totalDeductions;
    bucket.net += finance.netLogged;
    bucket.projectedAnnualNet += finance.projection.annualNet;
    bucket.assets += 1;
  }

  return [...byBusiness.values()]
    .map((row) => ({
      ...row,
      incomeLabel: money(row.income),
      deductionsLabel: money(row.deductions),
      netLabel: money(row.net),
      projectedAnnualNetLabel: money(row.projectedAnnualNet),
    }))
    .sort((a, b) => b.net - a.net);
}

function isExpenseLog(row) {
  return String(row.entry_type || row.entryType || "income").toLowerCase() === "expense";
}

function logPeriodMonth(row) {
  const raw = row.period_start || row.periodStart || row.periodStartIso || "";
  const text = String(raw).trim();
  const iso = text.match(/^(\d{4}-\d{2})/);
  return iso ? iso[1] : "";
}

export function currentMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Month-to-date revenue and expenses per business name from asset logs. */
export function summarizeBusinessLogsMtd(logs = [], monthKey = currentMonthKey()) {
  const byBusiness = new Map();

  for (const row of logs) {
    if (logPeriodMonth(row) !== monthKey) continue;
    accumulateBusinessLog(byBusiness, row);
  }

  return byBusiness;
}

/** All-time logged income, costs and net per business — matches Log page roll-up. */
export function summarizeBusinessLogs(logs = []) {
  const byBusiness = new Map();

  for (const row of logs) {
    accumulateBusinessLog(byBusiness, row);
  }

  return byBusiness;
}

function accumulateBusinessLog(byBusiness, row) {
  const business = String(row.business || "Unassigned").trim() || "Unassigned";
  if (!byBusiness.has(business)) {
    byBusiness.set(business, { income: 0, expenses: 0 });
  }
  const bucket = byBusiness.get(business);
  if (isExpenseLog(row)) {
    bucket.expenses += num(row.amount ?? row.deductions);
  } else {
    bucket.income += num(row.income);
    bucket.expenses += num(row.deductions);
  }
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabelFromKey(key) {
  const match = String(key).match(/^(\d{4})-(\d{2})$/);
  if (!match) return key;
  return MONTH_LABELS[Number(match[2]) - 1] || key;
}

/** Last N months of portfolio revenue and expenses from asset logs (values in R thousands). */
export function buildTrendFromLogs(logs = [], monthCount = 6) {
  const byMonth = new Map();

  for (const row of logs) {
    const monthKey = logPeriodMonth(row);
    if (!monthKey) continue;
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, { revenue: 0, expenses: 0 });
    }
    const bucket = byMonth.get(monthKey);
    if (isExpenseLog(row)) {
      bucket.expenses += num(row.amount ?? row.deductions);
    } else {
      bucket.revenue += num(row.income);
      bucket.expenses += num(row.deductions);
    }
  }

  const sorted = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-monthCount);

  return {
    revenueTrend: sorted.map(([key, val]) => ({
      month: monthLabelFromKey(key),
      value: Number((val.revenue / 1000).toFixed(1)),
    })),
    expensesTrend: sorted.map(([key, val]) => ({
      month: monthLabelFromKey(key),
      value: Number((val.expenses / 1000).toFixed(1)),
    })),
    netTrend: sorted.map(([key, val]) => ({
      month: monthLabelFromKey(key),
      value: Number(((val.revenue - val.expenses) / 1000).toFixed(1)),
    })),
  };
}

function formatLogDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return text;
}

function logIsoDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${mm}-${dd}`;
}

/** Recent income and expense rows for business transaction registers. */
export function buildLogTransactions(logs = []) {
  return logs
    .map((row) => {
      const expense = isExpenseLog(row);
      const income = expense ? 0 : num(row.income);
      const expenseAmount = expense ? num(row.amount ?? row.deductions) : num(row.deductions);
      const iso = logIsoDate(row.period_start || row.periodStart);
      const label = String(row.notes || "").trim()
        || (expense ? row.category || "Expense" : "Income log");
      return {
        id: `log-${row.id}`,
        date: formatLogDate(iso),
        dateIso: iso,
        business: row.business || "",
        label,
        type: expense ? "Expense" : "Income",
        category: row.category || "",
        amount: expense ? -expenseAmount : income,
        amountLabel: money(expense ? expenseAmount : income),
        tone: expense ? "bad" : "good",
        source: "log",
      };
    })
    .sort((a, b) => String(b.dateIso).localeCompare(String(a.dateIso)));
}
