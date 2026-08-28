import sqlite3
import json
from datetime import datetime
from backend.database import get_db_connection
from backend.tag_extractor import extract_tags_from_prompt

# ---------- 标签辅助函数 ----------

def get_or_create_tag(tag_name: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM tags WHERE name = ?', (tag_name,))
    row = cursor.fetchone()
    if row:
        tag_id = row['id']
        cursor.execute('UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?', (tag_id,))
        conn.commit()
        conn.close()
        return tag_id
    else:
        cursor.execute('INSERT INTO tags (name, usage_count) VALUES (?, 1)', (tag_name,))
        tag_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return tag_id

def link_card_tag(card_id: int, tag_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', (card_id, tag_id))
    conn.commit()
    conn.close()

def sync_card_tags(card_id: int, manual_tags: list, extracted_tags: list, positive_prompt: str = None):
    """同步卡片标签：手动标签直接保留（并加入白名单），自动提取标签过滤黑名单，白名单中的词若出现在提示词中则强制添加"""
    # 获取白名单和黑名单
    whitelist = get_whitelist()
    blacklist = get_blacklist()

    # 处理手动标签：加入白名单（去重）
    manual_set = set(manual_tags)
    for tag in manual_set:
        if tag and tag not in whitelist:
            add_whitelist(tag)

    # 处理自动提取标签：过滤黑名单
    extracted_set = set(extracted_tags)
    filtered_extracted = [tag for tag in extracted_set if tag not in blacklist]

    # 初始合并
    all_tags = set(manual_set) | set(filtered_extracted)

    # 白名单强制添加：如果 positive_prompt 存在，检查白名单中的词是否出现在提示词中
    if positive_prompt:
        for wl in whitelist:
            # 使用简单的包含检测（可改为正则边界匹配）
            if wl in positive_prompt and wl not in all_tags:
                all_tags.add(wl)

    # 更新数据库关联
    conn = get_db_connection()
    cursor = conn.cursor()
    # 删除旧关联
    cursor.execute('SELECT tag_id FROM card_tags WHERE card_id = ?', (card_id,))
    old_tag_ids = [row['tag_id'] for row in cursor.fetchall()]
    for tid in old_tag_ids:
        cursor.execute('UPDATE tags SET usage_count = usage_count - 1 WHERE id = ?', (tid,))
    cursor.execute('DELETE FROM card_tags WHERE card_id = ?', (card_id,))
    conn.commit()
    conn.close()

    # 添加新关联
    for tag_name in all_tags:
        if tag_name:
            tag_id = get_or_create_tag(tag_name)
            link_card_tag(card_id, tag_id)

# ---------- 卡片 CRUD ----------
def get_all_cards():
    """获取所有卡片，按创建时间降序"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT * FROM cards ORDER BY created_at DESC')
        rows = cursor.fetchall()
        # 如果 rows 为空，返回空列表
        result = [dict(row) for row in rows] if rows else []
        conn.close()
        return result
    except Exception as e:
        conn.close()
        # 记录错误并重新抛出，以便上层捕获
        raise e

def search_cards(keyword: str = "", tags: str = ""):
    """
    搜索卡片：支持关键词（标题、正反提示词、标签、大模型文件名）和标签过滤（逗号分隔）
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM cards WHERE 1=1"
    params = []
    if keyword:
        # 增加 models 字段的模糊搜索
        query += " AND (title LIKE ? OR positive_prompt LIKE ? OR negative_prompt LIKE ? OR tags LIKE ? OR models LIKE ?)"
        like = f"%{keyword}%"
        params.extend([like, like, like, like, like])
    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        if tag_list:
            conditions = []
            for tag in tag_list:
                conditions.append("tags LIKE ?")
                params.append(f"%{tag}%")
            query += " AND (" + " OR ".join(conditions) + ")"
    query += " ORDER BY created_at DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_card(card_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM cards WHERE id = ?', (card_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


import json
from datetime import datetime
from backend.database import get_db_connection
from backend.tag_extractor import extract_tags_from_prompt

def create_card(title, positive_prompt, negative_prompt, tags, image_path=None, workflow_path=None, models=None, prompt_type='auto'):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    models_json = json.dumps(models) if models else None
    cursor.execute('''
        INSERT INTO cards (title, positive_prompt, negative_prompt, tags, image_path, workflow_path, models, prompt_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (title, positive_prompt, negative_prompt, tags, image_path, workflow_path, models_json, prompt_type, now, now))
    card_id = cursor.lastrowid
    conn.commit()
    conn.close()

    # 处理标签
    manual_tags = []
    if tags:
        manual_tags = [t.strip() for t in tags.split(',') if t.strip()]
    extracted = []
    if positive_prompt:
        extracted = extract_tags_from_prompt(positive_prompt, prompt_type)
    sync_card_tags(card_id, manual_tags, extracted, positive_prompt)
    return card_id

def update_card(card_id, title, positive_prompt, negative_prompt, tags, image_path=None, workflow_path=None, models=None, prompt_type='auto'):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    models_json = json.dumps(models) if models else None
    cursor.execute('''
        UPDATE cards
        SET title = ?, positive_prompt = ?, negative_prompt = ?, tags = ?,
            image_path = COALESCE(?, image_path),
            workflow_path = COALESCE(?, workflow_path),
            models = COALESCE(?, models),
            prompt_type = COALESCE(?, prompt_type),
            updated_at = ?
        WHERE id = ?
    ''', (title, positive_prompt, negative_prompt, tags, image_path, workflow_path, models_json, prompt_type, now, card_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected and positive_prompt:
        manual_tags = []
        if tags:
            manual_tags = [t.strip() for t in tags.split(',') if t.strip()]
        extracted = extract_tags_from_prompt(positive_prompt, prompt_type)
        sync_card_tags(card_id, manual_tags, extracted, positive_prompt)
    return affected > 0

def delete_card(card_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tag_id FROM card_tags WHERE card_id = ?', (card_id,))
    tag_ids = [row['tag_id'] for row in cursor.fetchall()]
    for tid in tag_ids:
        cursor.execute('UPDATE tags SET usage_count = usage_count - 1 WHERE id = ?', (tid,))
    cursor.execute('DELETE FROM card_tags WHERE card_id = ?', (card_id,))
    cursor.execute('DELETE FROM cards WHERE id = ?', (card_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

# ---------- 标签云需要的函数 ----------
def get_all_tags_with_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT t.id, t.name, t.usage_count,
               GROUP_CONCAT(DISTINCT c.image_path) as image_paths
        FROM tags t
        LEFT JOIN card_tags ct ON t.id = ct.tag_id
        LEFT JOIN cards c ON ct.card_id = c.id
        WHERE c.image_path IS NOT NULL AND c.image_path != ''
        GROUP BY t.id
        ORDER BY t.usage_count DESC
    ''')
    rows = cursor.fetchall()
    conn.close()
    result = []
    for row in rows:
        item = dict(row)
        if item['image_paths']:
            paths = [p for p in item['image_paths'].split(',') if p]
            item['images'] = paths
        else:
            item['images'] = []
        del item['image_paths']
        result.append(item)
    return result


def delete_tag(tag_id: int):
    # 先获取标签名称
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT name FROM tags WHERE id = ?', (tag_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    tag_name = row['name']
    conn.close()

    # 检查是否在白名单中
    whitelist = get_whitelist()
    if tag_name not in whitelist:
        add_blacklist(tag_name)

    # 删除标签（原有逻辑）
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM card_tags WHERE tag_id = ?', (tag_id,))
    cursor.execute('DELETE FROM tags WHERE id = ?', (tag_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def get_tags_paginated(keyword: str = "", page: int = 1, per_page: int = 72):
    """获取标签列表（分页），支持关键词搜索，过滤 usage_count=0 的标签"""
    conn = get_db_connection()
    cursor = conn.cursor()
    where_clause = "WHERE t.usage_count > 0"
    params = []
    if keyword:
        where_clause += " AND t.name LIKE ?"
        params.append(f"%{keyword}%")

    # 总数
    count_sql = f"SELECT COUNT(DISTINCT t.id) as total FROM tags t {where_clause}"
    cursor.execute(count_sql, params)
    total = cursor.fetchone()['total']

    if total == 0:
        conn.close()
        return [], 0

    offset = (page - 1) * per_page
    sql = f"""
        SELECT t.id, t.name, t.usage_count,
               GROUP_CONCAT(DISTINCT c.image_path) as image_paths
        FROM tags t
        LEFT JOIN card_tags ct ON t.id = ct.tag_id
        LEFT JOIN cards c ON ct.card_id = c.id
        {where_clause}
        GROUP BY t.id
        ORDER BY t.usage_count DESC
        LIMIT ? OFFSET ?
    """
    params.extend([per_page, offset])
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        # 安全处理 image_paths
        if item.get('image_paths'):
            paths = [p for p in item['image_paths'].split(',') if p]
            item['images'] = paths
        else:
            item['images'] = []
        # 删除原始字段，避免冲突
        del item['image_paths']
        result.append(item)
    return result, total

def get_model_link(model_name: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    # 先检查 type 列是否存在，但更简单：查询所有列，避免列缺失错误
    try:
        cursor.execute('SELECT link, type FROM model_links WHERE model_name = ?', (model_name,))
        row = cursor.fetchone()
    except sqlite3.OperationalError:
        # 如果 type 列不存在，只查询 link
        cursor.execute('SELECT link FROM model_links WHERE model_name = ?', (model_name,))
        row = cursor.fetchone()
        if row:
            return {'link': row['link'], 'type': ''}
        return None
    if row:
        return dict(row)
    return None

def update_model_type(model_name: str, model_type: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    # 先检查是否存在
    cursor.execute('SELECT link FROM model_links WHERE model_name = ?', (model_name,))
    row = cursor.fetchone()
    if row:
        cursor.execute('UPDATE model_links SET type = ?, updated_at = CURRENT_TIMESTAMP WHERE model_name = ?',
                       (model_type, model_name))
    else:
        cursor.execute('INSERT INTO model_links (model_name, link, type, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                       (model_name, '', model_type))
    conn.commit()
    conn.close()

def extract_models_from_image_path(image_path):
    """从图片文件路径中提取模型名称列表"""
    # 将相对路径转为绝对路径
    from backend.config import Config
    import os, json
    from PIL import Image

    # 构造完整文件路径
    # image_path 格式为 /uploads/images/xxx.png
    full_path = os.path.join(Config.BASE_DIR, image_path.lstrip('/'))
    if not os.path.exists(full_path):
        return []

    try:
        img = Image.open(full_path)
        workflow_data = img.info.get('workflow') or img.info.get('prompt')
        if not workflow_data:
            return []
        data = json.loads(workflow_data)
        model_names = set()
        for node in data.get('nodes', []):
            node_type = node.get('type')
            if node_type in ('UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly'):
                widgets = node.get('widgets_values', [])
                if widgets and isinstance(widgets, list) and len(widgets) > 0:
                    name = widgets[0]
                    if name and isinstance(name, str):
                        base = os.path.basename(name)
                        model_names.add(base)
        return list(model_names)
    except Exception as e:
        logger.error(f"提取模型失败: {e}")
        return []


def get_model_links():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT model_name, link, type FROM model_links ORDER BY model_name')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def save_model_link(model_name: str, link: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    # 保留现有 type 字段
    cursor.execute('''
        INSERT OR REPLACE INTO model_links (model_name, link, type, updated_at)
        VALUES (
            ?,
            ?,
            COALESCE((SELECT type FROM model_links WHERE model_name = ?), ''),
            CURRENT_TIMESTAMP
        )
    ''', (model_name, link, model_name))
    conn.commit()
    conn.close()

def update_card_models(card_id: int, models: list):
    conn = get_db_connection()
    cursor = conn.cursor()
    models_json = json.dumps(models) if models else None
    cursor.execute('UPDATE cards SET models = ? WHERE id = ?', (models_json, card_id))
    conn.commit()
    conn.close()

def delete_model_link(model_name: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM model_links WHERE model_name = ?', (model_name,))
    conn.commit()
    conn.close()


def get_whitelist():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT keyword FROM tag_whitelist ORDER BY keyword')
    rows = cursor.fetchall()
    conn.close()
    return [row['keyword'] for row in rows]

def get_blacklist():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT keyword FROM tag_blacklist ORDER BY keyword')
    rows = cursor.fetchall()
    conn.close()
    return [row['keyword'] for row in rows]

def add_whitelist(keyword):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT OR IGNORE INTO tag_whitelist (keyword) VALUES (?)', (keyword,))
    conn.commit()
    conn.close()

def add_blacklist(keyword):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT OR IGNORE INTO tag_blacklist (keyword) VALUES (?)', (keyword,))
    conn.commit()
    conn.close()

def remove_whitelist(keyword):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM tag_whitelist WHERE keyword = ?', (keyword,))
    conn.commit()
    conn.close()

def remove_blacklist(keyword):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM tag_blacklist WHERE keyword = ?', (keyword,))
    conn.commit()
    conn.close()