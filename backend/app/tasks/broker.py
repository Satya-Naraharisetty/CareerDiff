"""Taskiq asynchronous task broker configuration."""

from taskiq import AsyncBroker, InMemoryBroker
from taskiq_redis import ListQueueBroker

from app.core.config import get_settings

settings = get_settings()

# Use InMemoryBroker during testing to avoid Redis side-effects, otherwise ListQueueBroker
if settings.environment == "testing":
    broker: AsyncBroker = InMemoryBroker()
else:
    broker = ListQueueBroker(
        url=settings.redis_url,
        queue_name="CareerDiff_tasks",
    )
