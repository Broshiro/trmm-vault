"""
vault-proxy — FastAPI wrapper around the Bitwarden CLI (bw)
Exposes organizations, login credentials, and TOTP codes for the
TacticalRMM Vault Tampermonkey userscript.
"""
import json
import os
import subprocess
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="vault-proxy", version="1.0.0")

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

BW_EMAIL    = os.environ["BW_EMAIL"]
BW_PASSWORD = os.environ["BW_PASSWORD"]
BW_SERVER   = os.environ["BW_SERVER"]   # e.g. https://your-vaultwarden-domain

_session: dict = {"key": None, "expires": 0}


def _bw(*args, check=True) -> str:
    env = {**os.environ, "BW_SESSION": _session["key"] or ""}
    result = subprocess.run(
        ["bw", "--nointeraction", *args],
        capture_output=True, text=True, env=env
    )
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def get_session() -> str:
    if _session["key"] and time.time() < _session["expires"]:
        return _session["key"]

    _bw("config", "server", BW_SERVER, check=False)

    status = json.loads(_bw("status", check=False) or '{"status":"unauthenticated"}')

    if status.get("status") == "unauthenticated":
        env = {**os.environ, "BW_PASSWORD": BW_PASSWORD}
        result = subprocess.run(
            ["bw", "--nointeraction", "login", BW_EMAIL, "--passwordenv", "BW_PASSWORD"],
            capture_output=True, text=True, env=env
        )
        if result.returncode != 0:
            raise RuntimeError(f"bw login failed: {result.stderr.strip()}")

    env = {**os.environ, "BW_PASSWORD": BW_PASSWORD}
    result = subprocess.run(
        ["bw", "--nointeraction", "unlock", "--passwordenv", "BW_PASSWORD", "--raw"],
        capture_output=True, text=True, env=env
    )
    if result.returncode != 0:
        raise RuntimeError(f"bw unlock failed: {result.stderr.strip()}")

    _session["key"] = result.stdout.strip()
    _session["expires"] = time.time() + 3600
    return _session["key"]


@app.get("/api/orgs")
def list_orgs():
    try:
        get_session()
        orgs = json.loads(_bw("list", "organizations"))
        return [{"id": o["id"], "name": o["name"]} for o in orgs]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/orgs/{org_id}/items")
def list_items(org_id: str):
    try:
        get_session()
        items = json.loads(_bw("list", "items", "--organizationid", org_id))
        return [
            {
                "id": item["id"],
                "name": item["name"],
                "username": item.get("login", {}).get("username", ""),
                "password": item.get("login", {}).get("password", ""),
                "has_totp": bool(item.get("login", {}).get("totp")),
            }
            for item in items if item.get("type") == 1
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/totp/{item_id}")
def get_totp(item_id: str):
    try:
        get_session()
        return {"totp": _bw("get", "totp", item_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sync")
def sync():
    try:
        get_session()
        _bw("sync")
        _session["expires"] = 0
        return {"status": "synced"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
