export const sessionUser = {
  id: "usr_clinton",
  name: "Clinton Bongani Khoza",
  email: "clinton@mpg.co.za",
  role: "Super Admin",
  initials: "CB",
};

export const sites = ["All Sites", "Grootegeluk", "Belfast", "Medupi", "Head Office"];

export const overview = {
  kpis: [
    { key: "availability", label: "Fleet availability", value: "89.4%", hint: "Target 90%", tone: "good", delta: "-0.6pp vs target" },
    { key: "utilisation", label: "Fleet utilisation", value: "83.7%", hint: "Productive hours / available", tone: "warn", delta: "-2.1% vs last week" },
    { key: "down", label: "Machines down", value: "7", hint: "2 critical breakdowns", tone: "bad", delta: "CMPG050 · CMPG073" },
    { key: "production", label: "Production today", value: "21,840 t", hint: "104% of target", tone: "good", delta: "+840 t vs plan" },
    { key: "pm", label: "PM compliance", value: "93%", hint: "4 services due soon", tone: "good", delta: "38 machines on plan" },
    { key: "safety", label: "Open safety actions", value: "14", hint: "3 overdue", tone: "warn", delta: "SHEQ + HOD tracker" },
    { key: "spares", label: "Critical spares risk", value: "4", hint: "Out of stock / below min", tone: "bad", delta: "Hydraulic pipe, transmission" },
    { key: "cost", label: "Monthly operating cost", value: "R4.28m", hint: "+3.8% vs budget", tone: "warn", delta: "Diesel is the largest driver" },
  ],
  availabilityTrend: [
    { month: "Mar", value: 92 },
    { month: "Apr", value: 88 },
    { month: "May", value: 89 },
    { month: "Jun", value: 90 },
    { month: "Jul", value: 89.4 },
    { month: "Aug", value: 89.4 },
  ],
  productionTrend: [
    { month: "Mar", value: 298 },
    { month: "Apr", value: 276 },
    { month: "May", value: 301 },
    { month: "Jun", value: 288 },
    { month: "Jul", value: 312 },
    { month: "Aug", value: 219 },
  ],
  dieselTrend: [
    { month: "Mar", value: 4.1 },
    { month: "Apr", value: 4.4 },
    { month: "May", value: 4.6 },
    { month: "Jun", value: 4.8 },
    { month: "Jul", value: 4.91 },
    { month: "Aug", value: 2.1 },
  ],
  alerts: [
    { id: "a1", tone: "critical", title: "CMPG050 transmission failure", detail: "Off-site repair · 15 days down · Grootegeluk" },
    { id: "a2", tone: "critical", title: "Hydraulic pipe out of stock", detail: "PR-2026-071 awaiting approval · CMPG044" },
    { id: "a3", tone: "due", title: "CMPG044 service in 48 hours", detail: "PM19000 + inspection · hours remaining 144" },
    { id: "a4", tone: "safety", title: "3 corrective actions overdue", detail: "Towing chain repair is past due · Engineering Foreman" },
    { id: "a5", tone: "production", title: "Medupi still below MTD target", detail: "−14,254 t variance · unsafe conditions earlier in month" },
  ],
  sitePulse: [
    { site: "Grootegeluk", availability: 91, production: 109, diesel: "On plan", status: "Stable" },
    { site: "Belfast", availability: 88, production: 101, diesel: "Watch", status: "Monitor" },
    { site: "Medupi", availability: 74, production: 77, diesel: "Low hours", status: "Attention" },
  ],
};

export const productionDaily = [
  { date: "06/03/2026", site: "GG", target: 22113, actual: 26446, challenges: "No major note captured" },
  { date: "07/03/2026", site: "GG", target: 22881, actual: 24604, challenges: "CMPG080, 069, 070 breakdown" },
  { date: "08/03/2026", site: "GG", target: 22881, actual: 23776, challenges: "PSC GG2 stopped; CMPG 069, 080, 055 breakdowns" },
  { date: "09/03/2026", site: "GG", target: 22881, actual: 25851, challenges: "CMPG 080, 055, 069, 070, 095 breakdown" },
  { date: "10/03/2026", site: "GG", target: 24321, actual: 26580, challenges: "CMPG 080, 055, 069, 070, 095 breakdown" },
  { date: "07/03/2026", site: "Medupi", target: 5712, actual: 2814, challenges: "No day shift — unsafe condition; CGHM 055, TT104" },
  { date: "08/03/2026", site: "Medupi", target: 5712, actual: 4598, challenges: "CTP 023 breakdown; CMPG 101, CGHM 055" },
  { date: "09/03/2026", site: "Medupi", target: 5712, actual: 7014, challenges: "CGHM 055 breakdown" },
  { date: "10/03/2026", site: "Medupi", target: 5712, actual: 4368, challenges: "CTP 023, CGHM 055, 059 breakdown" },
  { date: "11/03/2026", site: "Medupi", target: 5712, actual: 6156, challenges: "No major note captured" },
];

