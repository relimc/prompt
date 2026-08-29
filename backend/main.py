import os
import shutil
import json
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Form, Request, Query, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from typing import List
from fastapi import Body
from pydantic import BaseModel

from backend.config import Config
from backend.database import init_db, get_db_connection
from backend.crud import (
    create_card,
    get_all_cards,
    get_card,
    update_card,
    delete_card,
    search_cards,
    get_all_tags_with_stats,
    delete_tag,
    get_tags_paginated, get_model_link, update_tag_name_in_db  # 添加这一行
)
from backend.auth import create_access_token, verify_token
from backend.logging_config import logger
from backend.crud import get_model_links, save_model_link, delete_model_link
from backend.crud import update_model_type
from backend.crud import get_whitelist, get_blacklist, add_whitelist, add_blacklist, remove_whitelist, remove_blacklist
from backend.crud import update_card_models, delete_model_link

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

class ModelUpdateRequest(BaseModel):
    old_name: str
    new_name: str
    link: str

class KeywordRequest(BaseModel):
    keyword: str

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

    # ---------- 模型文件后缀（包含 .gguf） ----------
    MODEL_EXTENSIONS = {'.safetensors', '.pth', '.bin', '.ckpt', '.pt', '.onnx', '.gguf'}

    # ---------- 辅助函数 ----------
    def get_model_filename(path: str) -> str:
        normalized = path.replace('\\', '/')
        return os.path.basename(normalized)

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

    # ---------- 提取模型文件名（双保险：递归 + 正则） ----------
    model_names = set()

    # 方式1：递归遍历所有字符串
    def collect_all_strings(obj):
        if isinstance(obj, str):
            if is_model_file(obj):
                model_names.add(get_model_filename(obj))
        elif isinstance(obj, dict):
            for value in obj.values():
                collect_all_strings(value)
        elif isinstance(obj, list):
            for item in obj:
                collect_all_strings(item)

    collect_all_strings(data)

    # 方式2：正则匹配整个 workflow_data（确保不漏）
    import re
    pattern = re.compile(r'([^\s"]+\.(?:safetensors|pth|bin|ckpt|pt|onnx|gguf))', re.IGNORECASE)
    matches = pattern.findall(workflow_data)
    for match in matches:
        norm_name = get_model_filename(match)
        model_names.add(norm_name)

    # 最终统一规范化（再次确保去除路径）
    model_names = {get_model_filename(name) for name in model_names}

    # ---------- 自动保存模型链接 ----------
    if model_names:
        # 从工作流提取 Markdown 链接
        link_pattern = re.compile(r'\[([^\]]+\.(?:safetensors|pth|bin|ckpt|pt|onnx|gguf))\]\(([^)]+)\)', re.IGNORECASE)
        matches = link_pattern.findall(workflow_data)
        link_map = {}
        for filename, url in matches:
            norm_filename = get_model_filename(filename)
            link_map[norm_filename] = url

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
            matches = link_pattern.findall(full_text)
            for filename, url in matches:
                norm_filename = get_model_filename(filename)
                link_map[norm_filename] = url

        from backend.crud import get_model_link, save_model_link
        saved_count = 0
        for model_name in model_names:
            if model_name in link_map:
                url = link_map[model_name]
                existing = get_model_link(model_name)
                if existing is None or existing.get('link') != url:
                    save_model_link(model_name, url)
                    saved_count += 1
                    logger.info(f"自动保存模型链接: {model_name} -> {url}")
        if saved_count > 0:
            logger.info(f"共自动保存 {saved_count} 个模型链接")

    return {"candidates": candidates_list, "models": list(model_names)}
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

    # ---------- 模型文件后缀（包含 .gguf） ----------
    MODEL_EXTENSIONS = {'.safetensors', '.pth', '.bin', '.ckpt', '.pt', '.onnx', '.gguf'}

    # ---------- 辅助函数 ----------
    def get_model_filename(path: str) -> str:
        normalized = path.replace('\\', '/')
        return os.path.basename(normalized)

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

    # ---------- 提取模型文件名（包含 .gguf） ----------
    model_names = set()
    import re
    pattern = re.compile(r'([^\s"]+\.(?:safetensors|pth|bin|ckpt|pt|onnx|gguf))', re.IGNORECASE)
    matches = pattern.findall(workflow_data)
    for match in matches:
        norm_name = get_model_filename(match)
        model_names.add(norm_name)

    # ---------- 自动保存模型链接 ----------
    if model_names:
        link_pattern = re.compile(r'\[([^\]]+\.(?:safetensors|pth|bin|ckpt|pt|onnx|gguf))\]\(([^)]+)\)', re.IGNORECASE)
        matches = link_pattern.findall(workflow_data)
        link_map = {}
        for filename, url in matches:
            norm_filename = get_model_filename(filename)
            link_map[norm_filename] = url

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
            matches = link_pattern.findall(full_text)
            for filename, url in matches:
                norm_filename = get_model_filename(filename)
                link_map[norm_filename] = url

        from backend.crud import get_model_link, save_model_link
        saved_count = 0
        for model_name in model_names:
            if model_name in link_map:
                url = link_map[model_name]
                existing = get_model_link(model_name)
                if existing is None or existing.get('link') != url:
                    save_model_link(model_name, url)
                    saved_count += 1
                    logger.info(f"自动保存模型链接: {model_name} -> {url}")
        if saved_count > 0:
            logger.info(f"共自动保存 {saved_count} 个模型链接")

    return {"candidates": candidates_list, "models": list(model_names)}

