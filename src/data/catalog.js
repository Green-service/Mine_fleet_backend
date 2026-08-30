export const sessionUser = {
  id: "usr_clinton",
  name: "Clinton Bongani Khoza",
  email: "clintonbonganikhoza@gmail.com",
  role: "Super Admin",
  initials: "CK",
};

export const sites = ["All Sites", "Grootegeluk", "Belfast", "Medupi", "Head Office"];

export const invitedUsers = [];

const ROLE_MODULE_IDS = ["overview", "production", "fleet", "diesel", "maintenance", "breakdowns", "safety", "hr", "procurement", "finance", "reports", "settings"];
const ROLE_ACTION_IDS = ["view", "create", "edit", "delete", "approve", "upload"];

function roleMatrix(rule) {
  return Object.fromEntries(
    ROLE_MODULE_IDS.map((mod) => [mod, Object.fromEntries(ROLE_ACTION_IDS.map((act) => [act, Boolean(rule(mod, act))]))]),
  );
}

export const overview = {
  kpis: [],
  availabilityTrend: [],
  productionTrend: [],
  dieselTrend: [],
  alerts: [],
  sitePulse: [],
};

export const productionDaily = [];

export const productionSummary = {
  dailyTarget: 0,
  dailyActual: 0,
  mtdTarget: 0,
  mtdActual: 0,
  gg: { mtdTarget: 0, mtdActual: 0 },
  medupi: { mtdTarget: 0, mtdActual: 0 },
};

export const machineHoursBlf = [];

export const equipment = [];

export const fleetCategories = [];

export const dieselByMachine = [];
export const dieselIssues = [];
export const dieselAlerts = [];
export const dieselRecon = [];
export const dieselKpis = {
  issuedToday: 0,
  costPerLitre: 31.65,
  exceptions: 0,
  litresPerHour: 0,
  fuelPerTonne: 0,
  monthlySpend: "R 0",
  mtdReceived: 0,
  mtdIssued: 0,
  closingStock: 0,
  largestLoss: 0,
};

export const workOrders = [];
export const attentionMachines = [];
export const servicePlan = [];
export const breakdowns = [];

export const safetyActions = [];

export const safetyKpis = {
  ltiFree: 0,
  scratchFree: 0,
  openHazards: 0,
  openActions: 0,
  training: 0,
  pto: 0,
  vfls: 0,
  inspections: 0,
  riskAssessments: 0,
  jobCards: 0,
};

export const employees = [];

export const roles = [
  {
    id: "r1",
    code: "R001",
    name: "Super Admin",
    slug: "super-admin",
    category: "Business",
    description: "Full control of MPG Operations, including payroll, roles and site access.",
    users: 1,
    modules: 72,
    status: "Active",
    permissions: roleMatrix(() => true),
    employees: [{ name: "Clinton Bongani Khoza", rate: "R 0/mo" }],
  },
  {
    id: "r2",
    code: "R002",
    name: "Site Supervisor",
    slug: "site-supervisor",
    category: "Operations",
    description: "Shift capture, diesel sign-off, and production challenges for an allocated site.",
    users: 2,
    modules: 24,
    status: "Active",
    permissions: roleMatrix((mod, act) => act === "view" || (["production", "fleet", "diesel", "maintenance", "breakdowns"].includes(mod) && ["create", "edit"].includes(act)) || (["production", "diesel"].includes(mod) && act === "approve")),
    employees: [
      { name: "Thabo Nkosi", rate: "R 0/mo" },
      { name: "Sipho Khumalo", rate: "R 0/mo" },
    ],
  },
  {
    id: "r3",
    code: "R003",
    name: "Diesel Mechanic",
    slug: "diesel-mechanic",
    category: "Engineering",
    description: "Breakdown reporting, work orders and machine-hour updates.",
    users: 1,
    modules: 16,
    status: "Active",
    permissions: roleMatrix((mod, act) => (["overview", "fleet", "diesel", "maintenance", "breakdowns"].includes(mod) && act === "view") || (["diesel", "maintenance", "breakdowns"].includes(mod) && ["create", "edit"].includes(act))),
    employees: [{ name: "Peter Maseko", rate: "R 0/mo" }],
  },
  {
    id: "r4",
    code: "R004",
    name: "SHEQ Officer",
    slug: "sheq-officer",
    category: "Safety",
    description: "Incidents, PTOs, contractor files and corrective action tracking.",
    users: 1,
    modules: 18,
    status: "Active",
    permissions: roleMatrix((mod, act) => (["overview", "safety", "hr", "reports"].includes(mod) && act === "view") || (mod === "safety" && ["create", "edit", "approve", "upload"].includes(act))),
    employees: [{ name: "Lerato Mokoena", rate: "R 0/mo" }],
  },
];

export const leave = [];

export const claims = [];

export const purchaseOrders = [];

export const purchaseRequests = [];

export const machineCosts = [];

export const financeKpis = {
  monthlyMachine: "R 0",
  diesel: "R 0",
  repairs: "R 0",
  invoices: "R 0",
};

export const appSettings = {
  id: "default",
  default_site: "Grootegeluk",
  diesel_cost_per_litre: 31.65,
  availability_target: 90,
};

export const notifications = [
  { id: "n1", title: "CMPG050 still off-site", time: "12 min ago", unread: true },
  { id: "n2", title: "Medupi night shift captured", time: "1 hr ago", unread: true },
  { id: "n3", title: "Diesel variance −830 L flagged", time: "Yesterday", unread: true },
  { id: "n4", title: "PTO records due this week", time: "Yesterday", unread: false },
];

export const activity = [
  { id: "act1", actor: "T. Nkosi", action: "Captured GG day-shift production", time: "06:12" },
  { id: "act2", actor: "P. Maseko", action: "Logged breakdown on CMPG075", time: "07:40" },
  { id: "act3", actor: "L. Mokoena", action: "Closed VFL action #2", time: "09:18" },
  { id: "act4", actor: "C. Khoza", action: "Approved PR-2026-068 PPE stock", time: "11:02" },
];
