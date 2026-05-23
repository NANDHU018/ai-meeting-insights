import os
import jwt
from functools import wraps
from flask import request, jsonify, g
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "supersecretkey123")


def verify_token(f):
    """Decorator that validates the Bearer JWT token and sets g.user."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header:
            return jsonify({"message": "Access denied. No token provided."}), 401

        parts = auth_header.split(" ")
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({"message": "Invalid token format."}), 401

        token = parts[1]
        try:
            decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            print(f"DEBUG: Token verified for user {decoded.get('id')}")
            g.user = decoded
        except jwt.ExpiredSignatureError:
            print("DEBUG: Token expired")
            return jsonify({"message": "Token has expired."}), 403
        except jwt.InvalidTokenError as e:
            print(f"DEBUG: Invalid token: {e}")
            return jsonify({"message": "Invalid or expired token."}), 403

        return f(*args, **kwargs)
    return decorated
