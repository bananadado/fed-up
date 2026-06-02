"""Endpoint tests for recipe ingestion, retrieval and the embedding job (issue #60)."""

from app.jobs import embed_unembedded_recipes

from .conftest import FakeSession, sample_recipe


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_recipe_computes_difficulty_and_embedding_text(client):
    resp = client.post("/recipes", json=sample_recipe())
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "r1"
    assert 0.0 <= body["difficulty"] <= 1.0
    assert body["embedding_text"] and "Thai" in body["embedding_text"]

    # The recipe was persisted with an embedding generated from the synth text.
    stored = client.fake_session.store["recipes"]["r1"]
    assert stored["embedding"] is not None
    assert stored["embedding_text"] == body["embedding_text"]


def test_create_recipe_is_idempotent_upsert(client):
    client.post("/recipes", json=sample_recipe(name="First"))
    client.post("/recipes", json=sample_recipe(name="Second"))
    assert len(client.fake_session.store["recipes"]) == 1
    assert client.fake_session.store["recipes"]["r1"]["name"] == "Second"


def test_create_recipe_rejects_missing_required_fields(client):
    resp = client.post("/recipes", json={"name": "no id"})
    assert resp.status_code == 422


def test_bulk_create_recipes(client):
    payload = [sample_recipe(id="a", name="Alpha"), sample_recipe(id="b", name="Beta")]
    resp = client.post("/recipes/bulk", json=payload)
    assert resp.status_code == 200
    assert {r["id"] for r in resp.json()} == {"a", "b"}
    assert len(client.fake_session.store["recipes"]) == 2


def test_list_recipes_sorted_by_name(client):
    client.post("/recipes", json=sample_recipe(id="a", name="Zebra stew"))
    client.post("/recipes", json=sample_recipe(id="b", name="Apple bake"))
    resp = client.get("/recipes")
    assert resp.status_code == 200
    names = [r["name"] for r in resp.json()]
    assert names == ["Apple bake", "Zebra stew"]


def test_get_recipe_roundtrip(client):
    client.post("/recipes", json=sample_recipe())
    resp = client.get("/recipes/r1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Spicy Thai Basil Chicken"
    assert body["ingredients"][0]["name"] == "chicken thigh"
    assert body["nutrition"]["protein"] == 40


def test_get_recipe_404(client):
    assert client.get("/recipes/missing").status_code == 404


def test_similar_recipes(client):
    client.post("/recipes", json=sample_recipe(id="r1", name="One"))
    client.post("/recipes", json=sample_recipe(id="r2", name="Two"))
    resp = client.get("/recipes/r1/similar?n=5")
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert "r1" not in ids  # never recommends itself
    assert "r2" in ids


def test_similar_recipes_404_when_not_embedded(client):
    assert client.get("/recipes/nope/similar").status_code == 404


def test_stats_counts(client):
    client.post("/recipes", json=sample_recipe(id="a", name="A"))
    client.post("/recipes", json=sample_recipe(id="b", name="B"))
    resp = client.get("/stats")
    body = resp.json()
    assert body["recipes"] == 2
    assert body["recipes_embedded"] == 2
    assert body["users"] == 0
    assert body["interactions"] == 0


async def test_embed_unembedded_recipes_job(store):
    # A recipe inserted without an embedding (e.g. seeded directly) gets one.
    store["recipes"]["x"] = {**sample_recipe(id="x"), "embedding": None}
    session = FakeSession(store)
    count = await embed_unembedded_recipes(session)
    assert count == 1
    assert store["recipes"]["x"]["embedding"] is not None
    assert store["recipes"]["x"]["embedding_text"]


async def test_embed_unembedded_recipes_noop_when_all_embedded(store):
    store["recipes"]["x"] = {**sample_recipe(id="x"), "embedding": "[0.1]"}
    session = FakeSession(store)
    assert await embed_unembedded_recipes(session) == 0
