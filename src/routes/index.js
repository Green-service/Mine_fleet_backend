import { Router } from "express";
import { env, usingSupabase } from "../config/env.js";
import { persistenceStatus } from "../services/store.js";
import { storageStatus } from "../services/storageService.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import {
  createRole, inviteUser, listRoles, listUsers, removeRole, revokeUser, updateRole, updateUser,
} from "../services/rolesService.js";
import {
  ccma, claims, clockEmployee, disciplinary, employees, getHrData, increases, leave,
  listManpowerTotals, manpower, promotions, recruitment, hrActionTracker,
} from "../services/hrService.js";
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
import { reportsRouter } from "./reports.js";
import { referenceRouter } from "./reference.js";
import { dashboardRouter } from "./dashboard.js";
import { listActivity, listNotifications, listSites } from "../services/inboxService.js";

export const router = Router();

router.use("/auth", authRouter);

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    supabase: usingSupabase,
    supabaseHost: usingSupabase ? new URL(env.supabaseUrl).hostname : null,
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
mountCollection(router, "/hr/action-tracker", hrActionTracker);
mountCollection(router, "/hr/recruitment", recruitment);
mountCollection(router, "/hr/increases", increases);
mountCollection(router, "/hr/promotions", promotions);
mountCollection(router, "/hr/disciplinary", disciplinary);
mountCollection(router, "/hr/ccma", ccma);
mountCollection(router, "/hr/employees", employees);
mountCollection(router, "/hr/leave", leave);
mountCollection(router, "/hr/claims", claims);

router.use("/reports", reportsRouter);
