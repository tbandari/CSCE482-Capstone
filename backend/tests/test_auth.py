from fastapi.testclient import TestClient

from tests.conftest import register


def test_register_returns_bearer_token(client: TestClient) -> None:
    response = client.post("/auth/register", json={"email": "George@TAMU.edu", "password": "orbit-rocks-1"})
    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "george@tamu.edu"  # normalised


def test_register_rejects_duplicates_and_weak_input(client: TestClient) -> None:
    register(client, "dup@tamu.edu")
    duplicate = client.post("/auth/register", json={"email": "dup@tamu.edu", "password": "another-pass-1"})
    assert duplicate.status_code == 409

    short = client.post("/auth/register", json={"email": "x@tamu.edu", "password": "short"})
    assert short.status_code == 422
    bad_email = client.post("/auth/register", json={"email": "not-an-email", "password": "long enough pass"})
    assert bad_email.status_code == 422


def test_login(client: TestClient) -> None:
    register(client, "roger@tamu.edu", "place-resolution")
    ok = client.post("/auth/login", json={"email": "roger@tamu.edu", "password": "place-resolution"})
    assert ok.status_code == 200
    wrong = client.post("/auth/login", json={"email": "roger@tamu.edu", "password": "nope-nope-nope"})
    assert wrong.status_code == 401
    unknown = client.post("/auth/login", json={"email": "ghost@tamu.edu", "password": "whatever-123"})
    assert unknown.status_code == 401


def test_protected_routes_require_a_valid_token(client: TestClient) -> None:
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer not.a.token"}).status_code == 401
    assert client.get("/locations/stats").status_code == 401


def test_hard_delete_removes_account_and_data(client: TestClient, auth: dict[str, str]) -> None:
    points = [{"ts": 1_700_000_000_000 + i * 60_000, "lat": 30.6, "lon": -96.3} for i in range(3)]
    assert client.post("/locations/batch", json={"points": points}, headers=auth).status_code == 200

    assert client.delete("/auth/me", headers=auth).status_code == 204
    assert client.get("/auth/me", headers=auth).status_code == 401

    # A new account with the same email starts from nothing.
    fresh = register(client)
    assert client.get("/locations/stats", headers=fresh).json()["points"] == 0
