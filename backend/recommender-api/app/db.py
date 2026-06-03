import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DATABASE_URL = os.environ["DATABASE_URL"]

# SQLite (used by the test suite) uses a StaticPool and rejects pool sizing
# kwargs, so only configure connection pooling for the real Postgres backend.
_engine_kwargs = {} if DATABASE_URL.startswith("sqlite") else {"pool_size": 10, "max_overflow": 5}
engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session() as session:
        yield session
