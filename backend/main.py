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
from backend.crud import get_model_links, save_model_link, delete_model_link

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

    # ---------- 定义模型文件后缀 ----------
    MODEL_EXTENSIONS = {'.safetensors', '.pth', '.bin', '.ckpt', '.pt', '.onnx'}

    # ---------- 辅助：判断是否为模型文件 ----------
    def is_model_file(text: str) -> bool:
        lower = text.lower().strip()
        return any(lower.endswith(ext) for ext in MODEL_EXTENSIONS)

    def is_guide_text(text: str) -> bool:
        return text.strip().startswith('Guide:')

    # ---------- 提取候选提示词 ----------
    candidates = set()

    def collect_texts(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key in ('text', 'prompt', 'widgets_values'):
                    if isinstance(value, str) and len(value) > 10:
                        stripped = value.strip()
                        if not is_guide_text(stripped) and not is_model_file(stripped):
                            candidates.add(stripped)
                    elif isinstance(value, list):
                        for item in value:
                            if isinstance(item, str) and len(item) > 10:
                                stripped = item.strip()
                                if not is_guide_text(stripped) and not is_model_file(stripped):
                                    candidates.add(stripped)
                elif key == 'nodes' and isinstance(value, list):
                    for node in value:
                        collect_texts(node)
                else:
                    collect_texts(value)
        elif isinstance(obj, list):
            for item in obj:
                collect_texts(item)

    collect_texts(data)

    if not candidates:
        import re
        found = re.findall(r'"(.*?)"', workflow_data)
        for f in found:
            if len(f) > 20 and (re.search(r'[\u4e00-\u9fff]', f) or re.search(r'[a-zA-Z]{3,}', f)):
                stripped = f.strip()
                if not is_guide_text(stripped) and not is_model_file(stripped):
                    candidates.add(stripped)

    candidates_list = sorted(list(candidates), key=len, reverse=True)

    # ---------- 提取模型文件名 ----------
    model_names = set()

    def extract_models(obj):
        if isinstance(obj, dict):
            for key in ['model_name', 'unet_name', 'clip_name', 'vae_name', 'model', 'name']:
                if key in obj and isinstance(obj[key], str):
                    val = obj[key].strip()
                    if is_model_file(val):
                        model_names.add(os.path.basename(val))
            if 'widgets_values' in obj and isinstance(obj['widgets_values'], list):
                for item in obj['widgets_values']:
                    if isinstance(item, str) and is_model_file(item):
                        model_names.add(os.path.basename(item))
            for value in obj.values():
                extract_models(value)
        elif isinstance(obj, list):
            for item in obj:
                extract_models(item)

    extract_models(data)

    if not model_names and 'nodes' in data:
        for node in data['nodes']:
            node_type = node.get('type', '')
            if any(t in node_type for t in ['Loader', 'UNET', 'CLIP', 'VAE', 'Lora']):
                if 'widgets_values' in node and isinstance(node['widgets_values'], list):
                    for w in node['widgets_values']:
                        if isinstance(w, str) and is_model_file(w):
                            model_names.add(os.path.basename(w))

    # ---------- 自动保存模型链接（从全局 workflow_data 提取） ----------
    if model_names:
        import re
        # 匹配 Markdown 链接，文件名以模型后缀结尾
        pattern = re.compile(r'\[([^\]]+\.(?:safetensors|pth|bin|ckpt|pt|onnx))\]\(([^)]+)\)', re.IGNORECASE)
        matches = pattern.findall(workflow_data)
        link_map = {}
        for filename, url in matches:
            link_map[filename] = url

        # 如果未找到，再尝试从 nodes 中收集文本
        if not link_map:
            text_pool = []
            def collect_text(obj):
                if isinstance(obj, dict):
                    for key, value in obj.items():
                        if key in ('text', 'widgets_values', 'title', 'content'):
                            if isinstance(value, str):
                                text_pool.append(value)
                            elif isinstance(value, list):
                                for item in value:
                                    if isinstance(item, str):
                                        text_pool.append(item)
                        else:
                            collect_text(value)
                elif isinstance(obj, list):
                    for item in obj:
                        collect_text(item)
            collect_text(data)
            full_text = ' '.join(text_pool)
            matches = pattern.findall(full_text)
            for filename, url in matches:
                link_map[filename] = url

        from backend.crud import get_model_link, save_model_link
        saved_count = 0
        for model_name in model_names:
            if model_name in link_map:
                url = link_map[model_name]
                existing = get_model_link(model_name)
                if existing != url:
                    save_model_link(model_name, url)
                    saved_count += 1
                    logger.info(f"自动保存模型链接: {model_name} -> {url}")
        if saved_count > 0:
            logger.info(f"共自动保存 {saved_count} 个模型链接")

    return {"candidates": candidates_list, "models": list(model_names)}

@app.get("/api/model-links")
def get_model_links_endpoint():
    return get_model_links()

@app.post("/api/model-links")
def set_model_link(model_name: str = Form(...), link: str = Form(...)):
    save_model_link(model_name, link)
    return {"message": "保存成功"}

@app.delete("/api/model-links/{model_name}")
def remove_model_link(model_name: str):
    delete_model_link(model_name)
    return {"message": "删除成功"}

def extract_models_from_file_path(file_path: str) -> list:
    """从图片文件提取模型名称列表"""
    try:
        from PIL import Image
        image = Image.open(file_path)
        workflow_data = image.info.get('workflow') or image.info.get('prompt')
        if not workflow_data:
            return []
        data = json.loads(workflow_data)
        MODEL_EXTENSIONS = {'.safetensors', '.pth', '.bin', '.ckpt', '.pt', '.onnx'}
        model_names = set()
        def extract_models(obj):
            if isinstance(obj, dict):
                for key in ['model_name', 'unet_name', 'clip_name', 'vae_name', 'model', 'name']:
                    if key in obj and isinstance(obj[key], str):
                        val = obj[key].strip()
                        if any(val.endswith(ext) for ext in MODEL_EXTENSIONS):
                            model_names.add(os.path.basename(val))
                if 'widgets_values' in obj and isinstance(obj['widgets_values'], list):
                    for item in obj['widgets_values']:
                        if isinstance(item, str) and any(item.endswith(ext) for ext in MODEL_EXTENSIONS):
                            model_names.add(os.path.basename(item))
                for value in obj.values():
                    extract_models(value)
            elif isinstance(obj, list):
                for item in obj:
                    extract_models(item)
        extract_models(data)
        return list(model_names)
    except Exception as e:
        logger.warning(f"提取模型失败: {e}")
        return []

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
    models = []

    # 保存图片
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1]
        filename = f"img_{datetime.utcnow().timestamp()}{ext}"
        save_path = os.path.join(Config.IMAGE_DIR, filename)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        image_path = f"/uploads/images/{filename}"
        # 提取模型
        models = extract_models_from_file_path(save_path)

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
        workflow_path=workflow_path,
        models=models
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
    models = None

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
        models = extract_models_from_file_path(save_path)

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
        workflow_path=workflow_path,
        models=models
    )
    if not success:
        raise HTTPException(status_code=404, detail="更新失败")
    logger.info(f"Updated card {card_id}")
    return {"message": "更新成功"}