export const productionSummary = {
  dailyTarget: 30033,
  dailyActual: 30948,
  mtdTarget: 291290,
  mtdActual: 298622,
  gg: { mtdTarget: 228458, mtdActual: 250044 },
  medupi: { mtdTarget: 62832, mtdActual: 48578 },
};

export const machineHoursBlf = [
  { machine: "CMPG110", equipment: "BLF production machine", hours: 310, downtime: 230, standby: 7, pm: 11, status: "Restricted", remarks: "Injector leaks, fuel dilution, turbo and oil-leak repairs" },
  { machine: "CMPG004", equipment: "CAT 966L FEL", hours: 124, downtime: 70, standby: 92, pm: 264, status: "Low Hours", remarks: "Engine blow-by and lift-cylinder repairs" },
  { machine: "CMPG009", equipment: "CAT 966L FEL", hours: 538, downtime: 9, standby: 5, pm: 6, status: "Productive", remarks: "System updates, starting issues and inspections" },
  { machine: "CMPG014", equipment: "CAT 966L FEL", hours: 550, downtime: 4, standby: 9, pm: 2, status: "Top Performer", remarks: "Cylinder repair, training standby and routine inspections" },
  { machine: "CMPG006", equipment: "Water bowser", hours: 104, downtime: 0, standby: 0, pm: 0, status: "Limited Use", remarks: "Low utilisation / water-bowser operating requirements" },
  { machine: "CPT021", equipment: "BLF support machine", hours: 194, downtime: 32, standby: 60, pm: 54, status: "Monitor", remarks: "Standby, aircon repairs and wheel-stud repairs" },
];

export const equipment = [
  { fleetNo: "CMPG044", equipment: "CAT 966L FEL", category: "Front-End Loader", site: "Grootegeluk", hours: 18777, health: 72, status: "Monitor" },
  { fleetNo: "CMPG050", equipment: "CAT 966L FEL", category: "Front-End Loader", site: "Grootegeluk", hours: 9147, health: 34, status: "Breakdown" },
  { fleetNo: "CMPG014", equipment: "CAT 966L FEL", category: "Front-End Loader", site: "Belfast", hours: 11868, health: 91, status: "Operational" },
  { fleetNo: "CMPG046", equipment: "CAT 966L FEL", category: "Front-End Loader", site: "Grootegeluk", hours: 10142, health: 88, status: "Operational" },
  { fleetNo: "CMPG009", equipment: "CAT 966L FEL", category: "Front-End Loader", site: "Belfast", hours: 21957, health: 81, status: "Operational" },
  { fleetNo: "CMPG077", equipment: "Volvo L150H FEL", category: "Front-End Loader", site: "Grootegeluk", hours: 21681, health: 76, status: "Monitor" },
  { fleetNo: "CMPG060", equipment: "CAT 740GC ADT", category: "Articulated Dump Truck", site: "Grootegeluk", hours: 8522, health: 86, status: "Operational" },
  { fleetNo: "CMPG080", equipment: "CAT 730C ADT", category: "Articulated Dump Truck", site: "Grootegeluk", hours: 16420, health: 64, status: "Monitor" },
  { fleetNo: "CMPG073", equipment: "CAT 730 ADT", category: "Articulated Dump Truck", site: "Grootegeluk", hours: 18166, health: 41, status: "Breakdown" },
  { fleetNo: "CMPG075", equipment: "CAT 730 ADT", category: "Articulated Dump Truck", site: "Grootegeluk", hours: 25972, health: 38, status: "Breakdown" },
  { fleetNo: "CMPG102", equipment: "Volvo A40G ADT", category: "Articulated Dump Truck", site: "Medupi", hours: 8212, health: 84, status: "Operational" },
  { fleetNo: "CTP023", equipment: "Front-end loader", category: "Front-End Loader", site: "Medupi", hours: 8766, health: 90, status: "Operational" },
  { fleetNo: "CTP014", equipment: "Front-end loader", category: "Front-End Loader", site: "Medupi", hours: 10971, health: 22, status: "Breakdown" },
  { fleetNo: "CMPG055", equipment: "Scania P410 back tipper", category: "Back Tipper", site: "Grootegeluk", hours: 4905, health: 29, status: "Breakdown" },
  { fleetNo: "CMPG052", equipment: "Scania G460 back tipper", category: "Back Tipper", site: "Grootegeluk", hours: 7124, health: 70, status: "Monitor" },
  { fleetNo: "CMPG006", equipment: "Powerstar 2628 water truck", category: "Water Truck", site: "Belfast", hours: 7930, health: 87, status: "Operational" },
  { fleetNo: "CMPG022", equipment: "Powerstar water bowser", category: "Water Truck", site: "Grootegeluk", hours: 4567, health: 61, status: "Maintenance" },
  { fleetNo: "CGHM055", equipment: "SANY SKT90 RDT", category: "Rigid Dump Truck", site: "Medupi", hours: 0, health: 45, status: "Standby" },
  { fleetNo: "CMPG040", equipment: "CAT 140K grader", category: "Grader", site: "Grootegeluk", hours: 4680, health: 93, status: "Operational" },
  { fleetNo: "CMPG054", equipment: "Bell Finlay screen", category: "Mobile Screen", site: "Grootegeluk", hours: 1506, health: 89, status: "Operational" },
];

