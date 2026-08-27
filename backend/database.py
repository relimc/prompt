import sqlite3
import os
from backend.config import Config

DB_PATH = Config.DATABASE_PATH

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化数据库：创建所有表，并为 cards 添加 models 字段（如果不存在）"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. cards 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            positive_prompt TEXT NOT NULL,
            negative_prompt TEXT,
            image_path TEXT,
            workflow_path TEXT,
            tags TEXT,
            models TEXT,          -- 新增字段，存储 JSON 数组
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 为已存在的 cards 表添加 models 字段（迁移）
    cursor.execute("PRAGMA table_info(cards)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'models' not in columns:
        cursor.execute('ALTER TABLE cards ADD COLUMN models TEXT')

    # 2. tags 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            usage_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 3. card_tags 关联表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS card_tags (
            card_id INTEGER,
            tag_id INTEGER,
            FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
            PRIMARY KEY (card_id, tag_id)
        )
    ''')

    # 4. model_links 表（存储模型链接）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS model_links (
            model_name TEXT PRIMARY KEY,
            link TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()

# 确保数据目录存在
os.makedirs(Config.IMAGE_DIR, exist_ok=True)
os.makedirs(Config.WORKFLOW_DIR, exist_ok=True)
os.makedirs(Config.LOG_DIR, exist_ok=True)