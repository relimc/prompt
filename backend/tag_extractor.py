"""
标签提取模块
- 支持指定提示词类型：'auto', 'tags', 'nl', 'json'
- 停用词从数据库 stopwords 表加载，支持动态刷新
"""

import re
import json
import logging
import sqlite3
import jieba
import jieba.posseg as pseg
import yake
from collections import Counter
from backend.config import Config

logger = logging.getLogger(__name__)

# ---------- 停用词缓存 ----------
_STOPWORDS = None

def _get_stopwords_from_db():
    """从数据库查询停用词"""
    conn = sqlite3.connect(Config.DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT keyword FROM stopwords ORDER BY keyword')
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows]

def load_stopwords():
    """加载停用词到缓存"""
    global _STOPWORDS
    try:
        words = _get_stopwords_from_db()
        _STOPWORDS = set(words)
        logger.info(f"从数据库加载停用词 {len(_STOPWORDS)} 个")
    except sqlite3.OperationalError:
        # 表可能不存在，创建空集合
        logger.warning("stopwords 表不存在，使用空停用词集合")
        _STOPWORDS = set()
    except Exception as e:
        logger.error(f"加载停用词失败: {e}")
        _STOPWORDS = set()
    return _STOPWORDS

def get_stopwords():
    """获取停用词集合（懒加载）"""
    global _STOPWORDS
    if _STOPWORDS is None:
        load_stopwords()
    return _STOPWORDS

def refresh_stopwords():
    """外部调用刷新停用词"""
    load_stopwords()

# ---------- 初始化 yake ----------
yake_extractor = yake.KeywordExtractor(lan="en", n=2, top=500)

def has_chinese(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def _calc_max_tags(text_len: int) -> int:
    min_tags = 5
    max_tags = 80
    step_chars = 40
    step_count = 5
    tags = min_tags + (text_len // step_chars) * step_count
    return max(min_tags, min(tags, max_tags))

def extract_nl_chinese(prompt: str) -> list:
    """中文自然语言提取：合并'形容词+的+名词'，保留名词/动词/形容词"""
    stopwords = get_stopwords()
    try:
        words = pseg.cut(prompt)
        tokens = list(words)
        collected = []
        i = 0
        while i < len(tokens):
            word, flag = tokens[i]
            word = word.strip()
            if not word or len(word) < 2:
                i += 1
                continue
            if flag == 'a' and i + 2 < len(tokens):
                next_word, next_flag = tokens[i + 1]
                next2_word, next2_flag = tokens[i + 2]
                if next_word == '的' and next2_flag in ('n', 'nr', 'ns', 'nt', 'nz'):
                    combined = word + next_word + next2_word
                    if combined not in stopwords:
                        collected.append(combined)
                    i += 3
                    continue
            if flag in ('n', 'v', 'a') and word not in stopwords:
                collected.append(word)
            i += 1
        seen = set()
        unique = []
        for w in collected:
            if w not in seen:
                seen.add(w)
                unique.append(w)
        logger.info(f"中文自然语言提取: {unique}")
        return unique
    except Exception as e:
        logger.error(f"中文自然语言提取失败: {e}")
        return []

def extract_nl_english(prompt: str) -> list:
    """英文自然语言提取：仅使用 yake 短语，不拆分单词"""
    stopwords = get_stopwords()
    separators = [',', '，', ';', '；']
    if not any(sep in prompt for sep in separators):
        words = prompt.split()
        if len(words) <= 4:
            return [prompt.strip()]
    try:
        results = yake_extractor.extract_keywords(prompt)
        tags = []
        seen = set()
        for kw, score in results:
            kw = kw.strip()
            if len(kw) < 2:
                continue
            if kw in stopwords:
                continue
            if kw not in seen:
                seen.add(kw)
                tags.append(kw)
        logger.info(f"英文自然语言提取: {tags}")
        return tags
    except Exception as e:
        logger.error(f"英文自然语言提取失败: {e}")
        return []

def extract_tags_from_prompt(prompt: str, prompt_type: str = 'auto') -> list:
    """主提取函数（使用 get_stopwords()）"""
    if not prompt or not isinstance(prompt, str):
        return []
    prompt = prompt.strip()
    if len(prompt) < 3:
        return []

    stopwords = get_stopwords()

    if prompt_type == 'json':
        return extract_from_json(prompt)
    if prompt_type == 'tags':
        separators = [',', '，', ';', '；']
        parts = [prompt]
        for sep in separators:
            new_parts = []
            for p in parts:
                new_parts.extend(p.split(sep))
            parts = new_parts
        parts = [p.strip() for p in parts if p.strip()]
        tags = []
        seen = set()
        for p in parts:
            if len(p) >= 2 and not p.isdigit() and p not in seen and p not in stopwords:
                seen.add(p)
                tags.append(p)
        return tags
    if prompt_type == 'nl':
        return extract_nl_chinese(prompt) if has_chinese(prompt) else extract_nl_english(prompt)

    # auto 模式
    try:
        json.loads(prompt)
        return extract_from_json(prompt)
    except:
        pass
    separators = [',', '，', ';', '；']
    parts = [prompt]
    for sep in separators:
        new_parts = []
        for p in parts:
            new_parts.extend(p.split(sep))
        parts = new_parts
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) >= 3:
        total_len = sum(len(p) for p in parts)
        avg_len = total_len / len(parts)
        if avg_len <= 6:
            tags = []
            seen = set()
            for p in parts:
                if len(p) >= 2 and not p.isdigit() and p not in seen and p not in stopwords:
                    seen.add(p)
                    tags.append(p)
            return tags
    return extract_nl_chinese(prompt) if has_chinese(prompt) else extract_nl_english(prompt)

def extract_from_json(json_str: str) -> list:
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        return extract_tags_from_prompt(json_str, 'auto')
    text_pool = []
    def collect_texts(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key in ('text', 'prompt', 'widgets_values', 'title'):
                    if isinstance(value, str) and len(value) > 10:
                        text_pool.append(value)
                    elif isinstance(value, list):
                        for item in value:
                            if isinstance(item, str) and len(item) > 10:
                                text_pool.append(item)
                elif key == 'nodes' and isinstance(value, list):
                    for node in value:
                        collect_texts(node)
                else:
                    collect_texts(value)
        elif isinstance(obj, list):
            for item in obj:
                collect_texts(item)
    collect_texts(data)
    unique_texts = list(set(text_pool))
    unique_texts.sort(key=len, reverse=True)
    if not unique_texts:
        return []
    full_text = " ".join(unique_texts)
    if len(full_text) > 2000:
        full_text = full_text[:2000]
    return extract_tags_from_prompt(full_text, 'auto')

def reload_stopwords():
    refresh_stopwords()
    return len(get_stopwords())