export const fleetCategories = [
  { category: "Articulated Dump Trucks", quantity: 20, units: "CMPG060, 066, 067, 080, 086–098, 101, 102, 104, TT124", make: "CAT 730C/740GC and Volvo A40G", area: "GGC and Eskom Medupi" },
  { category: "Back Tipper Trucks", quantity: 6, units: "CMPG052, 053, 055, 056, 069, 070", make: "Scania G460/P410 and Powerstar 2628", area: "GGC" },
  { category: "Rigid Dump Trucks", quantity: 3, units: "CGHM055, CGHM056, CGHM059", make: "SANY SKT90", area: "Eskom Medupi" },
  { category: "Front-End Loaders", quantity: 11, units: "CMPG004, 009, 014, 044, 046, 050, 068, 077, CTP013, CTP014, CTP023", make: "CAT 966/950, Volvo L150H, SANY 956", area: "Belfast, GGC, Medupi" },
  { category: "Water Trucks", quantity: 4, units: "CMPG006, CMPG022, CMPG057, TT103", make: "Powerstar 2628 and Volvo A40G", area: "Belfast and GGC" },
  { category: "Lighting Plants", quantity: 10, units: "CMPG023, 024, 047–049, 051, 058, 059, 071, 072", make: "Industrial Group / Italtower", area: "GGC" },
  { category: "LDVs", quantity: 17, units: "Hilux, NP200, D-Max, Ranger", make: "Toyota, Nissan, Isuzu, Ford", area: "GGC, Belfast, Head Office" },
];

export const dieselByMachine = [
  { machine: "CMPG088", site: "Grootegeluk", litres: 2857, costPerLitre: 31.65, hours: 138, status: "High Usage" },
  { machine: "CMPG060", site: "Grootegeluk", litres: 2745, costPerLitre: 31.65, hours: 140, status: "Normal" },
  { machine: "CMPG044", site: "Grootegeluk", litres: 2640, costPerLitre: 31.65, hours: 119, status: "Investigate" },
  { machine: "CMPG022", site: "Grootegeluk", litres: 2428, costPerLitre: 31.65, hours: 92, status: "Investigate" },
  { machine: "CTP013", site: "Belfast", litres: 2079, costPerLitre: 31.65, hours: 128, status: "Normal" },
  { machine: "TT125", site: "Grootegeluk", litres: 1877, costPerLitre: 31.65, hours: 134, status: "Efficient" },
];

