import sqlite3
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

def sync_card_tags(card_id: int, new_tags: list):
    """同步卡片标签：先删除旧关联，再添加新关联"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tag_id FROM card_tags WHERE card_id = ?', (card_id,))
    old_tag_ids = [row['tag_id'] for row in cursor.fetchall()]
    for tid in old_tag_ids:
        cursor.execute('UPDATE tags SET usage_count = usage_count - 1 WHERE id = ?', (tid,))
    cursor.execute('DELETE FROM card_tags WHERE card_id = ?', (card_id,))
    conn.commit()
    conn.close()

    for tag_name in new_tags:
        tag_id = get_or_create_tag(tag_name)
        link_card_tag(card_id, tag_id)

# ---------- 卡片 CRUD ----------
def get_all_cards():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM cards ORDER BY created_at DESC')
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


# backend/crud.py

def create_card(title, positive_prompt, negative_prompt, tags, image_path=None, workflow_path=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute('''
        INSERT INTO cards (title, positive_prompt, negative_prompt, tags, image_path, workflow_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (title, positive_prompt, negative_prompt, tags, image_path, workflow_path, now, now))
    card_id = cursor.lastrowid
    conn.commit()
    conn.close()

    # ---------- 处理标签 ----------
    manual_tags = []
    if tags:
        manual_tags = [t.strip() for t in tags.split(',') if t.strip()]

    extracted = []
    if positive_prompt:
        extracted = extract_tags_from_prompt(positive_prompt)

    # 合并去重
    all_tags = list(set(manual_tags + extracted))

    if all_tags:
        sync_card_tags(card_id, all_tags)
        # 更新 cards.tags 字段（逗号分隔）
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE cards SET tags = ? WHERE id = ?', (','.join(all_tags), card_id))
        conn.commit()
        conn.close()

    return card_id


def update_card(card_id, title, positive_prompt, negative_prompt, tags, image_path=None, workflow_path=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute('''
        UPDATE cards
        SET title = ?, positive_prompt = ?, negative_prompt = ?, tags = ?,
            image_path = COALESCE(?, image_path),
            workflow_path = COALESCE(?, workflow_path),
            updated_at = ?
        WHERE id = ?
    ''', (title, positive_prompt, negative_prompt, tags, image_path, workflow_path, now, card_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected and positive_prompt:
        # 处理手动标签
        manual_tags = []
        if tags:
            manual_tags = [t.strip() for t in tags.split(',') if t.strip()]

        extracted = extract_tags_from_prompt(positive_prompt)
        all_tags = list(set(manual_tags + extracted))

        if all_tags:
            sync_card_tags(card_id, all_tags)
            # 更新 cards.tags 字段
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('UPDATE cards SET tags = ? WHERE id = ?', (','.join(all_tags), card_id))
            conn.commit()
            conn.close()
        else:
            # 如果没有标签，清空关联
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('DELETE FROM card_tags WHERE card_id = ?', (card_id,))
            cursor.execute('UPDATE cards SET tags = NULL WHERE id = ?', (card_id,))
            conn.commit()
            conn.close()

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

def search_cards(keyword: str = "", tags: str = ""):
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM cards WHERE 1=1"
    params = []
    if keyword:
        query += " AND (title LIKE ? OR positive_prompt LIKE ? OR negative_prompt LIKE ? OR tags LIKE ?)"
        like = f"%{keyword}%"
        params.extend([like, like, like, like])
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
    """删除标签及关联"""
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

def get_model_links():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT model_name, link FROM model_links ORDER BY model_name')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def save_model_link(model_name, link):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO model_links (model_name, link, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
    ''', (model_name, link))
    conn.commit()
    conn.close()

def delete_model_link(model_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM model_links WHERE model_name = ?', (model_name,))
    conn.commit()
    conn.close()