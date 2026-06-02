"""Request verification tests for the Firebase Functions boundary."""


def test_health_does_not_require_cloud_function_key(client):
    response = client.get("/health", headers={"X-Deadline-Food-API-Key": ""})
    assert response.status_code == 200


def test_application_endpoint_rejects_missing_cloud_function_key(client):
    response = client.get("/recipes", headers={"X-Deadline-Food-API-Key": ""})
    assert response.status_code == 401
    assert response.json()["detail"] == "Verified cloud function request required"


def test_application_endpoint_rejects_wrong_cloud_function_key(client):
    response = client.get("/recipes", headers={"X-Deadline-Food-API-Key": "wrong"})
    assert response.status_code == 401
