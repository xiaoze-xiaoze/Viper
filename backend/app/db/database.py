import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

_base_dir = os.path.dirname(__file__)
_db_file = os.path.join(_base_dir, "viper.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{_db_file}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from . import tables
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        info = conn.exec_driver_sql("PRAGMA table_info(messages)").fetchall()
        if info:
            id_cols = [row for row in info if row[1] == "id"]
            if id_cols:
                id_type = (id_cols[0][2] or "").upper()
                if "TEXT" not in id_type and "CHAR" not in id_type and "CLOB" not in id_type:
                    conn.exec_driver_sql(
                        """
                        CREATE TABLE IF NOT EXISTS messages_new (
                            id TEXT PRIMARY KEY,
                            chat_id INTEGER NOT NULL,
                            role VARCHAR NOT NULL,
                            content TEXT NOT NULL,
                            created_at DATETIME NOT NULL,
                            status VARCHAR NOT NULL,
                            error TEXT NOT NULL DEFAULT '',
                            FOREIGN KEY(chat_id) REFERENCES chats(id)
                        )
                        """
                    )
                    conn.exec_driver_sql(
                        """
                        INSERT INTO messages_new (id, chat_id, role, content, created_at, status, error)
                        SELECT CAST(id AS TEXT), chat_id, role, content, created_at, status, error
                        FROM messages
                        """
                    )
                    conn.exec_driver_sql("DROP TABLE messages")
                    conn.exec_driver_sql("ALTER TABLE messages_new RENAME TO messages")
                    conn.exec_driver_sql(
                        "CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, created_at)"
                    )
