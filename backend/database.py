import sqlite3
import os
from backend.config import Config

DB_PATH = Config.DATABASE_PATH

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化数据库：创建所有表，并执行必要的迁移"""
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
            thumbnail_path TEXT,          -- 新增缩略图路径
            workflow_path TEXT,
            tags TEXT,
            models TEXT,
            prompt_type TEXT DEFAULT 'auto',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 迁移：为 cards 表添加缺失的字段
    cursor.execute("PRAGMA table_info(cards)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'prompt_type' not in columns:
        cursor.execute('ALTER TABLE cards ADD COLUMN prompt_type TEXT DEFAULT "auto"')
    if 'models' not in columns:
        cursor.execute('ALTER TABLE cards ADD COLUMN models TEXT')
    if 'thumbnail_path' not in columns:      # 新增迁移
        cursor.execute('ALTER TABLE cards ADD COLUMN thumbnail_path TEXT')

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

    # 4. model_links 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS model_links (
            model_name TEXT PRIMARY KEY,
            link TEXT,
            type TEXT,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute("PRAGMA table_info(model_links)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'description' not in columns:
        cursor.execute('ALTER TABLE model_links ADD COLUMN description TEXT')
    if 'type' not in columns:
        cursor.execute('ALTER TABLE model_links ADD COLUMN type TEXT')

    # 5. tag_whitelist 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tag_whitelist (
            keyword TEXT PRIMARY KEY
        )
    ''')

    # 6. tag_blacklist 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tag_blacklist (
            keyword TEXT PRIMARY KEY
        )
    ''')

    # 7. stopwords 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stopwords (
            keyword TEXT PRIMARY KEY
        )
    ''')

    conn.commit()
    conn.close()

# 确保目录存在
os.makedirs(Config.IMAGE_DIR, exist_ok=True)
os.makedirs(Config.WORKFLOW_DIR, exist_ok=True)
os.makedirs(Config.LOG_DIR, exist_ok=True)