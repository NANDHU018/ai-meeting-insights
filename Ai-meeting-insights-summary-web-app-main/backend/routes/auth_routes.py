import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import bcrypt
import jwt
from dotenv import load_dotenv
from flask import Blueprint, g, jsonify, request

from config.db import query

load_dotenv()

JWT_SECRET  = os.getenv("JWT_SECRET", "supersecretkey123")
SMTP_HOST   = os.getenv("SMTP_HOST", "")
SMTP_PORT   = int(os.getenv("SMTP_PORT", 587))
SMTP_USER   = os.getenv("SMTP_USER", "")
SMTP_PASS   = os.getenv("SMTP_PASS", "")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5000")

auth_bp = Blueprint("auth", __name__)


# ── REGISTER ──────────────────────────────────────────────────────────────────
@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    full_name = data.get("full_name", "").strip()
    email     = data.get("email", "").strip()
    password  = data.get("password", "")

    if not full_name or not email or not password:
        return jsonify({"message": "All fields are required"}), 400

    existing = query("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        return jsonify({"message": "Email already registered"}), 409

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()

    rows = query(
        "INSERT INTO users (full_name, email, password_hash) "
        "VALUES (%s, %s, %s) RETURNING id, email, full_name",
        (full_name, email, password_hash),
    )
    return jsonify({"message": "User registered successfully", "user": rows[0]}), 201


# ── LOGIN ─────────────────────────────────────────────────────────────────────
@auth_bp.route("/login", methods=["POST"])
def login():
    data     = request.get_json() or {}
    email    = data.get("email", "").strip()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"message": "All fields are required"}), 400

    rows = query("SELECT * FROM users WHERE email = %s", (email,))
    if not rows:
        return jsonify({"message": "Invalid credentials"}), 401

    user = rows[0]
    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"message": "Invalid credentials"}), 401

    token = jwt.encode(
        {
            "id": user["id"],
            "email": user["email"],
            "exp": datetime.now(tz=timezone.utc) + timedelta(hours=1),
        },
        JWT_SECRET,
        algorithm="HS256",
    )

    return jsonify({
        "message": "Login successful",
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "full_name": user["full_name"]},
    }), 200


# ── PROFILE (protected) ───────────────────────────────────────────────────────
@auth_bp.route("/profile", methods=["GET"])
def profile():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        return jsonify({"message": "Access denied. No token."}), 401

    token = auth_header.split(" ")[-1]
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return jsonify({"message": "Invalid or expired token"}), 403

    rows = query(
        "SELECT id, email, full_name FROM users WHERE id = %s::uuid", (decoded["id"],)
    )
    if not rows:
        return jsonify({"message": "User not found"}), 404
    return jsonify(rows[0]), 200


# ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data  = request.get_json() or {}
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"message": "Email is required"}), 400

    rows = query("SELECT id FROM users WHERE email = %s", (email,))
    if not rows:
        return jsonify({"message": "User not found"}), 404

    token   = secrets.token_hex(32)
    expires = datetime.now(tz=timezone.utc) + timedelta(hours=1)

    query(
        "UPDATE users SET reset_password_token = %s, reset_password_expires = %s "
        "WHERE email = %s",
        (token, expires, email),
    )

    reset_url = f"{APP_BASE_URL}/reset-password.html?token={token}"
    _send_reset_email(email, reset_url)

    return jsonify({"message": "Password reset link sent to your email."}), 200


def _send_reset_email(to_email: str, reset_url: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Password Reset Request"
    msg["From"]    = f"AI Meeting Assistant <{SMTP_USER or 'noreply@ai-meeting.example'}>"
    msg["To"]      = to_email

    text = f"You requested a password reset. Click this link: {reset_url}"
    html = (
        f"<p>You requested a password reset.</p>"
        f"<p>Click this <a href=\"{reset_url}\">link</a> to reset your password. "
        f"It will expire in 1 hour.</p>"
    )
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST or "smtp.gmail.com", SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            if SMTP_USER and SMTP_PASS:
                server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(msg["From"], [to_email], msg.as_string())
    except Exception as e:
        print(f"Email send error: {e}")


# ── RESET PASSWORD ────────────────────────────────────────────────────────────
@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data         = request.get_json() or {}
    token        = data.get("token", "")
    new_password = data.get("new_password", "")

    if not token or not new_password:
        return jsonify({"message": "All fields are required"}), 400

    rows = query(
        "SELECT id FROM users WHERE reset_password_token = %s "
        "AND reset_password_expires > NOW()",
        (token,),
    )
    if not rows:
        print(f"DEBUG: No user found for token {token} or token expired")
        return jsonify({"message": "Invalid or expired token"}), 400

    password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt(10)).decode()
    query(
        "UPDATE users SET password_hash = %s, reset_password_token = NULL, "
        "reset_password_expires = NULL WHERE id = %s::uuid",
        (password_hash, rows[0]["id"]),
    )
    return jsonify({"message": "Password successfully updated. You can now log in."}), 200
