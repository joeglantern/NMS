#!/usr/bin/env python3
"""Simulate a Yeastar PBX call through the webhook endpoint."""
import urllib.request
import json
import time
import os

URL = "http://localhost:3000/pbx/webhook"
SECRET = os.environ.get("YEASTAR_WEBHOOK_SECRET", "V0R5joSuCAF1uMWcvQqHK1CXcTbLeBfg")


def post(payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Yeastar-Secret": SECRET,
        },
    )
    res = urllib.request.urlopen(req)
    print(" →", res.read().decode())


print("Step 1: Ringing (check Call Logs page for active call banner)")
post({
    "event": "CallStatus",
    "callid": "sim-001",
    "callfrom": "0700123456",
    "callto": "0711000911",
    "callstatus": "Ringing",
    "calltype": "Inbound",
})
time.sleep(3)

print("Step 2: Answered")
post({
    "event": "CallStatus",
    "callid": "sim-001",
    "callfrom": "0700123456",
    "callto": "0711000911",
    "callstatus": "Talking",
    "calltype": "Inbound",
})
time.sleep(3)

print("Step 3: Call ended — CDR saved to database")
post({
    "event": "NewCdr",
    "callid": "sim-001",
    "timestart": "2026-06-12 15:30:00",
    "callfrom": "0700123456",
    "callto": "0711000911",
    "callduraction": 45,
    "talkduraction": 38,
    "srctrunkname": "SIP-Trunk-1",
    "didnumber": "0711000911",
    "status": "ANSWERED",
    "type": "Inbound",
})

print("Done — check Call Logs page, the record should appear in the table.")