@app.put("/api/cards/{card_id}/models")
async def update_card_models(card_id: int, models: List[str] = Body(...), token: str = Depends(get_current_user)):
    """更新卡片的 models 字段"""
    card = get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    # 将 models 转为 JSON 字符串存储
    models_json = json.dumps(models)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE cards SET models = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (models_json, card_id))
    conn.commit()
    conn.close()
    return {"message": "更新成功"}


@app.put("/api/cards/{card_id}/models")
async def update_card_model(
    card_id: int,
    req: ModelUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    old_name = req.old_name
    new_name = req.new_name
    link = req.link
    logger.info(f"更新模型: card_id={card_id}, old_name='{old_name}', new_name='{new_name}', link='{link}'")
    card = get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    models = json.loads(card['models']) if card.get('models') else []
    logger.info(f"当前卡片模型列表: {models}")
    if old_name not in models:
        # 尝试去除路径后匹配
        cleaned = old_name.replace('\\', '/').split('/')[-1]
        if cleaned in models:
            old_name = cleaned
            logger.info(f"自动清理 old_name 为: {old_name}")
        else:
            raise HTTPException(status_code=404, detail=f"模型名 '{old_name}' 不在卡片列表中")
    new_models = [new_name if name == old_name else name for name in models]
    update_card_models(card_id, new_models)

    old_link = get_model_link(old_name)
    if old_link:
        link_to_use = link if link else old_link.get('link', '')
        model_type = old_link.get('type', '未知')
        delete_model_link(old_name)
        save_model_link(new_name, link_to_use)
        if model_type != '未知':
            update_model_type(new_name, model_type)
    else:
        save_model_link(new_name, link)

    return {"message": "更新成功"}


@app.put("/api/cards/{card_id}/models")
async def update_card_model_name(
    card_id: int,
    old_name: str = Form(...),
    new_name: str = Form(...),
    link: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    card = get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    models = json.loads(card['models']) if card.get('models') else []
    if old_name not in models:
        raise HTTPException(status_code=404, detail="模型名不在卡片中")

    new_models = [new_name if name == old_name else name for name in models]
    update_card_models(card_id, new_models)

    old_link = get_model_link(old_name)
    if old_link:
        link_to_use = link if link else old_link.get('link', '')
        model_type = old_link.get('type', '未知')
        delete_model_link(old_name)
        save_model_link(new_name, link_to_use)
        if model_type != '未知':
            update_model_type(new_name, model_type)
    else:
        save_model_link(new_name, link)

    return {"message": "更新成功"}

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
    try:
        from PIL import Image
        image = Image.open(file_path)
        workflow_data = image.info.get('workflow') or image.info.get('prompt')
        if not workflow_data:
            return []
        data = json.loads(workflow_data)
        MODEL_EXTENSIONS = {'.safetensors', '.pth', '.bin', '.ckpt', '.pt', '.onnx', '.gguf'}
        model_names = set()
        def collect_strings(obj):
            if isinstance(obj, str):
                lower = obj.lower().strip()
                if any(lower.endswith(ext) for ext in MODEL_EXTENSIONS):
                    model_names.add(os.path.basename(obj.replace('\\', '/')))
            elif isinstance(obj, dict):
                for value in obj.values():
                    collect_strings(value)
            elif isinstance(obj, list):
                for item in obj:
                    collect_strings(item)
        collect_strings(data)
        # 正则备选
        import re
        pattern = re.compile(r'([^\s"]+\.(?:safetensors|pth|bin|ckpt|pt|onnx|gguf))', re.IGNORECASE)
        matches = pattern.findall(workflow_data)
        for match in matches:
            model_names.add(os.path.basename(match.replace('\\', '/')))
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
    prompt_type: str = Form('auto'),
):
    if not positive_prompt:
        raise HTTPException(status_code=400, detail="正向提示词不能为空")

    image_path = None
    workflow_path = None
    models = []

    if image and image.filename:
        ext = os.path.splitext(image.filename)[1]
        filename = f"img_{datetime.utcnow().timestamp()}{ext}"
        save_path = os.path.join(Config.IMAGE_DIR, filename)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        image_path = f"/uploads/images/{filename}"
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
        models=models,
        prompt_type=prompt_type
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
    prompt_type: str = Form('auto'),
):
    existing = get_card(card_id)
    if not existing:
        raise HTTPException(status_code=404, detail="卡片不存在")
    if not positive_prompt:
        raise HTTPException(status_code=400, detail="正向提示词不能为空")

    image_path = existing.get("image_path")
    workflow_path = existing.get("workflow_path")
    models = None

    if image and image.filename:
        if existing.get("image_path"):
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
        if existing.get("workflow_path"):
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
        models=models,
        prompt_type=prompt_type
    )
    if not success:
        raise HTTPException(status_code=404, detail="更新失败")
    logger.info(f"Updated card {card_id}")
    return {"message": "更新成功"}