export const dieselIssues = [
  { date: "26/07/2026", time: "06:15", site: "Grootegeluk", machine: "CMPG044", operator: "T. Nkosi", opening: 18658, closing: 18777, litres: 2640, approvedBy: "Production Foreman" },
  { date: "26/07/2026", time: "06:22", site: "Grootegeluk", machine: "CMPG060", operator: "P. Maseko", opening: 8294, closing: 8410, litres: 2745, approvedBy: "Site Supervisor" },
  { date: "26/07/2026", time: "06:35", site: "Belfast", machine: "CTP013", operator: "L. Mokoena", opening: 5148, closing: 5276, litres: 2079, approvedBy: "Production Foreman" },
];

export const dieselAlerts = [
  { tone: "critical", text: "CMPG022 · 26.4 L/hr — above expected range" },
  { tone: "critical", text: "CMPG044 · sudden increase of 31%" },
  { tone: "due", text: "CMPG088 · high monthly usage" },
  { tone: "due", text: "CMPG054 · missing closing meter" },
  { tone: "production", text: "CMPG050 · fuel issued while on breakdown" },
  { tone: "good", text: "TT125 · best fuel efficiency this week" },
];

export const dieselKpis = {
  issuedToday: 18742,
  costPerLitre: 31.65,
  exceptions: 6,
  litresPerHour: 18.7,
  fuelPerTonne: 0.86,
  monthlySpend: "R4.91m",
  mtdReceived: 181890,
  mtdIssued: 160283,
  closingStock: 24137,
  largestLoss: -830,
};

export const dieselRecon = [
  { date: "01/07/2026", received: 26259, issued: 7369, stock: 21315, variance: -158, status: "Review" },
  { date: "05/07/2026", received: 0, issued: 4820, stock: 1561, variance: -414, status: "High Variance" },
  { date: "11/07/2026", received: 20003, issued: 4072, stock: 25592, variance: 117, status: "Acceptable" },
  { date: "17/07/2026", received: 21525, issued: 5646, stock: 28192, variance: -830, status: "High Variance" },
  { date: "27/07/2026", received: 21969, issued: 6342, stock: 16701, variance: 64, status: "Acceptable" },
  { date: "31/07/2026", received: 28036, issued: 5327, stock: 24137, variance: -289, status: "Review" },
];

export const workOrders = [
  { date: "28/07/2026", machine: "CMPG044", task: "PM19000 + inspection", spares: "On site", po: "—", status: "Planned" },
  { date: "29/07/2026", machine: "CMPG052", task: "General repairs", spares: "Awaiting supplier", po: "PO2612", status: "Awaiting Parts" },
  { date: "21/08/2026", machine: "CMPG025", task: "Hour-based service", spares: "Kit staged", po: "—", status: "Overdue" },
  { date: "21/08/2026", machine: "CMPG068", task: "950L service", spares: "On site", po: "—", status: "Overdue" },
];

export const attentionMachines = [
  { fleetNo: "CMPG022", machine: "Powerstar water bowser", status: "Maintenance", reason: "No issue reported — off-site" },
  { fleetNo: "CMPG055", machine: "Scania back tipper", status: "Breakdown", reason: "Propshaft broken" },
  { fleetNo: "CMPG070", machine: "Powerstar back tipper", status: "Maintenance", reason: "Wheel alignment at Hi-Q" },
  { fleetNo: "CMPG073", machine: "CAT ADT", status: "Breakdown", reason: "Motor and harness ready — awaiting auto electrician" },
  { fleetNo: "CMPG075", machine: "CAT ADT", status: "Breakdown", reason: "Taking time to change gears" },
  { fleetNo: "CMPG079", machine: "CAT ADT", status: "Breakdown", reason: "Cylinder head ordered" },
  { fleetNo: "CMPG004", machine: "CAT 966L", status: "Maintenance", reason: "Service, bucket repair" },
  { fleetNo: "KZW950MP", machine: "Nissan NP200", status: "Maintenance", reason: "Service at Nissan" },
];

