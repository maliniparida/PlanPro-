const $ = (s, root=document) => root.querySelector(s); const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { view: "dashboard", alertMode: "notification", cache: {} };

const configs = {
  events: {
    title: "Events",
    subtitle: "Create, plan and manage your events.",
    singular: "Event",
    fields: [
      ["name", "Event name", "text", true],
      ["venue", "Venue", "text", true],
      ["event_date", "Date", "date", true],
      ["event_time", "Event time", "time", true],
      ["capacity", "Capacity", "number", true],
      ["budget", "Allocated budget (₹)", "number", true],
      ["status", "Status", "select", true, ["Planned", "Ongoing", "Completed", "Cancelled"]],
      ["manager", "Event manager", "text", false]
    ],
    columns: [["name", "Event"], ["venue", "Venue"], ["event_date", "Date"], ["event_time", "Time"], ["capacity", "Capacity"], ["budget", "Budget (₹)"], ["status", "Status"], ["manager", "Manager"]]
  },
  registrations: {
    title: "Registrations & Tickets",
    subtitle: "Register attendees, find ticket IDs and update attendance.",
    singular: "Registration",
    fields: [
      ["attendee", "Attendee name", "text", true],
      ["event_name", "Event name", "select", true, []],
      ["ticket_id", "Ticket ID (leave blank to auto-generate)", "text", false],
      ["email", "Email", "email", true],
      ["registered_at", "Registered date", "date", false],
      ["attendance", "Attendance", "select", true, ["Registered", "Present", "Absent"]]
    ],
    columns: [["attendee", "Attendee"], ["event_name", "Event"], ["ticket_id", "Ticket ID"], ["email", "Email"], ["registered_at", "Registered"], ["attendance", "Attendance"]]
  },
  vendors: {
    title: "Vendors",
    subtitle: "Manage vendor contacts, service categories and assignments.",
    singular: "Vendor",
    fields: [
      ["name", "Vendor name", "text", true],
      ["phone", "Phone", "tel", true],
      ["email", "Email", "email", false],
      ["service", "Service / work", "text", true],
      ["category", "Category", "select", true, ["Catering", "Camera / Photography", "Event Management", "Sound & Lighting", "Decoration", "Security", "Printing & Signage", "Entertainment / DJ", "Housekeeping", "Tech & Ticketing", "Other"]],
      ["availability", "Availability", "select", true, ["Available", "Unavailable", "Assigned"]],
      ["assigned_event", "Assigned event", "select", false, []]
    ],
    columns: [["name", "Vendor"], ["phone", "Phone"], ["email", "Email"], ["service", "Service"], ["category", "Category"], ["availability", "Status"], ["assigned_event", "Assigned event"]]
  },
  resources: {
    title: "Resources",
    subtitle: "Track required quantities, available stock and shortages.",
    singular: "Resource",
    fields: [
      ["name", "Resource name", "text", true],
      ["event_name", "Event name", "select", true, []],
      ["required_qty", "Required quantity", "number", true],
      ["available_qty", "Available quantity", "number", true],
      ["unit_cost", "Unit cost (₹)", "number", true],
      ["notes", "Notes", "text", false]
    ],
    columns: [["name", "Resource"], ["event_name", "Event"], ["required_qty", "Required"], ["available_qty", "Available"], ["unit_cost", "Unit cost (₹)"], ["shortage", "Status"], ["notes", "Notes"]]
  },
  sponsorships: {
    title: "Sponsorships",
    subtitle: "Record sponsor commitments and event contributions.",
    singular: "Sponsorship",
    fields: [
      ["sponsor", "Sponsor / company", "text", true],
      ["event_name", "Event name", "select", true, []],
      ["amount", "Amount (₹)", "number", true],
      ["contact", "Contact details", "text", false],
      ["status", "Status", "select", true, ["Pending", "Confirmed", "Received"]]
    ],
    columns: [["sponsor", "Sponsor"], ["event_name", "Event"], ["amount", "Amount (₹)"], ["contact", "Contact"], ["status", "Status"]]
  },
  expenses: {
    title: "Budget Tracking",
    subtitle: "Record expenses and monitor available balances per event.",
    singular: "Expense",
    fields: [
      ["event_name", "Event name", "select", true, []],
      ["description", "Expense description", "text", true],
      ["amount", "Amount (₹)", "number", true],
      ["expense_date", "Expense date", "date", true]
    ],
    columns: [["event_name", "Event"], ["description", "Description"], ["amount", "Amount (₹)"], ["expense_date", "Date"]]
  },
  alerts: {
    title: "Emergency Center",
    subtitle: "Send targeted notifications or persistent emergency alarms.",
    singular: "Alert",
    fields: [
      ["alert_type", "Alert type", "select", true, ["Notification", "Alarm"]],
      ["title", "Alert title", "text", true],
      ["recipient", "Send to", "select", true, ["Vendor", "Sponsorship Team", "Attendee", "All"]],
      ["message", "Message", "textarea", false],
      ["created_at", "Created at", "text", false],
      ["status", "Status", "text", false]
    ],
    columns: [["alert_type", "Type"], ["title", "Title"], ["recipient", "Recipient"], ["message", "Message"], ["created_at", "Created at"], ["status", "Status"]]
  }
};

