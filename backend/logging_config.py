import logging
import os
from logging.handlers import RotatingFileHandler
from backend.config import Config

# ---------- 确保日志目录存在 ----------
LOG_DIR = Config.LOG_DIR
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

LOG_FILE = os.path.join(LOG_DIR, "app.log")

def setup_logging():
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # 控制台输出
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console.setFormatter(formatter)
    logger.addHandler(console)

    # 文件输出（滚动）
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=10*1024*1024, backupCount=10)
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger

logger = setup_logging()