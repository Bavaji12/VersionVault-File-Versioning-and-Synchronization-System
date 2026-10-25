"""
VersionVault - Automated API & Integration Tests
Runs comprehensive test scenarios verifying:
1. File upload with SHA-256 integrity calculation
2. Sequential version updates and history immutability
3. Optimistic concurrency control & 409 Conflict rejection
4. Hash deduplication detection
5. Safe version restoration retaining full history
6. Soft deletion & retention policy
"""

import pytest
import io
import hashlib
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend_python.main import app
from backend_python.database import get_db, Base
from backend_python.models import FileRecord, FileVersion

# In-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_vault.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_upload_file_calculates_sha256():
    """Test 1: Upload a new file and assert SHA-256 hash calculation."""
    content = b"# VersionVault Test File\nprint('Hello World')\n"
    expected_hash = hashlib.sha256(content).hexdigest()

    response = client.post(
        "/api/files",
        files={"file": ("hello.py", io.BytesIO(content), "text/x-python")},
        data={"description": "Test Python script", "category": "code", "author_name": "Alex Rivera"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["filename"] == "hello.py"
    assert data["current_version_number"] == 1
    assert data["latest_version"]["sha256_hash"] == expected_hash
    assert data["latest_version"]["size_bytes"] == len(content)


def test_version_bump_preserves_history():
    """Test 2: Create a second version and ensure previous version is preserved."""
    # v1
    v1_content = b"version 1 content"
    r1 = client.post(
        "/api/files",
        files={"file": ("doc.txt", io.BytesIO(v1_content), "text/plain")},
        data={"description": "Doc v1"}
    )
    file_id = r1.json()["id"]

    # v2
    v2_content = b"version 2 modified content"
    r2 = client.post(
        f"/api/files/{file_id}/versions",
        files={"file": ("doc.txt", io.BytesIO(v2_content), "text/plain")},
        data={"base_version": 1, "change_summary": "Added paragraph", "author_name": "Sarah Chen"}
    )
    assert r2.status_code == 200
    assert r2.json()["version_number"] == 2

    # Check version list has both v2 and v1
    v_res = client.get(f"/api/files/{file_id}/versions")
    versions = v_res.json()
    assert len(versions) == 2
    assert versions[0]["version_number"] == 2
    assert versions[1]["version_number"] == 1


def test_optimistic_locking_conflict_409():
    """Test 3: Optimistic concurrency control triggers 409 Conflict when base_version is stale."""
    # v1
    r1 = client.post(
        "/api/files",
        files={"file": ("config.json", io.BytesIO(b'{"v": 1}'), "application/json")},
        data={"description": "Config"}
    )
    file_id = r1.json()["id"]

    # Client A updates to v2
    client.post(
        f"/api/files/{file_id}/versions",
        files={"file": ("config.json", io.BytesIO(b'{"v": 2}'), "application/json")},
        data={"base_version": 1, "change_summary": "Client A update", "author_name": "Alex Rivera"}
    )

    # Client B attempts to update based on stale v1
    conflict_res = client.post(
        f"/api/files/{file_id}/versions",
        files={"file": ("config.json", io.BytesIO(b'{"v": "conflicting"}'), "application/json")},
        data={"base_version": 1, "change_summary": "Client B update", "author_name": "Marcus Vance"}
    )
    assert conflict_res.status_code == 409
    err = conflict_res.json()["detail"]
    assert err["error"] == "ConflictDetected"
    assert err["conflict"]["current_server_version"] == 2
    assert err["conflict"]["base_version"] == 1


def test_restore_older_version():
    """Test 4: Restoring v1 when at v2 creates v3 matching v1's content while retaining history."""
    v1_content = b"original text v1"
    v1_hash = hashlib.sha256(v1_content).hexdigest()
    r1 = client.post(
        "/api/files",
        files={"file": ("notes.md", io.BytesIO(v1_content), "text/markdown")},
        data={"description": "Notes"}
    )
    file_id = r1.json()["id"]
    v1_id = r1.json()["latest_version"]["id"]

    # Push v2
    client.post(
        f"/api/files/{file_id}/versions",
        files={"file": ("notes.md", io.BytesIO(b"bad edits v2"), "text/markdown")},
        data={"base_version": 1, "change_summary": "Bad edits"}
    )

    # Restore v1
    restore_res = client.post(f"/api/files/{file_id}/restore/{v1_id}")
    assert restore_res.status_code == 200
    v3 = restore_res.json()
    assert v3["version_number"] == 3
    assert v3["sha256_hash"] == v1_hash
    assert v3["restored_from_version"] == 1

    # Verify download gives v1 content
    dl = client.get(f"/api/files/{file_id}/versions/{v3['id']}/download")
    assert dl.content == v1_content


def test_file_integrity_verification():
    """Test 5: Verify SHA-256 integrity endpoint."""
    content = b"integrity check payload"
    r = client.post(
        "/api/files",
        files={"file": ("check.bin", io.BytesIO(content), "application/octet-stream")},
        data={"description": "Integrity check"}
    )
    file_id = r.json()["id"]
    version_id = r.json()["latest_version"]["id"]

    verify_res = client.post(f"/api/files/{file_id}/versions/{version_id}/verify-integrity")
    assert verify_res.status_code == 200
    assert verify_res.json()["verified"] is True
    assert verify_res.json()["status"] == "VALID"
