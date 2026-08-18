FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖（如有需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 只复制代码（不复制数据）
COPY backend/ ./backend/

# 设置环境变量
ENV PYTHONPATH=/app

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]