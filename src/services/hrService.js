import * as catalog from "../data/catalog.js";
import { insertRow, readTable } from "./store.js";

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
  const rows = await readTable("employees", catalog.employees);
  return rows.map(toEmployee);
}

async function readLeave() {
  const rows = await readTable("leave_requests", catalog.leave);
  return rows.map(toLeave);
}

async function readClaims() {
  const rows = await readTable("claims", catalog.claims);
  return rows.map(toClaim);
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
    businesses: catalog.businessNames,
    defaultBusiness: catalog.defaultBusinessName,
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
