import sqlite3
import os
from backend.config import Config   # 修改此行

DB_PATH = Config.DATABASE_PATH


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """创建所有表（如果不存在）"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 卡片表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            positive_prompt TEXT NOT NULL,
            negative_prompt TEXT,
            image_path TEXT,
            workflow_path TEXT,
            tags TEXT,          -- 逗号分隔，保留兼容
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 标签表（用于标签云）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT,
            usage_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 卡片-标签关联表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS card_tags (
            card_id INTEGER,
            tag_id INTEGER,
            FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
            PRIMARY KEY (card_id, tag_id)
        )
    ''')

    conn.commit()
    conn.close()


# 确保数据库目录存在（如果需要）
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)