export const servicePlan = [
  { fleetNo: "CMPG025", make: "CAT TLB", hours: 1865, next: 1858, left: -7, date: "21/08/2025", status: "Overdue", notes: "Booked 21-08-2025" },
  { fleetNo: "CMPG046", make: "CAT 966L", hours: 10142, next: 10124, left: -18, date: "25/08/2025", status: "Overdue", notes: "Date moved after 077 breakdown" },
  { fleetNo: "CMPG068", make: "CAT 950L", hours: 7666, next: 7653, left: -13, date: "21/08/2025", status: "Overdue", notes: "Booked 21-08-2025" },
  { fleetNo: "CMPG044", make: "CAT 966L", hours: 18895, next: 19039, left: 144, date: "31/08/2025", status: "Plan Service", notes: "No note recorded" },
  { fleetNo: "CMPG077", make: "Volvo L150H", hours: 21681, next: 21747, left: 66, date: "21/08/2025", status: "Due Soon", notes: "No note recorded" },
  { fleetNo: "CMPG050", make: "CAT 966L", hours: 9147, next: 9486, left: 339, date: "TBC", status: "Breakdown", notes: "Transmission. ETA TBC" },
];

export const breakdowns = [
  { machine: "CMPG050", failure: "Transmission failure", downtime: "15 days", severity: "Critical", parts: "Supplier repair", status: "Off-site repair", site: "Grootegeluk" },
  { machine: "CMPG047", failure: "Low voltage issue", downtime: "18 hrs", severity: "Moderate", parts: "Diagnostics", status: "Investigation", site: "Grootegeluk" },
  { machine: "CMPG055", failure: "Propshaft broken", downtime: "3 days", severity: "Critical", parts: "Propshaft", status: "Awaiting parts", site: "Grootegeluk" },
  { machine: "CMPG073", failure: "Motor and harness", downtime: "4 days", severity: "Major", parts: "On site", status: "Awaiting auto electrician", site: "Grootegeluk" },
  { machine: "CMPG075", failure: "Slow gear change", downtime: "2 days", severity: "Major", parts: "Diagnostics", status: "In workshop", site: "Grootegeluk" },
  { machine: "CTP014", failure: "Hard starting", downtime: "342 hrs", severity: "Critical", parts: "Starter circuit", status: "Unavailable", site: "Medupi" },
];

export const safetyActions = [
  { source: "SHEQ Meeting", action: "Replace Belfast containers", owner: "Banele & Tsakane", due: "30/07/2026", status: "Ongoing", priority: "Medium" },
  { source: "Inspection", action: "Repair damaged towing chain", owner: "Engineering Foreman", due: "27/07/2026", status: "Overdue", priority: "High" },
  { source: "HOD Report", action: "Complete PTO for two scheduled employees", owner: "Safety / Supervisors", due: "This week", status: "Open", priority: "Medium" },
  { source: "HOD Report", action: "Obtain training quotation and schedule outstanding training", owner: "Training Coordinator", due: "Open", status: "Open", priority: "High" },
  { source: "HOD Report", action: "Verify Waterberg Construction contractor safety file", owner: "SHEQ Department", due: "Open", status: "Open", priority: "Medium" },
  { source: "Investigation", action: "Maintain investigation close-out status", owner: "Safety Officer", due: "Closed", status: "Closed", priority: "Routine" },
];

export const safetyKpis = {
  ltiFree: 148,
  scratchFree: 699,
  openHazards: 9,
  openActions: 14,
  training: 64,
  pto: 96,
  vfls: 2,
  inspections: 1,
  riskAssessments: 22,
  jobCards: 18,
};

export const employees = [
  { id: "e1", name: "Clinton Bongani Khoza", number: "MPG1001", title: "Super Admin", site: "Head Office", shift: "Office", clockIn: "07:42", clockOut: "—", hours: "In progress", rate: 0, status: "On Shift", role: "Super Admin", salary: 0 },
  { id: "e2", name: "Thabo Nkosi", number: "MPG1024", title: "Plant Operator", site: "Grootegeluk", shift: "Day", clockIn: "05:56", clockOut: "18:04", hours: "12.0", rate: 85, status: "Present", role: "Plant Operator", salary: 0 },
  { id: "e3", name: "Lerato Mokoena", number: "MPG1188", title: "Safety Representative", site: "Belfast", shift: "Day", clockIn: "06:18", clockOut: "18:02", hours: "11.5", rate: 72.5, status: "Late", role: "Safety Representative", salary: 0 },
  { id: "e4", name: "Peter Maseko", number: "MPG1061", title: "Diesel Mechanic", site: "Grootegeluk", shift: "Night", clockIn: "17:51", clockOut: "—", hours: "In progress", rate: 92, status: "On Shift", role: "Diesel Mechanic", salary: 0 },
  { id: "e5", name: "Nomsa Dlamini", number: "MPG1210", title: "Plant Operator", site: "Belfast", shift: "Day", clockIn: "—", clockOut: "—", hours: "0.0", rate: 68, status: "Not Clocked In", role: "Plant Operator", salary: 0 },
  { id: "e6", name: "Sipho Khumalo", number: "MPG1105", title: "ADT Operator", site: "Grootegeluk", shift: "Day", clockIn: "05:59", clockOut: "—", hours: "Missing", rate: 80, status: "Missing Clock-Out", role: "Plant Operator", salary: 0 },
];