const currency = n => "₹" + Number(n || 0).toLocaleString("en-IN", {maximumFractionDigits: 2});
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function toast(title, message, duration=3500, meta="") {
  const host = $("#toastHost");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<strong>${esc(title)}</strong><p>${esc(message)}</p>${meta ? `<div class="toast-meta">${esc(meta)}</div>` : ""}`;
  host.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

async function api(path, options = {}) {
  const response = await fetch(path, {headers: {"Content-Type": "application/json"}, ...options});
  if (response.status === 401) {
    location.href = "/";
    throw new Error("Login expired");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function getEventNames() {
  try {
    const evs = await api("/api/events");
    return evs.map(e => e.name);
  } catch(e) {
    return [];
  }
}

async function navTo(view) {
  state.view = view;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const labels = {
    dashboard: "Dashboard Overview", events: "Events", registrations: "Registrations & Tickets",
    vendors: "Vendors", resources: "Resources", budget: "Budget Tracking",
    sponsorships: "Sponsorships", emergency: "Emergency Center", reports: "Reports & Audit"
  };
  $("#pageTitle").textContent = labels[view] || "PlanPro";
  $("#sidebar").classList.remove("open");
  renderView();
}

$("#sideNav").addEventListener("click", e => {
  const b = e.target.closest("[data-view]");
  if (b) navTo(b.dataset.view);
});
$("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

async function renderView() {
  const root = $("#viewRoot");
  if (state.view === "dashboard") {
    root.innerHTML = `<div class="page-intro"><div><h3>Good morning, Admin</h3><p>Here’s your event operations snapshot at a glance.</p></div><button class="btn yellow" onclick="navTo('events')">＋ Create event</button></div><div id="stats" class="stat-grid"></div><div class="two-col"><section class="panel"><div class="panel-head"><h4>Quick actions</h4><span class="muted">Shortcuts</span></div><div class="quick-grid"><button class="quick-action" onclick="openForm('events')"><span>＋</span>Create an event</button><button class="quick-action" onclick="openForm('registrations')"><span>♙</span>Register attendee</button><button class="quick-action" onclick="openForm('resources')"><span>▧</span>Update resources</button><button class="quick-action" onclick="navTo('emergency')"><span>⚠</span>Send an alert</button></div></section><section class="panel"><div class="panel-head"><h4>Resource availability</h4><span class="muted">Live stock check</span></div><div id="resourceSummary"></div></section></div><section class="panel"><div class="panel-head"><h4>Recent events</h4><button class="btn ghost small" onclick="navTo('events')">View all</button></div><div id="recentEvents"></div></section>`;
    await loadDashboard();
    return;
  }
  
  if (state.view === "budget") {
    const evNames = await getEventNames();
    root.innerHTML = `<div class="page-intro"><div><h3>Budget overview</h3><p>Allocated funds, recorded expenses, sponsorship and balances per event.</p></div><button class="btn yellow" onclick="openForm('expenses')">＋ Add expense</button></div><div class="toolbar" style="margin-bottom:18px"><label class="muted" style="font-size:12px">Filter Event:</label><select id="budgetEventFilter" class="search-input" style="width:245px"><option value="">All Events (Summary)</option>${evNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select><button class="btn ghost small" onclick="exportTable('expenses')">Export Expenses CSV</button></div><div id="budgetStats" class="stat-grid"></div><div id="eventBudgetReceiptArea"></div><section class="panel"><div class="panel-head"><h4>Expense ledger</h4></div><div id="moduleTable"></div></section>`;
    $("#budgetEventFilter").onchange = async e => {
      await loadBudget(e.target.value);
    };
    await loadBudget("");
    return;
  }
  
  if (state.view === "emergency") {
    root.innerHTML = `<div class="page-intro"><div><h3>Emergency Center</h3><p>Send a quick notification or trigger persistent alarms for urgent situations.</p></div></div><div class="alert-tabs"><button class="alert-tab active" data-mode="notification">♧ Notification</button><button class="alert-tab" data-mode="alarm">◉ Alarm</button></div><section class="panel" id="alertPanel"></section><section class="panel"><div class="panel-head"><h4>Recent alerts</h4><button class="btn ghost small" onclick="exportTable('alerts')">Export CSV</button></div><div id="alertHistory"></div></section>`;
    bindAlertTabs();
    await renderAlertPanel();
    await renderTable("alerts", "#alertHistory", true);
    return;
  }
  
  if (state.view === "reports") {
    root.innerHTML = `<div class="page-intro"><div><h3>Reports & Audit</h3><p>Export module data for review, submission and record keeping.</p></div></div><div class="report-grid">${[["events","Events report","Event schedules, venue, capacity and allocated budgets."],["registrations","Registration report","Attendee list, ticket IDs and attendance."],["vendors","Vendor report","Vendor contacts, service types and assignments."],["resources","Resource report","Required and available quantities."],["expenses","Expense report","Expense ledger and dates."],["sponsorships","Sponsorship report","Sponsor commitments and amounts."],["alerts","Alert audit","Notification and alarm history."]].map(x=>`<div class="report-card"><h4>${x[1]}</h4><p>${x[2]}</p><button class="btn ghost small" onclick="exportTable('${x[0]}')">Download CSV ↗</button></div>`).join("")}<div class="report-card" style="border-color:var(--yellow)"><h4>Master Workspace Audit Report</h4><p>Download all system modules neatly bundled in a single consolidated report file.</p><button class="btn yellow small" onclick="location.href='/api/export/master'">Download Master CSV ↗</button></div></div>`;
    return;
  }
  
  const key = state.view, cfg = configs[key];
  if (!cfg) { root.innerHTML = "<div class='panel'>Module unavailable.</div>"; return; }
  
  let extraFilterHTML = "";
  const evNames = await getEventNames();
  if (key === "registrations" || key === "vendors" || key === "resources") {
    extraFilterHTML = `<select class="search-input" id="moduleEventFilter" style="width:200px"><option value="">All Events</option>${evNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>`;
  }
  
  root.innerHTML = `<div class="page-intro"><div><h3>${cfg.title}</h3><p>${cfg.subtitle}</p></div><button class="btn yellow" onclick="openForm('${key}')">＋ Add ${cfg.singular}</button></div><section class="panel"><div class="panel-head"><h4>${cfg.title} list</h4><div class="toolbar">${extraFilterHTML}<input class="search-input" id="tableSearch" placeholder="Search records..."><button class="btn ghost small" onclick="exportTable('${key}')">Export CSV</button></div></div><div id="moduleTable"></div></section>`;
  
  await renderTable(key);
  const search = $("#tableSearch");
  if (search) search.addEventListener("input", () => filterTable(key, search.value));
  const modFilter = $("#moduleEventFilter");
  if (modFilter) modFilter.onchange = () => filterTable(key, search ? search.value : "");
}

async function loadDashboard() {
  try {
    const s = await api("/api/summary");
    $("#stats").innerHTML = [
      ["Total Events", s.events, "▣", "Events in your workspace"],
      ["Total Vendors", s.vendors, "♧", "Registered service providers"],
      ["Total Budget", currency(s.budget), "₹", "Across all events"],
      ["Total Expenses", currency(s.expenses), "↗", "Recorded spending"],
      ["Sponsorship", currency(s.sponsorship), "✦", "Sponsor contributions"],
      ["Budget Balance", currency(s.balance), "◈", "Budget + sponsorship − expenses"],
      ["Registrations", s.registrations, "♙", "Attendee records"],
      ["Resource Shortages", s.shortages, "⚠", s.shortages ? "Needs attention" : "No shortages detected"]
    ].map((x, i) => `<div class="stat-card"><div class="stat-top">${x[0]}<span class="stat-icon">${x[2]}</span></div><div class="stat-value" style="${i===7&&s.shortages?'color:var(--red)':''}">${x[1]}</div><div class="stat-note">${x[3]}</div></div>`).join("");
    
    const resources = await api("/api/resources");
    $("#resourceSummary").innerHTML = resources.length ? resources.slice(0, 5).map(r => {
      const req = Number(r.required_qty) || 0, avail = Number(r.available_qty) || 0, pct = req ? Math.min(100, avail / req * 100) : 100;
      return `<div class="progress-row"><div class="progress-label"><span>${esc(r.name)} (${esc(r.event_name)})</span><span>${avail} / ${req}</span></div><div class="progress"><span style="width:${pct}%;${avail<req?'background:var(--red)':''}"></span></div></div>`;
    }).join("") : `<div class="empty-state">No resources added yet.</div>`;
    
    const events = await api("/api/events");
    $("#recentEvents").innerHTML = events.length ? tableHTML("events", events.slice(0, 5), true) : `<div class="empty-state">No events yet. Create your first event.</div>`;
  } catch(e) {
    toast("Could not load dashboard", e.message);
  }
}

async function loadBudget(eventName="") {
  try {
    const s = await api("/api/summary");
    $("#budgetStats").innerHTML = [
      ["Allocated Budget", currency(s.budget)],
      ["Expenses", currency(s.expenses)],
      ["Sponsorship", currency(s.sponsorship)],
      ["Remaining Balance", currency(s.balance)]
    ].map(x => `<div class="stat-card"><div class="stat-top">${x[0]}</div><div class="stat-value">${x[1]}</div><div class="stat-note">Updated from saved records</div></div>`).join("");

    const receiptArea = $("#eventBudgetReceiptArea");
    if (eventName) {
      const res = await api(`/api/event-budget/${encodeURIComponent(eventName)}`);
      receiptArea.innerHTML = `<section class="panel" style="background:var(--panel2);border-color:var(--purple);margin-bottom:20px"><div class="panel-head"><h4>Bill & Ledger Summary for: ${esc(res.event_name)}</h4><span class="status good">Balance: ${currency(res.remaining_balance)}</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:12px;margin-bottom:14px"><div><strong>Allocated Budget:</strong> ${currency(res.allocated_budget)}</div><div><strong>Total Expenses:</strong> ${currency(res.total_expenses)}</div><div><strong>Confirmed Sponsorship:</strong> ${currency(res.total_sponsorship)}</div></div><div class="muted" style="font-size:11px">Expenses logged: ${res.expenses.length} item(s)</div></section>`;
    } else {
      receiptArea.innerHTML = "";
    }
    await renderTable("expenses");
  } catch(e) {
    toast("Budget unavailable", e.message);
  }
}

