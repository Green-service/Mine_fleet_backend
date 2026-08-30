import { Router } from "express";
import { usingSupabase } from "../config/env.js";
import { persistenceStatus } from "../services/store.js";
import { inviteUser, listHubUsers, publicInvite, refreshRoleUserCounts, revokeHubUser, updateHubUser } from "../services/inviteService.js";
import { clockEmployee, getHrData } from "../services/hrService.js";
import * as catalog from "../data/catalog.js";
import { authRouter } from "./auth.js";
import { productionRouter } from "./production.js";
import { fleetRouter } from "./fleet.js";
import { dieselRouter } from "./diesel.js";
import { maintenanceRouter } from "./maintenance.js";
import { breakdownsRouter } from "./breakdowns.js";
import { safetyRouter } from "./safety.js";
import { procurementRouter } from "./procurement.js";
import { financeRouter } from "./finance.js";
import { settingsRouter } from "./settings.js";
import { overviewRouter } from "./overview.js";

export const router = Router();

router.use("/auth", authRouter);

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    supabase: usingSupabase,
    persistence: persistenceStatus(),
    time: new Date().toISOString(),
  });
});

router.get("/session", (_req, res) => {
  res.json({ user: catalog.sessionUser, sites: catalog.sites, notifications: catalog.notifications, activity: catalog.activity });
});

router.use("/overview", overviewRouter);

router.use("/production", productionRouter);
router.use("/fleet", fleetRouter);
router.use("/diesel", dieselRouter);
router.use("/maintenance", maintenanceRouter);
router.use("/breakdowns", breakdownsRouter);
router.use("/safety", safetyRouter);
router.use("/procurement", procurementRouter);
router.use("/finance", financeRouter);
router.use("/settings", settingsRouter);

router.get("/hr", async (_req, res, next) => {
  try {
    refreshRoleUserCounts();
    res.json(
      await getHrData({
        roles: catalog.roles,
        invites: catalog.invitedUsers.map(publicInvite),
        users: listHubUsers(),
      }),
    );
  } catch (err) {
    next(err);
  }
});

function nextRoleCode(roles) {
  const used = roles
    .map((role) => Number(String(role.code || "").replace(/^R/i, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return `R${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

router.post("/hr/roles", (req, res) => {
  const row = {
    id: crypto.randomUUID(),
    code: req.body.code || nextRoleCode(catalog.roles),
    name: req.body.name,
    slug: req.body.slug,
    category: req.body.category || "Operations",
    description: req.body.description,
    users: 0,
    modules: req.body.modules || 0,
    status: req.body.status || "Active",
    permissions: req.body.permissions || {},
    employees: [],
  };
  catalog.roles.push(row);
  res.status(201).json(row);
});

router.patch("/hr/roles/:id", (req, res) => {
  const role = catalog.roles.find((item) => item.id === req.params.id);
  if (!role) return res.status(404).json({ error: "Role not found" });
  Object.assign(role, {
    code: req.body.code ?? role.code,
    name: req.body.name ?? role.name,
    slug: req.body.slug ?? role.slug,
    description: req.body.description ?? role.description,
    status: req.body.status ?? role.status,
    permissions: req.body.permissions ?? role.permissions,
    modules: req.body.modules ?? role.modules,
  });
  res.json(role);
});

router.delete("/hr/roles/:id", (req, res) => {
  const index = catalog.roles.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Role not found" });
  if (catalog.roles[index].slug === "super-admin") {
    return res.status(400).json({ error: "Super Admin cannot be removed." });
  }
  catalog.roles.splice(index, 1);
  res.json({ ok: true });
});

router.patch("/hr/users/:id", (req, res, next) => {
  try {
    res.json(updateHubUser(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.delete("/hr/users/:id", (req, res, next) => {
  try {
    res.json(revokeHubUser(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/hr/invites", async (req, res, next) => {
  try {
    const row = await inviteUser({
      name: req.body.name,
      email: req.body.email,
      role: req.body.role,
      site: req.body.site,
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.post("/hr/clock", async (req, res, next) => {
  try {
    res.status(201).json(await clockEmployee(req.body || {}));
  } catch (err) {
    next(err);
  }
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