@app.post("/api/model-links")
async def set_model_link(
    model_name: str = Form(...),
    link: str = Form(...),
    model_type: Optional[str] = Form(None)
):
    save_model_link(model_name, link, model_type)
    return {"message": "保存成功"}

@app.put("/api/model-links/{model_name}/type")
async def update_model_type_endpoint(model_name: str, model_type: str = Form(...)):
    try:
        update_model_type(model_name, model_type)
        return {"message": "类型更新成功"}
    except Exception as e:
        logger.error(f"更新模型类型失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tag-lists/whitelist")
def get_whitelist_endpoint():
    return get_whitelist()

@app.get("/api/tag-lists/blacklist")
def get_blacklist_endpoint():
    return get_blacklist()

@app.delete("/api/tag-lists/whitelist/{keyword}")
def remove_whitelist_endpoint(keyword: str):
    remove_whitelist(keyword)
    return {"message": "移除成功"}

@app.delete("/api/tag-lists/blacklist/{keyword}")
def remove_blacklist_endpoint(keyword: str):
    remove_blacklist(keyword)
    return {"message": "移除成功"}

@app.post("/api/tag-lists/whitelist")
def add_whitelist_endpoint(req: KeywordRequest):
    add_whitelist(req.keyword.strip())
    return {"message": "添加成功"}

@app.post("/api/tag-lists/blacklist")
def add_blacklist_endpoint(req: KeywordRequest):
    add_blacklist(req.keyword.strip())
    return {"message": "添加成功"}


from backend.crud import update_card_models, delete_model_link, get_card
import json


@app.delete("/api/cards/{card_id}/models")
async def delete_card_model(
        card_id: int,
        model_name: str = Form(...),
        current_user: dict = Depends(get_current_user)
):
    # 获取卡片信息
    card = get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")

    # 解析 models 字段（JSON 数组）
    models = card.get('models')
    if models:
        # 如果 models 是字符串，解析为列表
        if isinstance(models, str):
            try:
                models = json.loads(models)
            except json.JSONDecodeError:
                models = []
    else:
        models = []

    # 检查模型是否存在
    if model_name not in models:
        raise HTTPException(status_code=404, detail="模型不在卡片中")

    # 移除模型
    new_models = [m for m in models if m != model_name]

    # 更新卡片 models 字段
    update_card_models(card_id, new_models)  # 同步调用，不加 await

    # 删除 model_links 中的记录
    delete_model_link(model_name)  # 同步调用，不加 await

    return {"message": "删除成功"}

@app.put("/api/tags/{tag_id}/name")
async def update_tag_name(
    tag_id: int,
    new_name: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    success = update_tag_name_in_db(tag_id, new_name)
    if not success:
        raise HTTPException(status_code=404, detail="标签不存在或名称重复")
    return {"message": "更新成功"}

from backend.crud import get_stopwords, add_stopword, remove_stopword
from backend.tag_extractor import refresh_stopwords

@app.get("/api/stopwords")
def get_stopwords_endpoint():
    return get_stopwords()

@app.post("/api/stopwords")
def add_stopword_endpoint(keyword: str = Form(...)):
    add_stopword(keyword.strip())
    refresh_stopwords()
    return {"message": "添加成功"}

@app.delete("/api/stopwords/{keyword}")
def remove_stopword_endpoint(keyword: str):
    remove_stopword(keyword)
    refresh_stopwords()
    return {"message": "移除成功"}
