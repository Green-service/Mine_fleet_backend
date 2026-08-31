export const sessionUser = {
  id: "usr_demo",
  name: "",
  email: "",
  role: "Super Admin",
  initials: "—",
};

export const sites = ["All Sites"];

export const invitedUsers = [];

const ROLE_MODULE_IDS = ["overview", "drivers", "assets", "maintenance", "finance", "hr", "reports", "settings"];
const ROLE_ACTION_IDS = ["view", "create", "edit", "delete", "approve", "upload"];

function roleMatrix(rule) {
  return Object.fromEntries(
    ROLE_MODULE_IDS.map((mod) => [mod, Object.fromEntries(ROLE_ACTION_IDS.map((act) => [act, Boolean(rule(mod, act))]))]),
  );
}

export const overview = {
  kpis: [],
  businesses: [],
  revenueTrend: [],
  expensesTrend: [],
  netTrend: [],
  transactions: [],
  alerts: [],
};

export const businesses = [];
export const businessNames = [];
export const defaultBusinessName = "";

export const businessTransactions = [];
export const businessMonthlyTrend = [];

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
  litresToday: 0,
  costPerLitre: 0,
  spendToday: 0,
  highConsumption: 0,
  avgL100km: 0,
  kmThisMonth: 0,
  monthlySpend: 0,
  fillsThisMonth: 0,
};

export const workOrders = [];
export const attentionMachines = [];
export const servicePlan = [];
export const assets = [];

export const expenseCategories = [
  "Fuel",
  "Service & maintenance",
  "Insurance",
  "Tyres",
  "Licence & fees",
  "Parking & tolls",
  "Other",
];

export const assetLogs = [];
export const drivers = [];
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
    description: "Full control of the BRAINSTAK portfolio hub.",
    users: 0,
    modules: 48,
    status: "Active",
    permissions: roleMatrix(() => true),
    employees: [],
  },
  {
    id: "r2",
    code: "R002",
    name: "Driver",
    slug: "driver",
    category: "Operations",
    description: "View the dashboard, assigned vehicle and maintenance schedule.",
    users: 0,
    modules: 5,
    status: "Active",
    permissions: roleMatrix((mod, act) => act === "view" && ["overview", "drivers", "assets", "maintenance", "settings"].includes(mod)),
    employees: [],
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
  default_site: "",
  diesel_cost_per_litre: 0,
  availability_target: 90,
};

export const portfolioDocuments = [];
export const notifications = [];
export const activity = [];