function tableHTML(key, rows, compact=false) {
  const cfg = configs[key];
  if (!rows.length) return `<div class="empty-state">No records found.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${cfg.columns.map(c=>`<th>${c[1]}</th>`).join("")}${compact?"":"<th>Actions</th>"}</tr></thead><tbody>${rows.map(r=>`<tr>${cfg.columns.map(c=>`<td>${cellValue(key,c[0],r)}</td>`).join("")}${compact?"":`<td><div class="toolbar">${key==='registrations'?`<button class="btn yellow small" onclick="showTicketModal(${r.id})">Ticket</button>`:''}<button class="btn ghost small" onclick="editRecord('${key}',${r.id})">Edit</button><button class="btn danger small" onclick="deleteRecord('${key}',${r.id})">Delete</button></div></td>`}</tr>`).join("")}</tbody></table></div>`;
}

function cellValue(key, col, r) {
  if (key === "resources" && col === "shortage") {
    const shortage = (Number(r.available_qty) || 0) < (Number(r.required_qty) || 0);
    return `<span class="status ${shortage?'bad':'good'}">${shortage?`Short by ${(Number(r.required_qty)||0)-(Number(r.available_qty)||0)}`:"Sufficient"}</span>`;
  }
  if (["budget", "amount", "unit_cost"].includes(col)) return currency(r[col]);
  if (["status", "attendance", "availability"].includes(col)) {
    const val = r[col] || "—", cls = ["Completed", "Present", "Available", "Confirmed", "Received", "Sufficient"].includes(val) ? "good" : ["Pending", "Unknown", "Planned", "Assigned", "Registered"].includes(val) ? "warn" : ["Cancelled", "Absent", "Unavailable", "Shortage", "Active", "Ongoing"].includes(val) ? (val==="Ongoing"?"warn":"bad") : "";
    return `<span class="status ${cls}">${esc(val)}</span>`;
  }
  return esc(r[col] || "—");
}

