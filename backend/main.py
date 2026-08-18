import os
import shutil
import json
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Form, Request, Query, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from backend.config import Config
from backend.database import init_db
from backend.crud import (
    create_card,
    get_all_cards,
    get_card,
    update_card,
    delete_card,
    search_cards,
    get_all_tags_with_stats,
    delete_tag,
    get_tags_paginated  # 添加这一行
)
from backend.auth import create_access_token, verify_token
from backend.logging_config import logger

# ---------- 确保上传目录存在 ----------
os.makedirs(Config.IMAGE_DIR, exist_ok=True)
os.makedirs(Config.WORKFLOW_DIR, exist_ok=True)
os.makedirs(Config.LOG_DIR, exist_ok=True)

init_db()

app = FastAPI()

# 挂载静态文件
app.mount("/static", StaticFiles(directory="backend/static"), name="static")
app.mount("/uploads", StaticFiles(directory=Config.UPLOAD_DIR), name="uploads")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- 鉴权依赖（修正版） ----------
def get_current_user(authorization: str = Header(None)):
    if authorization is None:
        logger.warning("未提供 Authorization 头")
        raise HTTPException(status_code=401, detail="未提供令牌")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        logger.warning(f"无效的认证方案: {scheme}")
        raise HTTPException(status_code=401, detail="无效的认证方案")
    payload = verify_token(token)
    if not payload:
        logger.warning(f"无效令牌: {token[:10]}...")
        raise HTTPException(status_code=401, detail="无效令牌")
    logger.info(f"令牌验证成功，用户: {payload.get('sub')}")
    return payload

# ---------- 日志中间件 ----------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Response: {response.status_code}")
    return response

# ---------- 根路径重定向 ----------
@app.get("/")
async def root():
    return FileResponse("backend/static/index.html")

# ---------- API 路由 ----------
@app.post("/api/login")
def login(username: str = Form(...), password: str = Form(...)):
    if username == Config.USERNAME and password == Config.PASSWORD:
        token = create_access_token(data={"sub": username})
        logger.info(f"Login successful: {username}")
        return {"access_token": token}
    logger.warning(f"Login failed: {username}")
    raise HTTPException(status_code=401, detail="用户名或密码错误")

@app.get("/api/cards")
def list_cards(keyword: Optional[str] = Query(None), tags: Optional[str] = Query(None)):
    if keyword or tags:
        cards = search_cards(keyword or "", tags or "")
    else:
        cards = get_all_cards()
    return cards

@app.get("/api/cards/{card_id}")
def get_card_detail(card_id: int):
    card = get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    return card

@app.post("/api/cards", dependencies=[Depends(get_current_user)])
async def create_card_endpoint(
    title: Optional[str] = Form(None),
    positive_prompt: str = Form(...),
    negative_prompt: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    workflow: Optional[UploadFile] = File(None),
):
    if not positive_prompt:
        raise HTTPException(status_code=400, detail="正向提示词不能为空")

    image_path = None
    workflow_path = None

    if image and image.filename:
        ext = os.path.splitext(image.filename)[1]
        filename = f"img_{datetime.utcnow().timestamp()}{ext}"
        save_path = os.path.join(Config.IMAGE_DIR, filename)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        image_path = f"/uploads/images/{filename}"

    if workflow and workflow.filename:
        ext = os.path.splitext(workflow.filename)[1]
        filename = f"wf_{datetime.utcnow().timestamp()}{ext}"
        save_path = os.path.join(Config.WORKFLOW_DIR, filename)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(workflow.file, f)
        workflow_path = f"/uploads/workflows/{filename}"

    card_id = create_card(
        title=title,
        positive_prompt=positive_prompt,
        negative_prompt=negative_prompt,
        tags=tags,
        image_path=image_path,
        workflow_path=workflow_path
    )
    logger.info(f"Created card {card_id}")
    return {"id": card_id, "message": "创建成功"}