export const roles = [
  {
    id: "r1",
    name: "Super Admin",
    slug: "super-admin",
    category: "Business",
    description: "Full control of MPG Operations Hub, including payroll, roles and site access.",
    users: 1,
    modules: 20,
    status: "Active",
    employees: [{ name: "Clinton Bongani Khoza", rate: "R 0/mo" }],
  },
  {
    id: "r2",
    name: "Site Supervisor",
    slug: "site-supervisor",
    category: "Operations",
    description: "Shift capture, diesel sign-off, and production challenges for an allocated site.",
    users: 2,
    modules: 12,
    status: "Active",
    employees: [
      { name: "Thabo Nkosi", rate: "R 0/mo" },
      { name: "Sipho Khumalo", rate: "R 0/mo" },
    ],
  },
  {
    id: "r3",
    name: "Diesel Mechanic",
    slug: "diesel-mechanic",
    category: "Engineering",
    description: "Breakdown reporting, work orders and machine-hour updates.",
    users: 1,
    modules: 8,
    status: "Active",
    employees: [{ name: "Peter Maseko", rate: "R 0/mo" }],
  },
  {
    id: "r4",
    name: "SHEQ Officer",
    slug: "sheq-officer",
    category: "Safety",
    description: "Incidents, PTOs, contractor files and corrective action tracking.",
    users: 1,
    modules: 6,
    status: "Active",
    employees: [{ name: "Lerato Mokoena", rate: "R 0/mo" }],
  },
];

export const leave = [
  { employee: "Nomsa Dlamini", type: "Annual", from: "18/08/2026", to: "22/08/2026", days: 5, status: "Approved" },
  { employee: "Thabo Nkosi", type: "Sick", from: "12/08/2026", to: "12/08/2026", days: 1, status: "Closed" },
];

export const claims = [
  { ref: "CL-2026-014", employee: "Peter Maseko", type: "Travel", amount: 860, status: "Pending" },
  { ref: "CL-2026-011", employee: "Lerato Mokoena", type: "PPE reimbursement", amount: 420, status: "Approved" },
];

export const purchaseOrders = [
  { date: "01/07/2026", delivery: "31/07/2026", reference: "PO0004994", orderNo: "61191", supplier: "Midway Inn Operations (PTY) Ltd", exclusive: 1434.78, vat: 215.22, total: 1650, status: "Open", progress: "Not captured" },
];

export const purchaseRequests = [
  { request: "PR-2026-071", department: "Engineering", machine: "CMPG044", item: "Hydraulic pipe", value: 18450, status: "Awaiting Approval" },
  { request: "PR-2026-068", department: "Safety", machine: "—", item: "PPE stock", value: 42000, status: "PO Issued" },
  { request: "PR-2026-074", department: "Engineering", machine: "CMPG050", item: "Transmission rebuild", value: 241987, status: "Awaiting Approval" },
];

export const machineCosts = [
  { rank: 1, machine: "CMPG046", driver: "Diesel and hydraulic repairs", total: 295552.48 },
  { rank: 2, machine: "CMPG014", driver: "Capital, diesel and interest", total: 246872.21 },
  { rank: 3, machine: "CMPG050", driver: "Transmission and repairs", total: 241987.71 },
  { rank: 4, machine: "CMPG044", driver: "Diesel and PM kits", total: 198440.0 },
  { rank: 5, machine: "CMPG088", driver: "High diesel usage", total: 176210.4 },
];

export const financeKpis = {
  monthlyMachine: "R4.28m",
  diesel: "R1.62m",
  repairs: "R1.08m",
  invoices: "R684k",
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
