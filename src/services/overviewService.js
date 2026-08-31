import * as catalog from "../data/catalog.js";
import { readTable } from "./store.js";
import { mapBusiness, readBusinessRows } from "./businessesService.js";
import {
  buildLogTransactions,
  buildTrendFromLogs,
  summarizeBusinessLogs,
} from "./assetFinance.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function monthLabel(key) {
  const match = String(key).match(/^(\d{4})-(\d{2})$/);
  if (!match) return key;
  return MONTHS[Number(match[2]) - 1] || key;
}

function compactMoney(value) {
  const n = num(value);
  if (!n) return "R 0";
  if (Math.abs(n) >= 1_000_000) return `R ${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R ${Math.round(n / 1000)}k`;
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function money(value) {
  const n = num(value);
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function marginPct(revenue, expenses) {
  if (!revenue) return 0;
  return Number((((revenue - expenses) / revenue) * 100).toFixed(1));
}

function toneForMargin(value) {
  if (value >= 25) return "good";
  if (value >= 10) return "warn";
  if (value > 0) return "warn";
  return "bad";
}

function toneForProfit(value) {
  if (value > 0) return "good";
  if (value === 0) return "warn";
  return "bad";
}

async function readBusinesses() {
  return readBusinessRows();
}

async function readTransactions() {
  return readTable("business_transactions", catalog.businessTransactions);
}

async function readMonthlyTrend() {
  return readTable("business_monthly_trend", catalog.businessMonthlyTrend);
}

function buildKpis(businesses) {
  const revenue = businesses.reduce((sum, row) => sum + row.revenueMtd, 0);
  const expenses = businesses.reduce((sum, row) => sum + row.expensesMtd, 0);
  const net = revenue - expenses;
  const cash = businesses.reduce((sum, row) => sum + row.cashBalance, 0);
  const active = businesses.filter((row) => row.status === "Active").length;
  const portfolioMargin = marginPct(revenue, expenses);

  return [
    {
      key: "revenue",
      label: "Portfolio revenue",
      value: compactMoney(revenue),
      hint: "Logged income across all ventures",
      tone: revenue ? "good" : "warn",
    },
    {
      key: "expenses",
      label: "Portfolio expenses",
      value: compactMoney(expenses),
      hint: "Operating costs MTD",
      tone: "warn",
    },
    {
      key: "net",
      label: "Net profit",
      value: compactMoney(net),
      hint: "After logged expenses and deductions",
      tone: toneForProfit(net),
    },
    {
      key: "cash",
      label: "Cash on hand",
      value: compactMoney(cash),
      hint: "Balances across business accounts",
      tone: cash >= 100000 ? "good" : "blue",
    },
    {
      key: "active",
      label: "Active businesses",
      value: String(active),
      hint: `${businesses.length} in portfolio`,
      tone: "navy",
    },
    {
      key: "businessesNet",
      label: "Total businesses net",
      value: compactMoney(businesses.reduce((sum, row) => sum + row.netMtd, 0)),
      hint: `Combined net MTD across ${businesses.length} ventures`,
      tone: toneForProfit(businesses.reduce((sum, row) => sum + row.netMtd, 0)),
    },
  ];
}

function buildOverviewTrend(logRows, monthlyRows) {
  const fromLogs = buildTrendFromLogs(logRows);
  const hasLogTrend = fromLogs.revenueTrend.some((row) => row.value > 0)
    || fromLogs.expensesTrend.some((row) => row.value > 0);
  if (hasLogTrend) return fromLogs;
  return buildTrend(monthlyRows);
}

function buildTrend(monthlyRows) {
  const rows = monthlyRows.length ? monthlyRows : [];
  const revenueTrend = rows.map((row) => ({
    month: monthLabel(row.month_key ?? row.monthKey),
    value: Number((num(row.revenue) / 1000).toFixed(1)),
  }));
  const expensesTrend = rows.map((row) => ({
    month: monthLabel(row.month_key ?? row.monthKey),
    value: Number((num(row.expenses) / 1000).toFixed(1)),
  }));
  const netTrend = rows.map((row) => ({
    month: monthLabel(row.month_key ?? row.monthKey),
    value: Number(((num(row.revenue) - num(row.expenses)) / 1000).toFixed(1)),
  }));
  return { revenueTrend, expensesTrend, netTrend };
}

function applyLogTotals(business, totalsByBusiness) {
  const totals = totalsByBusiness.get(business.name);
  if (!totals) {
    return {
      ...business,
      logSynced: false,
    };
  }
  const income = totals.income;
  const expenses = totals.expenses;
  const net = income - expenses;
  const margin = marginPct(income, expenses);
  return {
    ...business,
    revenueMtd: income,
    expensesMtd: expenses,
    netMtd: net,
    marginPct: margin,
    revenueLabel: money(income),
    expensesLabel: money(expenses),
    netLabel: money(net),
    marginLabel: `${margin.toFixed(1)}%`,
    loggedIncome: income,
    loggedExpenses: expenses,
    netLogged: net,
    logSynced: true,
  };
}

function buildTransactions(transactions, businesses, logTransactions = []) {
  const byId = Object.fromEntries(businesses.map((row) => [row.id, row.name]));
  const manual = transactions
    .map((row) => ({
      id: row.id,
      date: row.date,
      dateIso: row.date,
      business: byId[row.business_id ?? row.businessId] || "—",
      label: row.label,
      type: row.type,
      category: row.category,
      amount: num(row.amount),
      amountLabel: money(Math.abs(num(row.amount))),
      tone: num(row.amount) >= 0 ? "good" : "bad",
      source: "manual",
    }));

  return [...logTransactions, ...manual]
    .sort((a, b) => String(b.dateIso || b.date).localeCompare(String(a.dateIso || a.date)));
}

function buildAlerts(businesses) {
  const alerts = [];
  for (const row of businesses) {
    if (row.status === "Setup") {
      alerts.push({
        id: `alert-setup-${row.id}`,
        tone: "due",
        title: `${row.name} still in setup`,
        detail: row.note || "No revenue captured yet for this venture.",
      });
    }
    if (row.revenueMtd > 0 && row.marginPct < 15) {
      alerts.push({
        id: `alert-margin-${row.id}`,
        tone: "critical",
        title: `${row.name} margin below 15%`,
        detail: `${row.marginLabel} after ${row.expensesLabel} expenses MTD.`,
      });
    }
  }
  return alerts.slice(0, 6);
}

export async function getOverview() {
  const [businessRows, transactionRows, monthlyRows, logRows] = await Promise.all([
    readBusinesses(),
    readTransactions(),
    readMonthlyTrend(),
    readTable("asset_logs", catalog.assetLogs),
  ]);

  const totalsByBusiness = summarizeBusinessLogs(logRows);
  const logTransactions = buildLogTransactions(logRows);

  const businesses = businessRows
    .map((row) => applyLogTotals(mapBusiness(row), totalsByBusiness))
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return b.netMtd - a.netMtd;
    });

  const { revenueTrend, expensesTrend, netTrend } = buildOverviewTrend(logRows, monthlyRows);

  return {
    kpis: buildKpis(businesses),
    businesses,
    logBasis: "asset_logs",
    revenueTrend,
    expensesTrend,
    netTrend,
    transactions: buildTransactions(transactionRows, businesses, logTransactions),
    alerts: buildAlerts(businesses),
  };
}