async function renderTable(key, selector="#moduleTable", compact=false) {
  try {
    const rows = await api("/api/" + key);
    state.cache[key] = rows;
    const target = $(selector);
    if (target) target.innerHTML = tableHTML(key, rows, compact);
  } catch(e) {
    toast("Could not load records", e.message);
  }
}

function filterTable(key, q) {
  let rows = state.cache[key] || [];
  const eventFilterSel = $("#moduleEventFilter");
  const eventVal = eventFilterSel ? eventFilterSel.value : "";
  if (eventVal) {
    rows = rows.filter(r => r.event_name === eventVal || r.assigned_event === eventVal);
  }
  if (q) {
    rows = rows.filter(r => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q.toLowerCase())));
  }
  const target = $("#moduleTable");
  if (target) target.innerHTML = tableHTML(key, rows);
}

async function openForm(key, record=null) {
  const cfg = configs[key];
  if (!cfg) return;
  const evNames = await getEventNames();
  
  cfg.fields.forEach(f => {
    if (f[4] && (f[0] === "event_name" || f[0] === "assigned_event")) {
      f[4] = evNames;
    }
  });

  const data = record || {}, modal = $("#modalRoot");
  const fields = cfg.fields.filter(f => !(key === "alerts" && f[0] === "alert_type"));
  
  modal.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><section class="modal"><div class="modal-head"><h3>${record?"Edit":"Add"} ${cfg.singular}</h3><button class="close-btn" id="closeModal">×</button></div><form id="recordForm" class="form-grid">${fields.map(f=>fieldHTML(f,data[f[0]])).join("")}<div class="field full"><div class="hint">All changes are saved to the local database.</div></div><div class="field full"><div class="modal-actions"><button type="button" class="btn ghost" id="cancelModal">Cancel</button><button class="btn yellow" type="submit">Save ${cfg.singular}</button></div></div></form></section></div>`;
  
  const close = () => modal.innerHTML = "";
  $("#closeModal").onclick = close;
  $("#cancelModal").onclick = close;
  $("#modalBackdrop").addEventListener("click", e => { if (e.target.id === "modalBackdrop") close(); });
  
  $("#recordForm").onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), payload = {};
    for (const [k, v] of fd.entries()) payload[k] = v;
    try {
      const url = record ? `/api/${key}/${record.id}` : `/api/${key}`;
      const res = await api(url, {method: record ? "PUT" : "POST", body: JSON.stringify(payload)});
      close();
      toast("Saved", `${cfg.singular} saved successfully.`);
      
      if (key === "registrations" && !record && res.record) {
        showTicketModalById(res.record);
      }
      
      if (state.view === "dashboard") await loadDashboard();
      else if (state.view === "budget") await loadBudget($("#budgetEventFilter")?.value || "");
      else if (state.view === "emergency") { await renderTable("alerts", "#alertHistory", true); await renderAlertPanel(); }
      else await renderTable(key);
    } catch(err) {
      toast("Could not save", err.message);
    }
  };
}

function fieldHTML(f, value="") {
  const [name, label, type, required, options] = f;
  let val = value ?? "";
  
  if (type === "select") {
    return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}" ${required?"required":""}>${(options || []).map(o => `<option ${String(val) === o ? "selected" : ""} value="${esc(o)}">${esc(o)}</option>`).join("")}</select></div>`;
  }
  if (type === "textarea") {
    return `<div class="field full"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" ${required?"required":""}>${esc(val)}</textarea></div>`;
  }
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(val)}" ${required?"required":""} ${type==="number"?'min="0" step="any"':""}></div>`;
}

