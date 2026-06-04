"""Embedding visualiser for the recommender's pgvector store.

Read-only views over recipe and user taste embeddings:
- PCA / UMAP / PaCMAP 2D projections
- HDBSCAN cluster colouring
- BERTopic topic labels for recipes
- nearest-neighbour lookup from any plotted point
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any

import asyncpg
import numpy as np
from fastapi import FastAPI, HTTPException, Query, Request
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

PROJECTIONS = {"pca", "umap", "pacmap"}
COLOR_BY = {"kind", "cluster", "topic", "meal_type", "cuisine", "prep", "price", "difficulty"}


@dataclass(frozen=True)
class EmbeddingItem:
    id: str
    label: str
    kind: str
    vector: list[float]
    text: str
    metadata: dict[str, Any]


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


def list_value(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list | tuple | set):
        return [str(v) for v in value]
    return [str(value)]


def recipe_text(row: asyncpg.Record) -> str:
    parts = [
        row["embedding_text"],
        row["name"],
        row["cuisine"],
        " ".join(list_value(row["dietary_tags"])),
        " ".join(list_value(row["flavor_profile"])),
        " ".join(list_value(row["techniques"])),
    ]
    return " ".join(str(part) for part in parts if part)


async def fetch_items() -> list[EmbeddingItem]:
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        recipe_rows = await conn.fetch(
            """
            SELECT id, name, meal_type, meal_slots, price_pence, prep_minutes,
                   difficulty, dietary_tags, allergens, suitability_tags, cuisine,
                   flavor_profile, techniques, equipment, embedding_text,
                   embedding::text AS emb
            FROM recipes
            WHERE embedding IS NOT NULL
            ORDER BY name
            """
        )
        user_rows = await conn.fetch(
            """
            SELECT id, cooking_ability, kitchen_access, budget_pence,
                   max_time_minutes, dietary_tags, allergens, likes, dislikes,
                   taste_embedding::text AS emb
            FROM users
            WHERE taste_embedding IS NOT NULL
            ORDER BY id
            """
        )
    finally:
        await conn.close()

    items: list[EmbeddingItem] = []

    for row in recipe_rows:
        vector = parse_vector(row["emb"])
        if not vector:
            continue
        metadata = {
            "meal_type": row["meal_type"],
            "meal_slots": list_value(row["meal_slots"]),
            "price_pence": row["price_pence"],
            "prep_minutes": row["prep_minutes"],
            "difficulty": row["difficulty"],
            "dietary_tags": list_value(row["dietary_tags"]),
            "allergens": list_value(row["allergens"]),
            "suitability_tags": list_value(row["suitability_tags"]),
            "cuisine": row["cuisine"] or "unknown",
            "flavor_profile": list_value(row["flavor_profile"]),
            "techniques": list_value(row["techniques"]),
            "equipment": list_value(row["equipment"]),
        }
        items.append(
            EmbeddingItem(
                id=row["id"],
                label=row["name"] or row["id"],
                kind="recipe",
                vector=vector,
                text=recipe_text(row),
                metadata=metadata,
            )
        )

    for row in user_rows:
        vector = parse_vector(row["emb"])
        if not vector:
            continue
        metadata = {
            "cooking_ability": row["cooking_ability"],
            "kitchen_access": row["kitchen_access"],
            "budget_pence": row["budget_pence"],
            "max_time_minutes": row["max_time_minutes"],
            "dietary_tags": list_value(row["dietary_tags"]),
            "allergens": list_value(row["allergens"]),
            "likes": list_value(row["likes"]),
            "dislikes": list_value(row["dislikes"]),
        }
        items.append(
            EmbeddingItem(
                id=row["id"],
                label=row["id"],
                kind="user",
                vector=vector,
                text=" ".join(metadata["likes"] + metadata["dislikes"]),
                metadata=metadata,
            )
        )

    return items


def matrix_from(items: list[EmbeddingItem]) -> np.ndarray:
    return np.asarray([item.vector for item in items], dtype=np.float64)


def pca_2d(matrix: np.ndarray) -> np.ndarray:
    if matrix.shape[0] < 2:
        return np.zeros((matrix.shape[0], 2), dtype=np.float64)
    centered = matrix - matrix.mean(axis=0)
    _, _, components = np.linalg.svd(centered, full_matrices=False)
    coords = centered @ components[:2].T
    if coords.shape[1] == 1:
        coords = np.column_stack([coords[:, 0], np.zeros(matrix.shape[0])])
    return coords[:, :2]


def project_2d(items: list[EmbeddingItem], projection: str) -> tuple[np.ndarray, str | None]:
    matrix = matrix_from(items)
    if projection == "pca" or matrix.shape[0] < 3:
        return pca_2d(matrix), None

    if projection == "umap":
        try:
            import umap

            reducer = umap.UMAP(
                n_components=2,
                n_neighbors=max(2, min(15, matrix.shape[0] - 1)),
                min_dist=0.08,
                metric="cosine",
                random_state=42,
            )
            return reducer.fit_transform(matrix), None
        except Exception as exc:
            log_event(logging.WARNING, "projection_fallback", projection=projection, error=str(exc))
            return pca_2d(matrix), f"UMAP failed; showing PCA instead: {exc}"

    if projection == "pacmap":
        try:
            import pacmap

            reducer = pacmap.PaCMAP(
                n_components=2,
                n_neighbors=max(2, min(10, matrix.shape[0] - 1)),
                MN_ratio=0.5,
                FP_ratio=2.0,
                random_state=42,
            )
            return reducer.fit_transform(matrix, init="pca"), None
        except Exception as exc:
            log_event(logging.WARNING, "projection_fallback", projection=projection, error=str(exc))
            return pca_2d(matrix), f"PaCMAP failed; showing PCA instead: {exc}"

    raise HTTPException(status_code=400, detail=f"Unknown projection: {projection}")


def cluster_labels(items: list[EmbeddingItem], min_cluster_size: int) -> tuple[dict[str, int], str | None]:
    recipes = [item for item in items if item.kind == "recipe"]
    labels = {f"{item.kind}:{item.id}": -1 for item in items}
    if len(recipes) < max(3, min_cluster_size):
        return labels, "Not enough recipe vectors for HDBSCAN clusters yet."

    try:
        import hdbscan

        recipe_matrix = matrix_from(recipes)
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=max(2, min(min_cluster_size, len(recipes))),
            min_samples=2,
            metric="euclidean",
        )
        recipe_labels = clusterer.fit_predict(recipe_matrix)
        for item, label in zip(recipes, recipe_labels):
            labels[f"{item.kind}:{item.id}"] = int(label)
        return labels, None
    except Exception as exc:
        log_event(logging.WARNING, "cluster_fallback", error=str(exc))
        return labels, f"HDBSCAN failed; clusters are unavailable: {exc}"


def topic_labels(items: list[EmbeddingItem]) -> tuple[dict[str, int | None], dict[int, str], str | None]:
    recipes = [item for item in items if item.kind == "recipe" and item.text.strip()]
    assignments = {f"{item.kind}:{item.id}": None for item in items}
    names: dict[int, str] = {}
    if len(recipes) < 4:
        return assignments, names, "Not enough recipe text for BERTopic yet."

    try:
        from bertopic import BERTopic

        docs = [item.text for item in recipes]
        embeddings = matrix_from(recipes)
        model = BERTopic(
            min_topic_size=max(2, min(5, len(recipes) // 3)),
            calculate_probabilities=False,
            verbose=False,
        )
        topics, _ = model.fit_transform(docs, embeddings=embeddings)
        for item, topic in zip(recipes, topics):
            assignments[f"{item.kind}:{item.id}"] = int(topic)

        info = model.get_topic_info()
        for row in info.to_dict("records"):
            topic = int(row["Topic"])
            name = str(row.get("Name") or topic)
            names[topic] = "outlier" if topic == -1 else name.replace("_", " ")
        return assignments, names, None
    except Exception as exc:
        log_event(logging.WARNING, "topic_fallback", error=str(exc))
        return assignments, names, f"BERTopic failed; topics are unavailable: {exc}"


def bucket_prep(minutes: Any) -> str:
    value = int(minutes or 0)
    if value <= 10:
        return "0-10 min"
    if value <= 20:
        return "11-20 min"
    if value <= 40:
        return "21-40 min"
    return "40+ min"


def bucket_price(pence: Any) -> str:
    value = int(pence or 0)
    if value <= 200:
        return "under GBP2"
    if value <= 500:
        return "GBP2-5"
    if value <= 1000:
        return "GBP5-10"
    return "GBP10+"


def bucket_difficulty(value: Any) -> str:
    score = float(value or 0)
    if score < 0.34:
        return "easy"
    if score < 0.67:
        return "medium"
    return "hard"


def color_value(
    item: EmbeddingItem,
    color_by: str,
    clusters: dict[str, int],
    topics: dict[str, int | None],
    topic_names: dict[int, str],
) -> str:
    key = f"{item.kind}:{item.id}"
    meta = item.metadata
    if color_by == "kind":
        return item.kind
    if color_by == "cluster":
        cluster = clusters.get(key, -1)
        if item.kind == "user":
            return "user"
        return "outlier" if cluster == -1 else f"cluster {cluster}"
    if color_by == "topic":
        topic = topics.get(key)
        if item.kind == "user":
            return "user"
        if topic is None:
            return "no topic"
        return topic_names.get(topic, f"topic {topic}")
    if item.kind != "recipe":
        return "user"
    if color_by == "meal_type":
        return str(meta.get("meal_type") or "unknown")
    if color_by == "cuisine":
        return str(meta.get("cuisine") or "unknown")
    if color_by == "prep":
        return bucket_prep(meta.get("prep_minutes"))
    if color_by == "price":
        return bucket_price(meta.get("price_pence"))
    if color_by == "difficulty":
        return bucket_difficulty(meta.get("difficulty"))
    return item.kind


def item_to_point(
    item: EmbeddingItem,
    coord: np.ndarray,
    color_by: str,
    clusters: dict[str, int],
    topics: dict[str, int | None],
    topic_names: dict[int, str],
) -> dict[str, Any]:
    key = f"{item.kind}:{item.id}"
    topic = topics.get(key)
    return {
        "id": item.id,
        "kind": item.kind,
        "label": item.label,
        "x": float(coord[0]),
        "y": float(coord[1]),
        "cluster": clusters.get(key, -1),
        "topic": topic,
        "topic_label": topic_names.get(topic, None) if topic is not None else None,
        "color_value": color_value(item, color_by, clusters, topics, topic_names),
        "metadata": item.metadata,
    }


def cosine_similarity(a: list[float], b: list[float]) -> float:
    av = np.asarray(a, dtype=np.float64)
    bv = np.asarray(b, dtype=np.float64)
    denom = float(np.linalg.norm(av) * np.linalg.norm(bv))
    if denom == 0 or math.isnan(denom):
        return 0.0
    return float(np.dot(av, bv) / denom)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/views")
async def views() -> dict[str, Any]:
    return {
        "projections": sorted(PROJECTIONS),
        "color_by": sorted(COLOR_BY),
        "views": ["scatter", "clusters", "topics", "nearest"],
    }


@app.get("/api/points")
async def points(
    projection: str = Query("pca", pattern="^(pca|umap|pacmap)$"),
    color_by: str = Query("kind", pattern="^(kind|cluster|topic|meal_type|cuisine|prep|price|difficulty)$"),
    min_cluster_size: int = Query(5, ge=2, le=50),
) -> JSONResponse:
    items = await fetch_items()
    if not items:
        log_event(logging.INFO, "embedding_points_loaded", points=0)
        return JSONResponse({"points": [], "stats": {"total": 0}, "warnings": []})

    coords, projection_warning = project_2d(items, projection)
    clusters, cluster_warning = cluster_labels(items, min_cluster_size)
    topics: dict[str, int | None] = {f"{item.kind}:{item.id}": None for item in items}
    topic_names: dict[int, str] = {}
    topic_warning = None
    if color_by == "topic":
        topics, topic_names, topic_warning = topic_labels(items)

    payload = [
        item_to_point(item, coords[i], color_by, clusters, topics, topic_names)
        for i, item in enumerate(items)
    ]
    recipe_clusters = {point["cluster"] for point in payload if point["kind"] == "recipe" and point["cluster"] != -1}
    stats = {
        "total": len(payload),
        "recipes": sum(1 for point in payload if point["kind"] == "recipe"),
        "users": sum(1 for point in payload if point["kind"] == "user"),
        "clusters": len(recipe_clusters),
        "outliers": sum(1 for point in payload if point["kind"] == "recipe" and point["cluster"] == -1),
        "projection": projection,
        "color_by": color_by,
    }
    warnings = [msg for msg in [projection_warning, cluster_warning, topic_warning] if msg]
    topics_payload = [
        {"id": topic, "label": label}
        for topic, label in sorted(topic_names.items(), key=lambda entry: entry[0])
    ]
    log_event(
        logging.INFO,
        "embedding_points_loaded",
        points=len(payload),
        projection=projection,
        color_by=color_by,
    )
    return JSONResponse({"points": payload, "stats": stats, "topics": topics_payload, "warnings": warnings})


@app.get("/api/nearest")
async def nearest(
    id: str = Query(..., min_length=1),
    kind: str = Query("recipe", pattern="^(recipe|user)$"),
    n: int = Query(10, ge=1, le=50),
) -> JSONResponse:
    items = await fetch_items()
    target = next((item for item in items if item.id == id and item.kind == kind), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"{kind} {id} was not found or has no embedding")

    neighbours = []
    for item in items:
        if item.id == target.id and item.kind == target.kind:
            continue
        neighbours.append(
            {
                "id": item.id,
                "kind": item.kind,
                "label": item.label,
                "similarity": cosine_similarity(target.vector, item.vector),
                "metadata": item.metadata,
            }
        )
    neighbours.sort(key=lambda item: item["similarity"], reverse=True)
    return JSONResponse({"target": {"id": target.id, "kind": target.kind, "label": target.label}, "items": neighbours[:n]})


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
    :root { color-scheme: dark; --bg: #0f1115; --panel: #171b23; --line: #303846; --text: #e6e6e6; --muted: #8a93a6; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .app { display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: 100vh; }
    .main { min-width: 0; }
    .bar { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: #11151c; flex-wrap: wrap; }
    .brand { font-weight: 700; margin-right: 8px; }
    label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
    select, input, button { background: #202633; color: var(--text); border: 1px solid #3a4150; border-radius: 6px; min-height: 32px; padding: 4px 9px; font: inherit; }
    button { cursor: pointer; }
    button:hover { border-color: #5a6680; }
    #chart { width: 100%; height: calc(100vh - 56px); }
    .side { border-left: 1px solid var(--line); background: var(--panel); padding: 14px; overflow: auto; max-height: 100vh; }
    .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0 14px; }
    .metric { border: 1px solid var(--line); border-radius: 6px; padding: 8px; background: #11151c; }
    .metric strong { display: block; font-size: 18px; }
    .muted { color: var(--muted); }
    .section { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
    .list { display: grid; gap: 6px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 7px 0; border-bottom: 1px solid #252b36; }
    .row span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pill { color: #cbd5e1; background: #263040; border: 1px solid #3c4658; border-radius: 999px; padding: 1px 7px; font-size: 12px; }
    .warning { color: #ffd28a; margin-top: 8px; font-size: 13px; }
    pre { white-space: pre-wrap; word-break: break-word; color: #cbd5e1; font-size: 12px; }
    @media (max-width: 900px) { .app { grid-template-columns: 1fr; } .side { border-left: 0; border-top: 1px solid var(--line); max-height: none; } #chart { height: 70vh; } }
  </style>
</head>
<body>
  <div class="app">
    <main class="main">
      <div class="bar">
        <span class="brand">Recommender embeddings</span>
        <label>Projection
          <select id="projection">
            <option value="pca">PCA</option>
            <option value="umap">UMAP</option>
            <option value="pacmap">PaCMAP</option>
          </select>
        </label>
        <label>Colour
          <select id="colorBy">
            <option value="kind">Kind</option>
            <option value="cluster">HDBSCAN cluster</option>
            <option value="topic">BERTopic topic</option>
            <option value="meal_type">Meal type</option>
            <option value="cuisine">Cuisine</option>
            <option value="prep">Prep time</option>
            <option value="price">Price</option>
            <option value="difficulty">Difficulty</option>
          </select>
        </label>
        <label>Min cluster
          <input id="minCluster" type="number" min="2" max="50" value="5" />
        </label>
        <button id="refresh">Refresh</button>
        <span id="status" class="muted">loading...</span>
      </div>
      <div id="chart"></div>
    </main>
    <aside class="side">
      <div class="muted">Dataset</div>
      <div class="metric-grid">
        <div class="metric"><strong id="total">0</strong><span class="muted">vectors</span></div>
        <div class="metric"><strong id="clusters">0</strong><span class="muted">clusters</span></div>
        <div class="metric"><strong id="recipes">0</strong><span class="muted">recipes</span></div>
        <div class="metric"><strong id="users">0</strong><span class="muted">users</span></div>
      </div>
      <div id="warnings"></div>
      <div class="section">
        <strong>Selected point</strong>
        <div id="selected" class="muted">Click a point to inspect nearest neighbours.</div>
      </div>
      <div class="section">
        <strong>Nearest neighbours</strong>
        <div id="nearest" class="list muted">No point selected.</div>
      </div>
      <div class="section">
        <strong>Topics</strong>
        <div id="topics" class="list muted">Choose BERTopic topic colouring to compute topics.</div>
      </div>
    </aside>
  </div>

  <script>
    const palette = ['#4f9cf9', '#f97362', '#44c7a8', '#d4a72c', '#b48cff', '#7dd3fc', '#f472b6', '#a3e635', '#fb7185', '#c084fc', '#22d3ee', '#f59e0b'];
    let currentPoints = new Map();

    function colorFor(value) {
      let hash = 0;
      for (const ch of String(value || 'unknown')) hash = ((hash << 5) - hash) + ch.charCodeAt(0);
      return palette[Math.abs(hash) % palette.length];
    }

    function setMetric(id, value) {
      document.getElementById(id).textContent = value ?? 0;
    }

    function groupPoints(points) {
      const groups = new Map();
      for (const p of points) {
        const key = `${p.color_value}::${p.kind}`;
        if (!groups.has(key)) {
          groups.set(key, { name: `${p.color_value} · ${p.kind}`, color: colorFor(p.color_value), symbol: p.kind === 'user' ? 'star' : 'circle', x: [], y: [], text: [], customdata: [] });
        }
        const g = groups.get(key);
        g.x.push(p.x);
        g.y.push(p.y);
        g.text.push(p.label);
        g.customdata.push([p.id, p.kind, p.label, p.color_value]);
      }
      return [...groups.values()];
    }

    function renderTopics(topics) {
      const el = document.getElementById('topics');
      if (!topics || topics.length === 0) {
        el.className = 'list muted';
        el.textContent = 'No topics available for this dataset.';
        return;
      }
      el.className = 'list';
      el.innerHTML = topics.slice(0, 20).map(t => `<div class="row"><span>${t.label}</span><span class="pill">${t.id}</span></div>`).join('');
    }

    function renderWarnings(warnings) {
      const el = document.getElementById('warnings');
      el.innerHTML = (warnings || []).map(w => `<div class="warning">${w}</div>`).join('');
    }

    async function load() {
      const projection = document.getElementById('projection').value;
      const colorBy = document.getElementById('colorBy').value;
      const minCluster = document.getElementById('minCluster').value || 5;
      document.getElementById('status').textContent = 'loading...';
      const res = await fetch(`api/points?projection=${projection}&color_by=${colorBy}&min_cluster_size=${minCluster}`);
      if (!res.ok) {
        document.getElementById('status').textContent = `failed: ${res.status}`;
        return;
      }
      const data = await res.json();
      const pts = data.points || [];
      currentPoints = new Map(pts.map(p => [`${p.kind}:${p.id}`, p]));
      const stats = data.stats || {};
      setMetric('total', stats.total);
      setMetric('recipes', stats.recipes);
      setMetric('users', stats.users);
      setMetric('clusters', stats.clusters);
      renderWarnings(data.warnings);
      renderTopics(data.topics);

      const traces = groupPoints(pts).map(g => ({
        name: g.name,
        x: g.x,
        y: g.y,
        text: g.text,
        customdata: g.customdata,
        mode: 'markers',
        type: 'scatter',
        marker: { size: g.symbol === 'star' ? 12 : 8, color: g.color, symbol: g.symbol, opacity: 0.9 },
        hovertemplate: '%{text}<br>%{customdata[3]}<extra>%{customdata[1]}</extra>'
      }));

      Plotly.newPlot('chart', traces, {
        paper_bgcolor: '#0f1115',
        plot_bgcolor: '#0f1115',
        font: { color: '#e6e6e6' },
        legend: { orientation: 'h', y: 1.08 },
        margin: { t: 24, r: 18, b: 38, l: 48 },
        xaxis: { zeroline: false, gridcolor: '#242b36' },
        yaxis: { zeroline: false, gridcolor: '#242b36' }
      }, { responsive: true });

      document.getElementById('chart').on('plotly_click', ev => {
        const cd = ev.points[0].customdata;
        selectPoint(cd[0], cd[1]);
      });
      document.getElementById('status').textContent = `${stats.total || 0} vectors · ${projection.toUpperCase()} · ${colorBy}`;
    }

    async function selectPoint(id, kind) {
      const point = currentPoints.get(`${kind}:${id}`);
      document.getElementById('selected').innerHTML = point
        ? `<strong>${point.label}</strong><pre>${JSON.stringify(point.metadata, null, 2)}</pre>`
        : `${kind}:${id}`;
      const el = document.getElementById('nearest');
      el.className = 'list muted';
      el.textContent = 'loading...';
      const res = await fetch(`api/nearest?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}&n=12`);
      if (!res.ok) {
        el.textContent = `failed: ${res.status}`;
        return;
      }
      const data = await res.json();
      el.className = 'list';
      el.innerHTML = (data.items || []).map(item => {
        const score = Number(item.similarity || 0).toFixed(3);
        return `<div class="row"><span>${item.label}<span class="muted"> · ${item.kind}</span></span><span class="pill">${score}</span></div>`;
      }).join('');
    }

    document.getElementById('refresh').addEventListener('click', load);
    document.getElementById('projection').addEventListener('change', load);
    document.getElementById('colorBy').addEventListener('change', load);
    document.getElementById('minCluster').addEventListener('change', load);
    load();
  </script>
</body>
</html>
"""