@app.put("/api/cards/{card_id}", dependencies=[Depends(get_current_user)])
async def update_card_endpoint(
    card_id: int,
    title: Optional[str] = Form(None),
    positive_prompt: str = Form(...),
    negative_prompt: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    workflow: Optional[UploadFile] = File(None),
):
    existing = get_card(card_id)
    if not existing:
        raise HTTPException(status_code=404, detail="卡片不存在")

    if not positive_prompt:
        raise HTTPException(status_code=400, detail="正向提示词不能为空")

    image_path = existing["image_path"]
    workflow_path = existing["workflow_path"]

    if image and image.filename:
        if existing["image_path"]:
            old_path = os.path.join(Config.UPLOAD_DIR, existing["image_path"].lstrip("/uploads"))
            if os.path.exists(old_path):
                os.remove(old_path)
        ext = os.path.splitext(image.filename)[1]
        filename = f"img_{datetime.utcnow().timestamp()}{ext}"
        save_path = os.path.join(Config.IMAGE_DIR, filename)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        image_path = f"/uploads/images/{filename}"

    if workflow and workflow.filename:
        if existing["workflow_path"]:
            old_path = os.path.join(Config.UPLOAD_DIR, existing["workflow_path"].lstrip("/uploads"))
            if os.path.exists(old_path):
                os.remove(old_path)
        ext = os.path.splitext(workflow.filename)[1]
        filename = f"wf_{datetime.utcnow().timestamp()}{ext}"
        save_path = os.path.join(Config.WORKFLOW_DIR, filename)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(workflow.file, f)
        workflow_path = f"/uploads/workflows/{filename}"

    success = update_card(
        card_id=card_id,
        title=title,
        positive_prompt=positive_prompt,
        negative_prompt=negative_prompt,
        tags=tags,
        image_path=image_path,
        workflow_path=workflow_path
    )
    if not success:
        raise HTTPException(status_code=404, detail="更新失败")
    logger.info(f"Updated card {card_id}")
    return {"message": "更新成功"}

@app.delete("/api/cards/{card_id}", dependencies=[Depends(get_current_user)])
def delete_card_endpoint(card_id: int):
    existing = get_card(card_id)
    if not existing:
        raise HTTPException(status_code=404, detail="卡片不存在")
    # 删除关联文件
    if existing["image_path"]:
        path = os.path.join(Config.UPLOAD_DIR, existing["image_path"].lstrip("/uploads"))
        if os.path.exists(path):
            os.remove(path)
    if existing["workflow_path"]:
        path = os.path.join(Config.UPLOAD_DIR, existing["workflow_path"].lstrip("/uploads"))
        if os.path.exists(path):
            os.remove(path)
    success = delete_card(card_id)
    if not success:
        raise HTTPException(status_code=404, detail="删除失败")
    logger.info(f"Deleted card {card_id}")
    return {"message": "删除成功"}

@app.get("/api/export")
def export_cards():
    return get_all_cards()

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- 标签 API ----------
@app.get("/api/tags")
def get_tags(keyword: Optional[str] = Query(None), page: int = Query(1, ge=1), per_page: int = Query(72, ge=1, le=200)):
    tags, total = get_tags_paginated(keyword or "", page, per_page)
    total_pages = (total + per_page - 1) // per_page
    return {
        "tags": tags,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages
    }

@app.delete("/api/tags/{tag_id}", dependencies=[Depends(get_current_user)])
def delete_tag_endpoint(tag_id: int):
    success = delete_tag(tag_id)
    if not success:
        raise HTTPException(status_code=404, detail="标签不存在")
    return {"message": "删除成功"}


@app.post("/api/extract-prompt-from-image")
async def extract_prompt_from_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="只支持图片文件")

    contents = await file.read()
    try:
        from PIL import Image
        import io
        image = Image.open(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法解析图片: {str(e)}")

    workflow_data = image.info.get('workflow') or image.info.get('prompt')
    if not workflow_data:
        raise HTTPException(status_code=400, detail="该图片不包含工作流信息")

    try:
        data = json.loads(workflow_data)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"工作流数据格式错误: {str(e)}")

    # 收集所有候选提示词文本
    candidates = set()

    def collect_texts(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                # 检查常见 key
                if key in ['text', 'prompt', 'widgets_values']:
                    if isinstance(value, str) and len(value) > 10:
                        candidates.add(value.strip())
                    elif isinstance(value, list):
                        for item in value:
                            if isinstance(item, str) and len(item) > 10:
                                candidates.add(item.strip())
                else:
                    collect_texts(value)
        elif isinstance(obj, list):
            for item in obj:
                collect_texts(item)

    collect_texts(data)

    # 如果 candidates 为空，尝试从字符串中提取所有含中文或英文的文本（降级）
    if not candidates:
        import re
        # 查找所有引号内的字符串
        found = re.findall(r'"(.*?)"', workflow_data)
        for f in found:
            if len(f) > 20 and (re.search(r'[\u4e00-\u9fff]', f) or re.search(r'[a-zA-Z]{3,}', f)):
                candidates.add(f)

    # 转为列表并排序（按长度降序，更可能是提示词）
    candidates_list = sorted(list(candidates), key=len, reverse=True)

    if not candidates_list:
        raise HTTPException(status_code=400, detail="未能提取到任何提示词文本")

    return {"candidates": candidates_list}
