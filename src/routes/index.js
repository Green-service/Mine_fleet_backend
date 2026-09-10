import { Router } from "express";
import { usingSupabase } from "../config/env.js";
import { persistenceStatus } from "../services/store.js";
import { storageStatus } from "../services/storageService.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import {
  createRole, inviteUser, listRoles, listUsers, removeRole, revokeUser, updateRole, updateUser,
} from "../services/rolesService.js";
import { ccma, clockEmployee, disciplinary, getHrData, increases, listManpowerTotals, manpower, promotions, recruitment } from "../services/hrService.js";
import { mountCollection } from "./collectionRoutes.js";
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
import { businessesRouter } from "./businesses.js";
import { assetsRouter } from "./assets.js";
import { driversRouter } from "./drivers.js";
import { logRouter } from "./log.js";
import { documentsRouter } from "./documents.js";
import { referenceRouter } from "./reference.js";
import { dashboardRouter } from "./dashboard.js";
import { listActivity, listNotifications, listSites } from "../services/inboxService.js";

export const router = Router();

router.use("/auth", authRouter);

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    supabase: usingSupabase,
    storage: storageStatus(),
    persistence: persistenceStatus(),
    time: new Date().toISOString(),
  });
});

router.use(requireAuth);

router.get("/session", async (req, res, next) => {
  try {
    const [notifications, activity, sites] = await Promise.all([
      listNotifications(),
      listActivity(),
      listSites(),
    ]);
    res.json({ user: req.actor, sites, notifications, activity });
  } catch (err) {
    next(err);
  }
});

router.use("/overview", overviewRouter);
router.use("/dashboard", dashboardRouter);
router.use("/businesses", businessesRouter);
router.use("/assets", assetsRouter);
router.use("/drivers", driversRouter);
router.use("/log", logRouter);
router.use("/documents", documentsRouter);

router.use("/production", productionRouter);
router.use("/fleet", fleetRouter);
router.use("/diesel", dieselRouter);
router.use("/maintenance", maintenanceRouter);
router.use("/breakdowns", breakdownsRouter);
router.use("/safety", safetyRouter);
router.use("/procurement", procurementRouter);
router.use("/finance", financeRouter);
router.use("/settings", settingsRouter);
router.use("/reference", referenceRouter);

router.get("/hr", async (_req, res, next) => {
  try {
    const [roles, users] = await Promise.all([listRoles(), listUsers()]);
    const invites = users.filter((u) => !u.locked);
    res.json(await getHrData({ roles, invites, users }));
  } catch (err) {
    next(err);
  }
});

router.post("/hr/roles", requirePermission("hr", "create"), async (req, res, next) => {
  try {
    res.status(201).json(await createRole(req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.patch("/hr/roles/:id", requirePermission("hr", "edit"), async (req, res, next) => {
  try {
    res.json(await updateRole(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.delete("/hr/roles/:id", requirePermission("hr", "delete"), async (req, res, next) => {
  try {
    res.json(await removeRole(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch("/hr/users/:id", requirePermission("hr", "edit"), async (req, res, next) => {
  try {
    res.json(await updateUser(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.delete("/hr/users/:id", requirePermission("hr", "delete"), async (req, res, next) => {
  try {
    res.json(await revokeUser(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/hr/invites", requirePermission("hr", "create"), async (req, res, next) => {
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

router.get("/hr/manpower-totals", async (_req, res, next) => {
  try {
    res.json(await listManpowerTotals());
  } catch (err) {
    next(err);
  }
});

mountCollection(router, "/hr/manpower", manpower);
mountCollection(router, "/hr/recruitment", recruitment);
mountCollection(router, "/hr/increases", increases);
mountCollection(router, "/hr/promotions", promotions);
mountCollection(router, "/hr/disciplinary", disciplinary);
mountCollection(router, "/hr/ccma", ccma);

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
