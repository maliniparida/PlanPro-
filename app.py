from flask import Flask, render_template, request, jsonify, redirect, url_for, session, Response
from functools import wraps
import sqlite3, csv, io, os
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.environ.get("PLANPRO_SECRET", "change-this-planpro-secret-key")
DB_PATH = os.path.join(os.path.dirname(__file__), "planpro.db")

TABLES = {
    "events": ["name", "venue", "event_date", "event_time", "capacity", "budget", "status", "manager"],
    "registrations": ["attendee", "event_name", "ticket_id", "email", "registered_at", "attendance"],
    "vendors": ["name", "phone", "email", "service", "category", "availability", "assigned_event"],
    "resources": ["name", "event_name", "required_qty", "available_qty", "unit_cost", "notes"],
    "sponsorships": ["sponsor", "event_name", "amount", "contact", "status"],
    "expenses": ["event_name", "description", "amount", "expense_date"],
    "alerts": ["alert_type", "title", "recipient", "message", "created_at", "status"]
}
NUMERIC = {"capacity", "budget", "required_qty", "available_qty", "unit_cost", "amount"}

def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = connect()
    for table, cols in TABLES.items():
        definitions = ", ".join(f'"{c}" TEXT' for c in cols)
        con.execute(f'CREATE TABLE IF NOT EXISTS "{table}" (id INTEGER PRIMARY KEY AUTOINCREMENT, {definitions})')
    con.commit()
    con.close()

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("logged_in"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Please log in again."}), 401
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper

@app.route("/", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if username == "admin" and password == "admin123":
            session["logged_in"] = True
            session["username"] = username
            return redirect(url_for("dashboard"))
        error = "Invalid username or password."
    return render_template("login.html", error=error)

@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", username=session.get("username", "Admin"))

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/api/<table>", methods=["GET", "POST"])
@login_required
def collection(table):
    if table not in TABLES:
        return jsonify({"error": "Unknown module"}), 404
    con = connect()
    if request.method == "GET":
        rows = con.execute(f'SELECT * FROM "{table}" ORDER BY id DESC').fetchall()
        con.close()
        return jsonify([dict(row) for row in rows])
    
    data = request.get_json(silent=True) or {}
    values = {c: data.get(c, "") for c in TABLES[table]}
    
    for key in NUMERIC.intersection(values):
        if values[key] in (None, ""):
            values[key] = "0"
        try:
            values[key] = str(float(values[key]) if "." in str(values[key]) else int(values[key]))
        except (ValueError, TypeError):
            con.close()
            return jsonify({"error": f"{key.replace('_', ' ').title()} must be a number."}), 400
            
    if table == "events":
        if not values.get("status"):
            values["status"] = "Planned"
            
    if table == "registrations":
        if not values.get("ticket_id"):
            values["ticket_id"] = f"PP-{datetime.now().strftime('%y%m%d%H%M%S')}"
        if not values.get("registered_at"):
            values["registered_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        else:
            values["registered_at"] = values["registered_at"].replace("T", " ")
        if not values.get("attendance"):
            values["attendance"] = "Unknown"
            
    if table == "alerts":
        values["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not values.get("status"):
            values["status"] = "Active" if values.get("alert_type") == "Alarm" else "Sent"

    columns = list(values.keys())
    quoted_columns = ",".join('"' + c + '"' for c in columns)
    marks = ",".join("?" for _ in columns)
    cursor = con.execute(f'INSERT INTO "{table}" ({quoted_columns}) VALUES ({marks})', [values[c] for c in columns])
    new_id = cursor.lastrowid
    con.commit()
    
    saved_row = dict(con.execute(f'SELECT * FROM "{table}" WHERE id=?', (new_id,)).fetchone())
    con.close()
    return jsonify({"success": True, "message": "Saved successfully.", "record": saved_row}), 201

@app.route("/api/<table>/<int:item_id>", methods=["PUT", "DELETE"])
@login_required
def item(table, item_id):
    if table not in TABLES:
        return jsonify({"error": "Unknown module"}), 404
    con = connect()
    if not con.execute(f'SELECT id FROM "{table}" WHERE id=?', (item_id,)).fetchone():
        con.close()
        return jsonify({"error": "Record not found."}), 404
    if request.method == "DELETE":
        con.execute(f'DELETE FROM "{table}" WHERE id=?', (item_id,))
        con.commit()
        con.close()
        return jsonify({"success": True})
        
    data = request.get_json(silent=True) or {}
    values = {c: data.get(c, "") for c in TABLES[table]}
    for key in NUMERIC.intersection(values):
        if values[key] in (None, ""):
            values[key] = "0"
        try:
            values[key] = str(float(values[key]) if "." in str(values[key]) else int(values[key]))
        except (ValueError, TypeError):
            con.close()
            return jsonify({"error": f"{key.replace('_', ' ').title()} must be a number."}), 400
            
    if table == "registrations" and values.get("registered_at"):
        values["registered_at"] = values["registered_at"].replace("T", " ")
            
    assignments = ",".join(f'"{c}"=?' for c in values)
    con.execute(f'UPDATE "{table}" SET {assignments} WHERE id=?', [values[c] for c in values] + [item_id])
    con.commit()
    updated_row = dict(con.execute(f'SELECT * FROM "{table}" WHERE id=?', (item_id,)).fetchone())
    con.close()
    return jsonify({"success": True, "record": updated_row})

@app.route("/api/summary")
@login_required
def summary():
    con = connect()
    count = lambda t: con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    sumval = lambda t, c: float(con.execute(f'SELECT COALESCE(SUM(CAST("{c}" AS REAL)),0) FROM "{t}"').fetchone()[0] or 0)
    events, vendors, registrations = count("events"), count("vendors"), count("registrations")
    budget, expenses, sponsorship = sumval("events", "budget"), sumval("expenses", "amount"), sumval("sponsorships", "amount")
    shortages = con.execute("SELECT COUNT(*) FROM resources WHERE CAST(available_qty AS REAL)<CAST(required_qty AS REAL)").fetchone()[0]
    con.close()
    return jsonify({"events": events, "vendors": vendors, "registrations": registrations, "budget": budget,
                    "expenses": expenses, "sponsorship": sponsorship, "balance": budget + sponsorship - expenses,
                    "shortages": shortages})

@app.route("/api/event-budget/<path:event_name>")
@login_required
def event_budget_summary(event_name):
    con = connect()
    ev = con.execute("SELECT * FROM events WHERE name=?", (event_name,)).fetchone()
    if not ev:
        con.close()
        return jsonify({"error": "Event not found"}), 404
    alloc_budget = float(ev["budget"] or 0)
    exps = con.execute("SELECT * FROM expenses WHERE event_name=?", (event_name,)).fetchall()
    total_exp = sum(float(x["amount"] or 0) for x in exps)
    sponsors = con.execute("SELECT * FROM sponsorships WHERE event_name=?", (event_name,)).fetchall()
    total_spons = sum(float(s["amount"] or 0) for s in sponsors if s["status"] in ("Confirmed", "Received"))
    con.close()
    return jsonify({
        "event_name": event_name,
        "allocated_budget": alloc_budget,
        "expenses": [dict(e) for e in exps],
        "total_expenses": total_exp,
        "total_sponsorship": total_spons,
        "remaining_balance": alloc_budget + total_spons - total_exp
    })

@app.route("/api/export/<table>")
@login_required
def export_csv(table):
    if table not in TABLES:
        return "Unknown module", 404
    con = connect()
    rows = con.execute(f'SELECT * FROM "{table}" ORDER BY id').fetchall()
    con.close()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id"] + TABLES[table])
    for row in rows:
        writer.writerow([row["id"]] + [row[c] for c in TABLES[table]])
    return Response(output.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=planpro_{table}.csv"})

@app.route("/api/export/master")
@login_required
def export_master():
    con = connect()
    output = io.StringIO()
    writer = csv.writer(output)
    for table, cols in TABLES.items():
        writer.writerow([f"=== MODULE: {table.upper()} ==="])
        writer.writerow(["id"] + cols)
        rows = con.execute(f'SELECT * FROM "{table}" ORDER BY id').fetchall()
        for row in rows:
            writer.writerow([row["id"]] + [row[c] for c in cols])
        writer.writerow([])
    con.close()
    return Response(output.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=planpro_master_report.csv"})

if __name__ == "__main__":
    init_db()
    app.run(debug=True)