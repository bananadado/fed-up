"""Embedding visualiser for the recommender's pgvector store.

Projects recipe and user taste embeddings (384-dim) down to 2D with PCA and
serves an interactive scatter plot. Read-only: it never writes to the database.
"""

import json
import logging
import os
import time
import uuid

import asyncpg
import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("embedding_viz")

app = FastAPI(title="Recommender Embedding Visualiser")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://recommender:changeme_in_production@db:5432/recommender",
)


def log_event(level: int, event: str, **fields: object) -> None:
    logger.log(level, "%s %s", event, json.dumps(fields, default=str, sort_keys=True))


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    request_id = request.headers.get("X-Request-Id", uuid.uuid4().hex[:12])
    try:
        response = await call_next(request)
    except Exception as exc:
        log_event(
            logging.ERROR,
            "request_failed",
            method=request.method,
            path=request.url.path,
            request_id=request_id,
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
            error=str(exc),
        )
        logger.exception("request_failed_trace")
        raise

    response.headers["X-Request-Id"] = request_id
    log_event(
        logging.INFO,
        "request_completed",
        method=request.method,
        path=request.url.path,
        request_id=request_id,
        status_code=response.status_code,
        duration_ms=round((time.perf_counter() - start) * 1000, 2),
    )
    return response


def parse_vector(raw: str | None) -> list[float] | None:
    """pgvector columns are read as their `[a,b,c]` text form via `::text`."""
    if not raw:
        return None
    try:
        return [float(part) for part in raw.strip("[]").split(",") if part]
    except ValueError:
        return None


async def fetch_vectors() -> tuple[list[str], list[str], list[list[float]]]:
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        recipe_rows = await conn.fetch(
            "SELECT id, name, embedding::text AS emb FROM recipes WHERE embedding IS NOT NULL"
        )
        user_rows = await conn.fetch(
            "SELECT id, taste_embedding::text AS emb FROM users WHERE taste_embedding IS NOT NULL"
        )
    finally:
        await conn.close()

    labels: list[str] = []
    kinds: list[str] = []
    vectors: list[list[float]] = []

    for row in recipe_rows:
        vector = parse_vector(row["emb"])
        if vector:
            labels.append(row["name"] or row["id"])
            kinds.append("recipe")
            vectors.append(vector)

    for row in user_rows:
        vector = parse_vector(row["emb"])
        if vector:
            labels.append(row["id"])
            kinds.append("user")
            vectors.append(vector)

    return labels, kinds, vectors


def pca_2d(vectors: list[list[float]]) -> list[list[float]]:
    """Project vectors to 2D using SVD-based PCA (numpy only)."""
    matrix = np.asarray(vectors, dtype=np.float64)
    if matrix.shape[0] < 2:
        return [[0.0, 0.0] for _ in range(matrix.shape[0])]
    centered = matrix - matrix.mean(axis=0)
    _, _, components = np.linalg.svd(centered, full_matrices=False)
    coords = centered @ components[:2].T
    return coords.tolist()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/points")
async def points() -> JSONResponse:
    labels, kinds, vectors = await fetch_vectors()
    if not vectors:
        log_event(logging.INFO, "embedding_points_loaded", points=0)
        return JSONResponse({"points": []})

    coords = pca_2d(vectors)
    payload = [
        {"x": coords[i][0], "y": coords[i][1], "label": labels[i], "kind": kinds[i]}
        for i in range(len(labels))
    ]
    log_event(logging.INFO, "embedding_points_loaded", points=len(payload))
    return JSONResponse({"points": payload})


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
    return HTML_PAGE


HTML_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Recommender embeddings</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
    #chart { width: 100vw; height: 100vh; }
    .bar { position: fixed; top: 10px; left: 14px; z-index: 10; font-size: 14px; }
    button { background: #2a2f3a; color: #e6e6e6; border: 1px solid #3a4150; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
    .muted { color: #8a93a6; }
  </style>
</head>
<body>
  <div class="bar">
    <strong>Recommender embeddings</strong>
    <span class="muted">· PCA(384 → 2) · <span id="count">loading…</span></span>
    <button onclick="load()">Refresh</button>
  </div>
  <div id="chart"></div>
  <script>
    async function load() {
      const res = await fetch('api/points');
      const data = await res.json();
      const pts = data.points || [];
      document.getElementById('count').textContent = pts.length + ' vectors';
      const groups = { recipe: { x: [], y: [], text: [] }, user: { x: [], y: [], text: [] } };
      for (const p of pts) {
        const g = groups[p.kind] || (groups[p.kind] = { x: [], y: [], text: [] });
        g.x.push(p.x); g.y.push(p.y); g.text.push(p.label);
      }
      const traces = [
        { name: 'recipes', x: groups.recipe.x, y: groups.recipe.y, text: groups.recipe.text,
          mode: 'markers', type: 'scattergl', marker: { size: 8, color: '#4f9cf9' },
          hovertemplate: '%{text}<extra>recipe</extra>' },
        { name: 'users', x: groups.user.x, y: groups.user.y, text: groups.user.text,
          mode: 'markers', type: 'scattergl', marker: { size: 12, color: '#f97362', symbol: 'star' },
          hovertemplate: '%{text}<extra>user</extra>' }
      ];
      Plotly.newPlot('chart', traces, {
        paper_bgcolor: '#0f1115', plot_bgcolor: '#0f1115', font: { color: '#e6e6e6' },
        legend: { orientation: 'h' }, margin: { t: 44 }
      }, { responsive: true });
    }
    load();
  </script>
</body>
</html>
"""
