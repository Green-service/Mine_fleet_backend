import * as catalog from "../data/catalog.js";
import * as ref from "../data/referenceCatalog.js";
import { insertRow, readTable } from "./store.js";
import { makeCollection, num as cnum, optStr, str } from "./collectionService.js";

function num(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toEmployee(row) {
  return {
    id: row.id,
    name: row.full_name || row.name || "",
    number: row.employee_no || row.number || "",
    title: row.title || "Manual entry",
    site: row.site || "Grootegeluk",
    shift: row.shift || "Day",
    clockIn: row.clock_in || row.clockIn || "—",
    clockOut: row.clock_out || row.clockOut || "—",
    hours: row.hours_label || row.hours || "0.0",
    rate: num(row.hourly_rate ?? row.rate),
    status: row.status || "Pending approval",
    role: row.role || row.role_slug || "Plant Operator",
    salary: num(row.salary),
  };
}

function toLeave(row) {
  return {
    id: row.id,
    employee: row.employee || "",
    type: row.leave_type || row.type || "",
    from: row.from_date || row.from || "",
    to: row.to_date || row.to || "",
    days: num(row.days),
    status: row.status || "Pending",
  };
}

function toClaim(row) {
  return {
    id: row.id,
    ref: row.ref || "",
    employee: row.employee || "",
    type: row.claim_type || row.type || "",
    amount: num(row.amount),
    status: row.status || "Pending",
  };
}

function buildSummary(employees, leave, claims, roles) {
  const present = employees.filter((row) => ["Present", "On Shift", "Late"].includes(row.status)).length;
  const onLeave = leave.filter((row) => row.status === "Approved").length;
  const pendingClaims = claims.filter((row) => row.status === "Pending").length;
  const monthlyPayroll = employees.reduce((sum, row) => {
    const hours = num(row.hours);
    return sum + hours * num(row.rate);
  }, 0);
  return {
    teamCount: employees.length,
    present,
    onLeave,
    pendingClaims,
    monthlyPayroll,
    activeRoles: roles.filter((row) => row.status === "Active").length,
  };
}

async function readEmployees() {
  return employees.list();
}

async function readLeave() {
  return leave.list();
}

async function readClaims() {
  return claims.list();
}

export async function getHrData({ roles, invites, users }) {
  const employees = await readEmployees();
  const leave = await readLeave();
  const claims = await readClaims();
  return {
    employees,
    roles,
    leave,
    claims,
    invites,
    users,
    sites: catalog.siteNames,
    defaultSite: catalog.defaultSiteName,
    summary: buildSummary(employees, leave, claims, roles),
  };
}

export async function clockEmployee(body) {
  const name = String(body.name || "").trim();
  const number = String(body.number || "").trim().toUpperCase();
  if (!name || !number) {
    const err = new Error("Employee number and name are required.");
    err.status = 400;
    throw err;
  }
  const payload = {
    full_name: name,
    employee_no: number,
    title: "Manual entry",
    site: String(body.site || "Grootegeluk").trim(),
    shift: String(body.shift || "Day Shift").trim(),
    clock_in: body.clockIn || "—",
    clock_out: body.clockOut || "—",
    hours_label: "Pending",
    hourly_rate: 0,
    status: "Pending approval",
    role_slug: "plant-operator",
  };
  const saved = await insertRow("employees", payload, catalog.employees);
  const row = toEmployee({ ...payload, ...saved });
  Object.assign(saved, row);
  return row;
}

// ---------------------------------------------------------------------------
// Employees, leave and claims registers
// ---------------------------------------------------------------------------

function employeePayload(input, previous = {}) {
  const name = str(input.name, previous.full_name);
  const number = str(input.number, previous.employee_no).toUpperCase();
  if (!name || !number) {
    const err = new Error("Employee number and name are required.");
    err.status = 400;
    throw err;
  }
  return {
    full_name: name,
    employee_no: number,
    title: optStr(input.title, previous.title) || "Manual entry",
    site: optStr(input.site, previous.site) || "Grootegeluk",
    shift: optStr(input.shift, previous.shift) || "Day",
    hourly_rate: cnum(input.rate ?? previous.hourly_rate),
    status: optStr(input.status, previous.status) || "Pending approval",
    role_slug: optStr(input.role, previous.role_slug) || "plant-operator",
  };
}
export const employees = makeCollection("employees", catalog.employees, { toRow: toEmployee, toPayload: employeePayload });

function leavePayload(input, previous = {}) {
  const employee = str(input.employee, previous.employee);
  if (!employee) {
    const err = new Error("Enter an employee name.");
    err.status = 400;
    throw err;
  }
  return {
    employee,
    leave_type: optStr(input.type, previous.leave_type) || "Annual",
    from_date: optStr(input.from, previous.from_date),
    to_date: optStr(input.to, previous.to_date),
    days: cnum(input.days ?? previous.days),
    status: optStr(input.status, previous.status) || "Pending",
  };
}
export const leave = makeCollection("leave_requests", catalog.leave, { toRow: toLeave, toPayload: leavePayload });

function claimPayload(input, previous = {}) {
  const employee = str(input.employee, previous.employee);
  if (!employee) {
    const err = new Error("Enter an employee name.");
    err.status = 400;
    throw err;
  }
  return {
    ref: optStr(input.ref, previous.ref) || `CLM-${Date.now().toString(36).toUpperCase()}`,
    employee,
    claim_type: optStr(input.type, previous.claim_type) || "General",
    amount: cnum(input.amount ?? previous.amount),
    status: optStr(input.status, previous.status) || "Pending",
  };
}
export const claims = makeCollection("claims", catalog.claims, { toRow: toClaim, toPayload: claimPayload });

// ---------------------------------------------------------------------------
// Static/historical registers migrated off local component state
// ---------------------------------------------------------------------------

function manpowerRow(row) {
  return { id: row.id, area: row.area, role: row.role, budget: row.budget, actual: row.actual, variance: row.variance, reliefs: row.reliefs, status: row.status, comments: row.comments };
}
function manpowerPayload(input, previous = {}) {
  const area = str(input.area, previous.area);
  const role = str(input.role, previous.role);
  if (!area || !role) {
    const err = new Error("Enter an area and role.");
    err.status = 400;
    throw err;
  }
  const budget = cnum(input.budget ?? previous.budget);
  const actual = cnum(input.actual ?? previous.actual);
  const variance = budget - actual;
  return {
    area, role, budget, actual, variance,
    reliefs: cnum(input.reliefs ?? previous.reliefs),
    status: variance > 0 ? "Vacancy" : "Filled",
    comments: optStr(input.comments, previous.comments),
  };
}
export const manpower = makeCollection("hr_manpower", ref.hrManpower, { toRow: manpowerRow, toPayload: manpowerPayload });

export async function listManpowerTotals() {
  const rows = await manpower.list();
  const byArea = new Map();
  rows.forEach((row) => {
    const key = String(row.area || "").replace(/\s*(Total)?$/i, "").trim() || row.area;
    const bucket = byArea.get(key) || { area: `${key} Total`, role: "All roles", budget: 0, actual: 0, variance: 0, comments: "Labour requirements summary" };
    bucket.budget += cnum(row.budget);
    bucket.actual += cnum(row.actual);
    bucket.variance += cnum(row.variance);
    byArea.set(key, bucket);
  });
  return [...byArea.values()].map((row) => ({ ...row, status: row.variance > 0 ? `${row.variance} Gap${row.variance === 1 ? "" : "s"}` : "On Target" }));
}

function recruitmentRow(row) {
  return { id: row.id, site: row.site, team: row.team, position: row.position, name: row.candidate_name, status: row.status, medical: row.medical };
}
function recruitmentPayload(input, previous = {}) {
  const site = str(input.site, previous.site);
  const position = str(input.position, previous.position);
  if (!site || !position) {
    const err = new Error("Enter a site and position.");
    err.status = 400;
    throw err;
  }
  return {
    site, position,
    team: optStr(input.team, previous.team),
    candidate_name: optStr(input.name, previous.name),
    status: optStr(input.status, previous.status) || "Vacant",
    medical: optStr(input.medical, previous.medical),
  };
}
export const recruitment = makeCollection("hr_recruitment", ref.hrRecruitment, { toRow: recruitmentRow, toPayload: recruitmentPayload });

function increaseRow(row) {
  return { id: row.id, employee: row.employee, employeeId: row.employee_code, department: row.department, title: row.title, date: row.work_date, pct: row.pct, reason: row.reason, approvedBy: row.approved_by };
}
function increasePayload(input, previous = {}) {
  const employee = str(input.employee, previous.employee);
  if (!employee) {
    const err = new Error("Enter an employee name.");
    err.status = 400;
    throw err;
  }
  return {
    employee,
    employee_code: optStr(input.id, previous.employeeId),
    department: optStr(input.department, previous.department),
    title: optStr(input.title, previous.title),
    work_date: optStr(input.date, previous.date),
    pct: optStr(input.pct, previous.pct),
    reason: optStr(input.reason, previous.reason),
    approved_by: optStr(input.approvedBy, previous.approvedBy),
  };
}
export const increases = makeCollection("hr_increases", ref.hrIncreases, { toRow: increaseRow, toPayload: increasePayload });

function promotionRow(row) {
  return { id: row.id, employee: row.employee, employeeId: row.employee_code, department: row.department, oldTitle: row.old_title, newTitle: row.new_title, date: row.work_date, pct: row.pct, approvedBy: row.approved_by };
}
function promotionPayload(input, previous = {}) {
  const employee = str(input.employee, previous.employee);
  const newTitle = str(input.newTitle, previous.newTitle);
  if (!employee || !newTitle) {
    const err = new Error("Enter an employee and new job title.");
    err.status = 400;
    throw err;
  }
  return {
    employee, new_title: newTitle,
    employee_code: optStr(input.id, previous.employeeId),
    department: optStr(input.department, previous.department),
    old_title: optStr(input.oldTitle, previous.oldTitle),
    work_date: optStr(input.date, previous.date),
    pct: optStr(input.pct, previous.pct),
    approved_by: optStr(input.approvedBy, previous.approvedBy),
  };
}
export const promotions = makeCollection("hr_promotions", ref.hrPromotions, { toRow: promotionRow, toPayload: promotionPayload });

function disciplinaryRow(row) {
  return { id: row.id, date: row.work_date, employee: row.employee, reason: row.reason, site: row.site, outcome: row.outcome };
}
function disciplinaryPayload(input, previous = {}) {
  const employee = str(input.employee, previous.employee);
  if (!employee) {
    const err = new Error("Enter an employee name.");
    err.status = 400;
    throw err;
  }
  return {
    employee,
    work_date: optStr(input.date, previous.date),
    reason: optStr(input.reason, previous.reason),
    site: optStr(input.site, previous.site),
    outcome: optStr(input.outcome, previous.outcome) || "Counselling",
  };
}
export const disciplinary = makeCollection("hr_disciplinary", ref.hrDisciplinary, { toRow: disciplinaryRow, toPayload: disciplinaryPayload });

function ccmaRow(row) {
  return { id: row.id, date: row.work_date, referral: row.referral, reason: row.reason, site: row.site, area: row.area, stage: row.stage, comments: row.comments };
}
function ccmaPayload(input, previous = {}) {
  const referral = str(input.referral, previous.referral);
  if (!referral) {
    const err = new Error("Enter the employee or referral.");
    err.status = 400;
    throw err;
  }
  return {
    referral,
    work_date: optStr(input.date, previous.date),
    reason: optStr(input.reason, previous.reason),
    site: optStr(input.site, previous.site),
    area: optStr(input.area, previous.area),
    stage: optStr(input.stage, previous.stage) || "Conciliation",
    comments: optStr(input.comments, previous.comments),
  };
}
export const ccma = makeCollection("hr_ccma", ref.hrCcma, { toRow: ccmaRow, toPayload: ccmaPayload });
