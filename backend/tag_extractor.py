"""
标签提取模块（优化自然语言词组提取）
- 支持指定提示词类型：'auto', 'tags', 'nl', 'json'
- 自然语言：提取连续的实词序列（名词/动词/形容词）作为短语
- 保留动词单独出现，禁止名词或形容词单独出现
- 无数量限制，尽可能多地提取
- 停用词从数据库加载，支持动态刷新
"""

import re
import json
import logging
import sqlite3
import jieba
import jieba.posseg as pseg
from collections import Counter
from backend.config import Config
from backend.database import get_db_connection

logger = logging.getLogger(__name__)

# ---------- 停用词缓存 ----------
_STOPWORDS = None

def load_stopwords():
    global _STOPWORDS
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT keyword FROM stopwords ORDER BY keyword')
        rows = cursor.fetchall()
        conn.close()
        words = [row['keyword'] for row in rows]
        _STOPWORDS = set(words)
        logger.info(f"从数据库加载停用词 {len(_STOPWORDS)} 个")
    except Exception as e:
        logger.error(f"加载停用词失败: {e}")
        _STOPWORDS = set()
    return _STOPWORDS

def get_stopwords():
    global _STOPWORDS
    if _STOPWORDS is None:
        load_stopwords()
    return _STOPWORDS

def refresh_stopwords():
    load_stopwords()

# ---------- 辅助函数 ----------
def has_chinese(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def split_sentences(text):
    """按中文标点拆分句子"""
    sentences = re.split(r'[。；：！？\n]+', text)
    return [s.strip() for s in sentences if s.strip()]

def extract_nl_phrases(prompt: str) -> list:
    """
    从自然语言中提取连续的实词序列（名词/动词/形容词）
    保留动词单独出现，禁止名词或形容词单独出现
    两阶段提取：先提取词组，再提取遗漏的单个实词
    """
    stopwords = get_stopwords()
    # 定义实词词性（名词、动词、形容词）
    content_tags = {'n', 'nr', 'ns', 'nt', 'nz', 'v', 'a', 'eng'}

    # 按标点拆分句子
    sentences = split_sentences(prompt)
    all_phrases = []
    used_indices = set()  # 记录已使用的词索引（跨句子）

    for sent in sentences:
        if not sent:
            continue
        words = pseg.cut(sent)
        tokens = list(words)
        if not tokens:
            continue

        # 第一阶段：扫描连续的实词序列（词组）
        i = 0
        while i < len(tokens):
            word, flag = tokens[i]
            word = word.strip()
            if not word or len(word) < 2:
                i += 1
                continue
            if word in stopwords:
                i += 1
                continue

            # 如果是名词或形容词，必须与相邻实词组合，不能单独出现
            if flag in {'n', 'nr', 'ns', 'nt', 'nz', 'a', 'eng'}:
                # 尝试向后组合（最长匹配）
                phrase = word
                j = i + 1
                consumed = [i]
                while j < len(tokens):
                    next_word, next_flag = tokens[j]
                    next_word = next_word.strip()
                    # 如果下一个词是实词且不是停用词，则加入短语
                    if (next_flag in content_tags and next_word not in stopwords and
                        len(next_word) >= 2 and not next_word.isdigit()):
                        phrase += next_word
                        consumed.append(j)
                        j += 1
                    # 处理“的”、“式”、“级”、“型”等连接词（允许加入）
                    elif next_word in {'的', '式', '级', '型'} and j + 1 < len(tokens):
                        # 检查后面的词是否是实词
                        next2_word, next2_flag = tokens[j + 1]
                        if next2_flag in content_tags and next2_word not in stopwords:
                            phrase += next_word + next2_word
                            consumed.append(j)
                            consumed.append(j + 1)
                            j += 2
                        else:
                            break
                    else:
                        break
                # 如果向后组合后短语长度增加，则保留
                if len(phrase) > len(word):
                    # 记录使用的索引
                    for idx in consumed:
                        used_indices.add(idx)
                    all_phrases.append(phrase)
                    i = j
                    continue
                # 如果没有向后组合，尝试向前组合（避免遗漏前面的名词）
                if i > 0 and i - 1 not in used_indices:
                    prev_word, prev_flag = tokens[i - 1]
                    if prev_flag in content_tags and prev_word not in stopwords:
                        phrase = prev_word + word
                        used_indices.add(i - 1)
                        used_indices.add(i)
                        all_phrases.append(phrase)
                # 如果既不能向后也不能向前，则跳过（不单独保留名词/形容词）
                i += 1
                continue

            # 如果是动词，允许单独出现，但也尝试与后面名词组合
            if flag == 'v':
                # 检查后面是否接名词
                if i + 1 < len(tokens):
                    next_word, next_flag = tokens[i + 1]
                    if next_flag in {'n', 'nr', 'ns', 'nt', 'nz'} and next_word not in stopwords:
                        phrase = word + next_word
                        used_indices.add(i)
                        used_indices.add(i + 1)
                        all_phrases.append(phrase)
                        i += 2
                        continue
                # 否则单独保留动词（排除常见助动词）
                if word not in {'是', '有', '在', '了', '的', '着', '和', '与', '或'}:
                    used_indices.add(i)
                    all_phrases.append(word)
                i += 1
                continue

            # 其他词性（如介词、连词等）跳过
            i += 1

        # 第二阶段：从当前句子中提取遗漏的单个实词（仅限未被使用的词）
        for idx, (word, flag) in enumerate(tokens):
            if idx in used_indices:
                continue
            word = word.strip()
            if not word or len(word) < 2:
                continue
            if word in stopwords:
                continue
            # 如果是名词、动词或形容词，且未被使用，则作为单个词添加
            if flag in {'n', 'nr', 'ns', 'nt', 'nz', 'v', 'a', 'eng'}:
                # 动词过滤常见助动词
                if flag == 'v' and word in {'是', '有', '在', '了', '的', '着', '和', '与', '或'}:
                    continue
                used_indices.add(idx)
                all_phrases.append(word)

    # 去重并过滤停用词（再次确保）
    seen = set()
    unique = []
    for p in all_phrases:
        p_lower = p.lower()
        if p_lower not in seen and p not in stopwords:
            seen.add(p_lower)
            unique.append(p)

    logger.info(f"自然语言提取词组（共 {len(unique)} 个）: {unique[:10] if unique else '无'}")
    return unique

# ---------- 主提取函数 ----------
def extract_tags_from_prompt(prompt: str, prompt_type: str = 'auto') -> list:
    if not prompt or not isinstance(prompt, str):
        return []
    prompt = prompt.strip()
    if len(prompt) < 3:
        return []

    stopwords = get_stopwords()

    # 1. JSON 格式
    if prompt_type == 'json':
        return extract_from_json(prompt)

    # 2. 标签组合（tags）
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

    # 3. 自然语言（nl）
    if prompt_type == 'nl':
        return extract_nl_phrases(prompt)

    # 4. auto 模式
    # 先尝试 JSON
    try:
        json.loads(prompt)
        return extract_from_json(prompt)
    except:
        pass

    # 检测是否为标签组合（逗号分隔且平均长度 <= 6）
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

    # 否则作为自然语言处理
    return extract_nl_phrases(prompt)

# ---------- JSON 提取（不变） ----------
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