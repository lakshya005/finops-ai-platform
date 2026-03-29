import base64
import json
import os
import urllib.request


# ---------------------------------------------------------------------------
# Field mapping: CostEvent camelCase → ClickHouse snake_case
# ---------------------------------------------------------------------------

FIELD_MAP = {
    "requestId":   "request_id",
    "orgId":       "org_id",
    "provider":    "provider",
    "model":       "model",
    "inputTokens": "input_tokens",
    "outputTokens":"output_tokens",
    "costUsd":     "cost_usd",
    "timestampMs": "timestamp_ms",
    "durationMs":  "duration_ms",
}


def _parse_record(raw_body: str) -> dict:
    """Parse one SQS message body into a ClickHouse row dict."""
    event = json.loads(raw_body)
    return {ch_col: event[js_key] for js_key, ch_col in FIELD_MAP.items()}


def _build_jsoneachrow(rows: list[dict]) -> bytes:
    """Serialize a list of row dicts as JSONEachRow: one JSON object per line."""
    return "\n".join(json.dumps(row) for row in rows).encode("utf-8")


def _insert_rows(rows: list[dict]) -> None:
    """Send a single HTTP POST to ClickHouse with all rows."""
    host     = os.environ["CLICKHOUSE_HOST"].rstrip("/")
    user     = os.environ["CLICKHOUSE_USER"]
    password = os.environ["CLICKHOUSE_PASSWORD"]
    db       = os.environ["CLICKHOUSE_DB"]

    url     = f"{host}/?query=INSERT+INTO+cost_events+FORMAT+JSONEachRow"
    payload = _build_jsoneachrow(rows)

    credentials = base64.b64encode(f"{user}:{password}".encode()).decode()

    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization":          f"Basic {credentials}",
            "X-ClickHouse-Database":  db,
            "Content-Type":           "application/x-www-form-urlencoded",
        },
    )

    with urllib.request.urlopen(req) as resp:
        status = resp.status
        body   = resp.read().decode("utf-8")

    print(f"[clickhouse] response status: {status}")

    if status != 200:
        raise Exception(f"ClickHouse insert failed (HTTP {status}): {body}")


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    records = event.get("Records", [])
    print(f"[handler] received {len(records)} record(s) from SQS")

    rows = []
    for i, record in enumerate(records):
        try:
            row = _parse_record(record["body"])
            rows.append(row)
        except Exception as exc:
            print(f"[handler] skipping record {i} — parse error: {exc}")

    print(f"[handler] successfully parsed {len(rows)} / {len(records)} record(s)")

    if not rows:
        print("[handler] nothing to insert, exiting")
        return {"statusCode": 200, "inserted": 0}

    # A raised exception here propagates to Lambda, which signals SQS to retry
    # the entire batch — intentional, since the insert is all-or-nothing.
    _insert_rows(rows)

    print(f"[handler] inserted {len(rows)} row(s) into ClickHouse")
    return {"statusCode": 200, "inserted": len(rows)}
