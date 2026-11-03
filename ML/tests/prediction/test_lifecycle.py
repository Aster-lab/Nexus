
import asyncio
from unittest.mock import Mock

import pytest

import main


def test_lifespan_initializes_and_releases_engine(monkeypatch):
    fake_engine = Mock()

    monkeypatch.setattr(
        main,
        "RiskEngine",
        lambda **kwargs: fake_engine,
    )

    async def run_test():
        async with main.lifespan(main.app):
            assert main.engine is fake_engine

        assert main.engine is None

    asyncio.run(run_test())


def test_lifespan_propagates_initialization_failure(monkeypatch):
    def failing_engine(**kwargs):
        raise RuntimeError("Model loading failed")

    monkeypatch.setattr(
        main,
        "RiskEngine",
        failing_engine,
    )

    async def run_test():
        with pytest.raises(
            RuntimeError,
            match="Model loading failed",
        ):
            async with main.lifespan(main.app):
                pass

    asyncio.run(run_test())

    assert main.engine is None
