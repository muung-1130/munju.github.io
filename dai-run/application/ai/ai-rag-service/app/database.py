import os
from typing import Generator

from dotenv import load_dotenv

from sqlalchemy import URL, create_engine
from sqlalchemy.orm import sessionmaker, Session


load_dotenv()


def _database_url() -> str | URL:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    required = ("PGHOST", "PGUSER", "PGDATABASE")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(
            "DB 설정이 없습니다. DATABASE_URL 또는 "
            f"{', '.join(required)} 환경 변수를 설정하세요."
        )

    return URL.create(
        drivername="postgresql+psycopg2",
        username=os.environ["PGUSER"],
        password=os.getenv("PGPASSWORD"),
        host=os.environ["PGHOST"],
        port=int(os.getenv("PGPORT", "5432")),
        database=os.environ["PGDATABASE"],
    )


engine = create_engine(
    _database_url(), echo=False, pool_size=5, max_overflow=10, pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