async function showTicketModal(id) {
  const rows = await api("/api/registrations");
  const rec = rows.find(r => r.id === id);
  if (rec) showTicketModalById(rec);
}

function showTicketModalById(rec) {
  const modal = $("#modalRoot");
  modal.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><section class="modal" style="border-color:var(--yellow);text-align:center"><div class="modal-head"><h3>🎟️ Attendee Ticket</h3><button class="close-btn" id="closeModal">×</button></div><div style="background:var(--panel2);border:1px dashed var(--yellow);padding:20px;border-radius:12px;margin:15px 0"><h2 style="color:var(--yellow);margin:0 0 10px">${esc(rec.ticket_id)}</h2><p style="font-size:14px;font-weight:700;margin:5px 0">${esc(rec.attendee)}</p><p class="muted" style="margin:5px 0">Event: ${esc(rec.event_name)}</p><p class="muted" style="margin:5px 0">Email: ${esc(rec.email)}</p><p class="muted" style="margin:5px 0">Registered: ${esc(rec.registered_at)}</p><p style="margin-top:10px"><span class="status good">Attendance: ${esc(rec.attendance)}</span></p></div><button class="btn yellow" onclick="$('#modalRoot').innerHTML=''">Close Ticket</button></section></div>`;
  $("#closeModal").onclick = () => modal.innerHTML = "";
  $("#modalBackdrop").addEventListener("click", e => { if (e.target.id === "modalBackdrop") modal.innerHTML = ""; });
}

async function editRecord(key, id) {
  const rows = await api("/api/" + key), record = rows.find(r => r.id === id);
  if (record) openForm(key, record);
}

async function deleteRecord(key, id) {
  if (!confirm("Delete this record permanently?")) return;
  try {
    await api(`/api/${key}/${id}`, {method: "DELETE"});
    toast("Deleted", "Record removed.");
    if (state.view === "dashboard") loadDashboard();
    else if (state.view === "budget") loadBudget($("#budgetEventFilter")?.value || "");
    else renderTable(key);
  } catch(e) {
    toast("Delete failed", e.message);
  }
}

function exportTable(key) {
  location.href = "/api/export/" + key;
}

function bindAlertTabs() {
  $$(".alert-tab").forEach(b => b.addEventListener("click", () => { $$
(".alert-tab").forEach(x => x.classList.toggle("active", x === b));
    state.alertMode = b.dataset.mode;
    renderAlertPanel();
  }));
}

async function renderAlertPanel() {
  const panel = $("#alertPanel");
  if (!panel) return;
  if (state.alertMode === "notification") {
    panel.innerHTML = `<div class="panel-head"><h4>Send notification</h4><span class="status">Popup · 5 seconds</span></div><form id="notificationForm" class="form-grid"><div class="field full"><label>Notification title</label><input name="title" placeholder="e.g. Chair shortage in main hall" required></div><div class="field"><label>Send to</label><select name="recipient"><option>Vendor</option><option>Sponsorship Team</option><option>Attendee</option><option>All</option></select></div><div class="field full"><label>Message (optional)</label><textarea name="message" placeholder="Add a short update or instruction..."></textarea></div><div class="field full"><div class="modal-actions"><button class="btn yellow" type="submit">Send notification ↗</button></div><div class="hint">Displays a self-dissolving popup with a short 1-second chime and saves to audit history.</div></div></form>`;
    $("#notificationForm").onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target), data = {alert_type: "Notification", title: fd.get("title"), recipient: fd.get("recipient"), message: fd.get("message"), status: "Sent"};
      try {
        await api("/api/alerts", {method: "POST", body: JSON.stringify(data)});
        toast(data.title, data.message || "Notification sent.", 5000, `TO: ${data.recipient.toUpperCase()}`);
        playShortSound();
        await renderTable("alerts", "#alertHistory", true);
        e.target.reset();
      } catch(err) {
        toast("Notification failed", err.message);
      }
    };
  } else {
    panel.innerHTML = `<div class="panel-head"><h4>Alarm control</h4><span class="status bad">Emergency Siren Mode</span></div><p class="muted">Fill in the emergency alarm details and recipient. Triggering the alarm will open a persistent popup with continuous sound that requires clicking the Stop button to dismiss.</p><form id="alarmForm" class="form-grid"><div class="field full"><label>Alarm title</label><input name="title" placeholder="e.g. Fire emergency in sector B" required></div><div class="field"><label>Send to</label><select name="recipient"><option>Vendor</option><option>Sponsorship Team</option><option>Attendee</option><option>All</option></select></div><div class="field full"><label>Message / Note</label><textarea name="message" placeholder="Provide instructions or emergency details..." required></textarea></div><div class="field full"><div class="modal-actions"><button class="btn danger" type="submit">◉ Trigger Emergency Alarm ↗</button></div></div></form>`;
    $("#alarmForm").onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = fd.get("title"), recipient = fd.get("recipient"), message = fd.get("message");
      try {
        await api("/api/alerts", {method: "POST", body: JSON.stringify({alert_type: "Alarm", title, recipient, message, status: "Active"})});
        playAlarm(title, recipient, message);
        await renderTable("alerts", "#alertHistory", true);
        e.target.reset();
      } catch(err) {
        toast("Alarm failed", err.message);
      }
    };
  }
}

let audioCtx = null, alarmOsc = null, alarmInterval = null;

function playShortSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; gain.gain.value = 0.06;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 1000);
  } catch(e) {}
}

function playAlarm(title="Emergency Alarm", recipient="All", message="Urgent emergency broadcasted.") {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    alarmOsc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    alarmOsc.type = "sawtooth";
    alarmOsc.frequency.value = 720;
    gain.gain.value = 0.05;
    alarmOsc.connect(gain);
    gain.connect(audioCtx.destination);
    alarmOsc.start();
    let high = false;
    alarmInterval = setInterval(() => {
      if (alarmOsc) {
        high = !high;
        alarmOsc.frequency.setValueAtTime(high ? 920 : 620, audioCtx.currentTime);
      }
    }, 450);

    const modal = $("#modalRoot");
    modal.innerHTML = `<div class="modal-backdrop" style="background:#000000ee;z-index:9999"><section class="modal" style="border-color:var(--red);text-align:center"><h2 style="color:var(--red);font-size:26px">🚨 ${esc(title)} 🚨</h2><p class="status bad" style="margin:10px 0">SENT TO: ${esc(recipient.toUpperCase())}</p><p style="font-size:14px;color:#ffd6dc;background:#4b202c;padding:12px;border-radius:8px;margin:15px 0;text-align:left"><strong>Note/Message:</strong><br>${esc(message)}</p><p class="muted" style="margin-bottom:20px">Continuous siren is active. Click the button below to silence and dismiss.</p><button class="btn danger" style="font-size:15px;padding:12px 24px" onclick="stopAlarmModal()">■ Stop</button></section></div>`;
  } catch(e) {
    toast("Audio unavailable", "Your browser may have blocked sound.");
  }
}

function stopAlarmModal() {
  if (alarmInterval) clearInterval(alarmInterval);
  alarmInterval = null;
  try {
    if (alarmOsc) { alarmOsc.stop(); alarmOsc.disconnect(); }
    if (audioCtx) audioCtx.close();
  } catch(e) {}
  alarmOsc = null; audioCtx = null;
  $("#modalRoot").innerHTML = "";
  toast("Alarm stopped", "The emergency alarm has been silenced.");
}

window.addEventListener("beforeunload", () => {
  if (alarmInterval) clearInterval(alarmInterval);
  try { if (audioCtx) audioCtx.close(); } catch(e) {}
});

navTo("dashboard");