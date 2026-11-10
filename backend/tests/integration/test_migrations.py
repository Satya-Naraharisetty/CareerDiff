"""Integration tests for database migration lifecycle (upgrade and rollback)."""

from pathlib import Path

from alembic.config import Config

from alembic import command


def test_migration_lifecycle() -> None:
    """Verify that Alembic migrations apply cleanly and can be rolled back reversibly."""
    alembic_ini_path = Path(__file__).resolve().parents[2] / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(alembic_ini_path.parent / "alembic"))

    # Test full upgrade to head
    command.upgrade(alembic_cfg, "head")

    # Test rollback to base
    command.downgrade(alembic_cfg, "base")

    # Test re-upgrade to head
    command.upgrade(alembic_cfg, "head")
