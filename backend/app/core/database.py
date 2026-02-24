"""Async PostgreSQL connection pool using asyncpg."""

import logging

import asyncpg

logger = logging.getLogger("resume_tailor.database")

_CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
"""


async def create_pool(database_url: str) -> asyncpg.Pool:
    """Create and return an asyncpg connection pool."""
    pool = await asyncpg.create_pool(database_url, min_size=1, max_size=5)
    logger.info("Database pool created")
    return pool


async def ensure_users_table(pool: asyncpg.Pool) -> None:
    """Create the users table if it doesn't exist."""
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_USERS_TABLE)
    logger.info("Users table ensured")


async def close_pool(pool: asyncpg.Pool) -> None:
    """Close the connection pool."""
    await pool.close()
    logger.info("Database pool closed")
