"""
标签提取模块（增强版）
- 支持指定提示词类型：'auto', 'tags', 'nl', 'json'
- 中文：合并"形容词+的+名词"模式，保留名词/动词/形容词
- 英文：仅使用 yake 提取短语（不拆分单词）
- 禁止提取负面词、马赛克等无关词汇
- 标签组合（逗号/分号分隔）直接拆分所有标签，不限制数量
- 自然语言提取所有名词/动词/形容词，不限制数量（返回全部，去重）
"""

import re
import json
import logging
import jieba
import jieba.posseg as pseg
import yake
from collections import Counter

logger = logging.getLogger(__name__)

# ---------- 停用词（完整） ----------
STOPWORDS = {
    # 中文虚词、助词、语气词
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
    '一', '个', '上', '也', '很', '至', '把', '被', '与', '或', '且',
    '于', '之', '其', '所', '以', '而', '因', '为', '对', '从', '等',
    '将', '无', '没有', '又', '再', '更', '最', '太', '极', '较', '稍',
    '可', '会', '能', '可能', '可以', '应该', '要', '才', '都',
    '也', '还', '便', '但', '却', '只', '仍', '还是', '总',
    '来', '去', '向', '往', '朝', '过', '着', '呢', '吗', '吧',
    '啊', '哈', '呀', '哦', '嗯', '呃', '则', '即', '乃', '尚', '须',
    '略', '约', '余', '许', '若', '尔', '亦', '已', '乎', '焉', '哉',
    # 常见虚词
    '可能', '均匀', '为主', '来自', '各种', '其中', '之间', '之内', '之外',
    '以上', '以下', '因此', '于是', '然而', '总之', '此外', '同时',
    '这样', '那样', '那么', '什么', '怎么', '如何', '为何',
    '这个', '那个', '这些', '那些', '某种', '任何',
    '通常', '一般', '经常', '常常', '往往', '基本', '大概', '大约',
    '十分', '非常', '特别', '相当', '比较', '较为', '稍微', '略微',
    '几乎', '简直', '甚至', '恰好', '刚好', '刚好', '正是',
    '绝对', '肯定', '必然', '也许', '或许', '大约',

    # ---------- 新增负面词 ----------
    '马赛克', '模糊', '低分辨率', '低质量', '扭曲', '肢体', '诡异', '外观',
    '丑陋', '噪点', '网格感', 'JPEG压缩', '条纹', '异常', '水印', '乱码',
    '意义不明', '字符',
    'censor', 'censored', 'mosaic',
    'lowres', 'error', 'cropped', 'worst', 'low', 'jpeg',
    'artifacts', 'heterochromia', 'out', 'frame', 'blurry', 'fat', 'ugly', 'anatomy',
    'proportions', 'heads', 'faces', 'twisted', 'grainy', 'mutation', 'poor',
    'facial', 'details', 'unclear', 'cross', 'interlocked', 'fewer', 'different',
    'thickness', 'pointed', 'thick', 'long', 'thumbs', 'sharp', 'fingernails',
    'greyscale', 'grain', 'monochrome',
    # 英文停用词
    'the', 'a', 'an', 'of', 'for', 'on', 'at', 'to', 'with', 'without', 'by',
    'and', 'or', 'but', 'so', 'as', 'than', 'that', 'this', 'these', 'those',
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'shall', 'can', 'etc', 'via', 'vs',
    '拒绝', '限制', '不应答',
}

# ---------- 初始化 yake ----------
yake_extractor = yake.KeywordExtractor(lan="en", n=2, top=500)

# ---------- 辅助函数 ----------
def has_chinese(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def _calc_max_tags(text_len: int) -> int:
    # 仅用于回退方案
    min_tags = 5
    max_tags = 80
    step_chars = 40
    step_count = 5
    tags = min_tags + (text_len // step_chars) * step_count
    return max(min_tags, min(tags, max_tags))

# ---------- 中文自然语言提取 ----------
def extract_nl_chinese(prompt: str) -> list:
    """中文自然语言提取：合并"形容词+的+名词"，保留名词/动词/形容词"""
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
            # 检测"形容词+的+名词"模式
            if flag == 'a' and i + 2 < len(tokens):
                next_word, next_flag = tokens[i + 1]
                next2_word, next2_flag = tokens[i + 2]
                if next_word == '的' and next2_flag in ('n', 'nr', 'ns', 'nt', 'nz'):
                    combined = word + next_word + next2_word
                    if combined not in STOPWORDS:
                        collected.append(combined)
                    i += 3
                    continue
            # 否则，如果是名词、动词、形容词，单独添加
            if flag in ('n', 'v', 'a') and word not in STOPWORDS:
                collected.append(word)
            i += 1
        # 去重
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

# ---------- 英文自然语言提取 ----------
def extract_nl_english(prompt: str) -> list:
    """英文自然语言提取：仅使用 yake 短语，不拆分单词"""
    separators = [',', '，', ';', '；']
    # 短标签整体保留（无分隔符，词数 <= 4）
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
            if kw not in seen:
                seen.add(kw)
                tags.append(kw)
        logger.info(f"英文自然语言提取: {tags}")
        return tags
    except Exception as e:
        logger.error(f"英文自然语言提取失败: {e}")
        return []

# ---------- JSON 提取 ----------
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

# ---------- 核心函数 ----------
def extract_tags_from_prompt(prompt: str, prompt_type: str = 'auto') -> list:
    """
    根据指定的提示词类型提取标签
    prompt_type: 'auto', 'tags', 'nl', 'json'
    """
    if not prompt or not isinstance(prompt, str):
        return []
    prompt = prompt.strip()
    if len(prompt) < 3:
        return []

    # 1. JSON 类型
    if prompt_type == 'json':
        return extract_from_json(prompt)

    # 2. 标签组合类型
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
            if len(p) >= 2 and not p.isdigit() and p not in seen:
                seen.add(p)
                tags.append(p)
        return tags

    # 3. 自然语言类型
    if prompt_type == 'nl':
        if has_chinese(prompt):
            return extract_nl_chinese(prompt)
        else:
            return extract_nl_english(prompt)

    # 4. auto: 自动判断
    # 先尝试 JSON
    try:
        json.loads(prompt)
        return extract_from_json(prompt)
    except:
        pass

    # 再尝试标签组合（逗号/分号分隔，且平均长度 <= 6）
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
                if len(p) >= 2 and not p.isdigit() and p not in seen:
                    seen.add(p)
                    tags.append(p)
            return tags

    # 最后作为自然语言处理
    if has_chinese(prompt):
        return extract_nl_chinese(prompt)
    else:
        return extract_nl_english(prompt)