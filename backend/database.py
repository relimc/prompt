import sqlite3
import os
from backend.config import Config

DB_PATH = Config.DATABASE_PATH

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # cards 表（含 models 字段）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            positive_prompt TEXT NOT NULL,
            negative_prompt TEXT,
            image_path TEXT,
            workflow_path TEXT,
            tags TEXT,
            models TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute("PRAGMA table_info(cards)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'models' not in columns:
        cursor.execute('ALTER TABLE cards ADD COLUMN models TEXT')

    # tags 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            usage_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # card_tags 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS card_tags (
            card_id INTEGER,
            tag_id INTEGER,
            FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
            PRIMARY KEY (card_id, tag_id)
        )
    ''')

    # model_links 表（含 type 字段）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS model_links (
            model_name TEXT PRIMARY KEY,
            link TEXT,
            type TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 检查并添加 type 列（如果表已存在但无此列）
    cursor.execute("PRAGMA table_info(model_links)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'type' not in columns:
        cursor.execute('ALTER TABLE model_links ADD COLUMN type TEXT')

    # 在 init_db 中添加
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tag_whitelist (
            keyword TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tag_blacklist (
            keyword TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute("PRAGMA table_info(cards)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'prompt_type' not in columns:
        cursor.execute('ALTER TABLE cards ADD COLUMN prompt_type TEXT')

    conn.commit()
    conn.close()

# 确保目录存在
os.makedirs(Config.IMAGE_DIR, exist_ok=True)
os.makedirs(Config.WORKFLOW_DIR, exist_ok=True)
os.makedirs(Config.LOG_DIR, exist_ok=True)