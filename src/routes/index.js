import { Router } from "express";
import { env } from "../config/env.js";
import { usingSupabase } from "../config/env.js";
import * as catalog from "../data/catalog.js";
import { insertRow } from "../services/store.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, supabase: usingSupabase, time: new Date().toISOString() });
});

router.post("/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (email === env.demoEmail.toLowerCase() && password === env.demoPassword) {
    return res.json({ token: "demo-session", user: catalog.sessionUser });
  }
  res.status(401).json({ error: "Invalid email or password" });
});

router.get("/session", (_req, res) => {
  res.json({ user: catalog.sessionUser, sites: catalog.sites, notifications: catalog.notifications, activity: catalog.activity });
});

router.get("/overview", (_req, res) => res.json(catalog.overview));

router.get("/production", (_req, res) => {
  res.json({
    summary: catalog.productionSummary,
    daily: catalog.productionDaily,
    machineHoursBlf: catalog.machineHoursBlf,
  });
});

router.post("/production", (req, res) => {
  const row = {
    date: new Date().toLocaleDateString("en-GB"),
    site: req.body.site || "GG",
    target: Number(req.body.target || 0),
    actual: Number(req.body.actual || 0),
    challenges: req.body.challenges || "Captured from hub",
  };
  catalog.productionDaily.unshift(row);
  res.status(201).json(row);
});

router.get("/fleet", (_req, res) => {
  res.json({ equipment: catalog.equipment, categories: catalog.fleetCategories });
});

router.get("/diesel", (_req, res) => {
  res.json({
    kpis: catalog.dieselKpis,
    byMachine: catalog.dieselByMachine,
    issues: catalog.dieselIssues,
    alerts: catalog.dieselAlerts,
    recon: catalog.dieselRecon,
  });
});

router.post("/diesel", (req, res) => {
  const litres = Number(req.body.litres || 0);
  const row = {
    date: new Date().toLocaleDateString("en-GB"),
    time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    site: req.body.site || "Grootegeluk",
    machine: req.body.machine || "",
    operator: req.body.operator || "",
    opening: Number(req.body.opening || 0),
    closing: Number(req.body.closing || 0),
    litres,
    approvedBy: "Pending",
  };
  catalog.dieselIssues.unshift(row);
  res.status(201).json(row);
});

router.get("/maintenance", (_req, res) => {
  res.json({
    workOrders: catalog.workOrders,
    attention: catalog.attentionMachines,
    servicePlan: catalog.servicePlan,
  });
});

router.get("/breakdowns", (_req, res) => res.json({ items: catalog.breakdowns }));

router.post("/breakdowns", (req, res) => {
  const row = {
    machine: req.body.machine,
    failure: req.body.failure,
    downtime: req.body.downtime || "Just reported",
    severity: req.body.severity || "Moderate",
    parts: req.body.parts || "TBC",
    status: "Investigation",
    site: req.body.site || "Grootegeluk",
  };
  catalog.breakdowns.unshift(row);
  res.status(201).json(row);
});

router.get("/safety", (_req, res) => {
  res.json({ kpis: catalog.safetyKpis, actions: catalog.safetyActions });
});

router.post("/safety", (req, res) => {
  const row = {
    source: req.body.source || "Incident",
    action: req.body.description || req.body.action,
    owner: req.body.owner || "SHEQ Department",
    due: req.body.due || "Open",
    status: "Open",
    priority: req.body.severity || "Medium",
  };
  catalog.safetyActions.unshift(row);
  res.status(201).json(row);
});

router.get("/hr", (_req, res) => {
  res.json({
    employees: catalog.employees,
    roles: catalog.roles,
    leave: catalog.leave,
    claims: catalog.claims,
  });
});

router.post("/hr/clock", (req, res) => {
  const row = {
    id: crypto.randomUUID(),
    name: req.body.name,
    number: req.body.number,
    title: "Manual entry",
    site: req.body.site,
    shift: req.body.shift,
    clockIn: req.body.clockIn || "—",
    clockOut: req.body.clockOut || "—",
    hours: "Pending",
    rate: 0,
    status: "Pending approval",
    role: "Plant Operator",
    salary: 0,
  };
  catalog.employees.unshift(row);
  res.status(201).json(row);
});

router.get("/procurement", (_req, res) => {
  res.json({ orders: catalog.purchaseOrders, requests: catalog.purchaseRequests });
});

router.post("/procurement/requests", (req, res) => {
  const row = {
    request: `PR-2026-${String(80 + catalog.purchaseRequests.length).padStart(3, "0")}`,
    department: req.body.department || "Engineering",
    machine: req.body.machine || "—",
    item: req.body.item,
    value: Number(req.body.value || 0),
    status: "Awaiting Approval",
  };
  catalog.purchaseRequests.unshift(row);
  res.status(201).json(row);
});

router.get("/finance", (_req, res) => {
  res.json({ kpis: catalog.financeKpis, machines: catalog.machineCosts });
});

router.get("/reports", (_req, res) => {
  res.json({
    packs: [
      { id: "exec", title: "Executive monthly report", blurb: "Availability, production, cost and SHEQ on one pack." },
      { id: "eng", title: "Engineering performance", blurb: "PM compliance, backlog and return-to-service." },
      { id: "prod", title: "Daily production report", blurb: "GG and Medupi target versus actual with challenges." },
      { id: "cost", title: "Machine cost report", blurb: "Top cost drivers by fleet number." },
      { id: "fuel", title: "Fuel consumption report", blurb: "Litres, L/hr and reconciliation exceptions." },
      { id: "sheq", title: "SHEQ performance report", blurb: "LTI, PTOs, actions and contractor files." },
      { id: "spares", title: "Critical spares report", blurb: "Stock-outs tied to open breakdowns." },
      { id: "supplier", title: "Supplier performance", blurb: "PO ageing, delivery and close-out." },
    ],
  });
});

void insertRow;
