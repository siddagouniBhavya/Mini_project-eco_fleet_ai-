from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200


def test_ports_endpoint():
    response = client.get("/ports?limit=5")
    assert response.status_code == 200


def test_valid_route_distance():
    response = client.get(
        "/route-distance",
        params={"origin": "INMAA", "destination": "SGSIN"},
    )
    assert response.status_code == 200


def test_invalid_origin_returns_404():
    response = client.get(
        "/route-distance",
        params={"origin": "INVALID", "destination": "SGSIN"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Origin port not found"


def test_plan_rejects_missing_fields():
    response = client.post("/shipments/plan", json={})
    assert response.status_code == 422


def test_qiga_rejects_missing_fields():
    response = client.post("/shipments/optimize", json={})
    assert response.status_code == 422


def test_ga_rejects_nonpositive_cargo():
    response = client.post(
        "/shipments/optimize-ga",
        json={
            "cargo_demand_tons": 0,
            "origin": "INMAA",
            "destination": "SGSIN",
            "distance_km": 2966.68,
            "deadline_hours": 90,
        },
    )
    assert response.status_code == 422


def test_multi_rejects_empty_shipments():
    response = client.post(
        "/shipments/optimize-multi",
        json={"shipments": []},
    )
    assert response.status_code == 422


def test_multi_rejects_unknown_algorithm():
    response = client.post(
        "/shipments/optimize-multi",
        json={"algorithm": "UNKNOWN", "shipments": [{}]},
    )
    assert response.status_code == 422
