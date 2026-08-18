import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

    USERNAME = os.getenv("ADMIN_USERNAME", "admin")
    PASSWORD = os.getenv("ADMIN_PASSWORD", "password123")

    # ---------- 路径配置 ----------
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(BASE_DIR, "data")

    # 数据库文件放在 data 目录下
    DATABASE_PATH = os.path.join(DATA_DIR, "prompt.db")

    UPLOAD_DIR = DATA_DIR
    IMAGE_DIR = os.path.join(DATA_DIR, "images")
    WORKFLOW_DIR = os.path.join(DATA_DIR, "workflows")
    LOG_DIR = os.path.join(BASE_DIR, "logs")