"""
标签提取模块（增强版）
- 中文：使用 jieba.posseg 过滤词性，只保留名词、动词、形容词
- 增加停用词和虚词过滤
- 英文：使用 yake（可配合 nltk 过滤词性）
- 支持从 JSON 工作流中提取文本
- 禁止提取负面词、马赛克等无关词汇
"""

import re
import json
import logging
import jieba
import jieba.posseg as pseg
import yake
from collections import Counter

logger = logging.getLogger(__name__)

# ---------- 停用词（扩充） ----------
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
    # 用户提供的负面词
    '马赛克', '模糊', '低分辨率', '低质量', '扭曲', '肢体', '诡异', '外观',
    '丑陋', '噪点', '网格感', 'JPEG压缩', '条纹', '异常', '水印', '乱码',
    '意义不明', '字符',
    # 原有英文负面词
    'censor', 'censored', 'mosaic',
    'lowres', 'error', 'cropped', 'worst', 'low', 'jpeg',
    'artifacts', 'heterochromia', 'out', 'frame', 'blurry', 'fat', 'ugly', 'anatomy',
    'proportions', 'heads', 'faces', 'twisted', 'grainy', 'mutation', 'poor',
    'facial', 'details', 'unclear', 'cross', 'interlocked', 'fewer', 'different',
    'thickness', 'pointed', 'thick', 'long', 'thumbs', 'sharp', 'fingernails',
    'greyscale', 'grain', 'monochrome',
    # 其他英文停用词
    'the', 'a', 'an', 'of', 'for', 'on', 'at', 'to', 'with', 'without', 'by',
    'and', 'or', 'but', 'so', 'as', 'than', 'that', 'this', 'these', 'those',
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'shall', 'can', 'etc', 'via', 'vs',
    '拒绝', '限制', '不应答',
}

# ---------- 初始化 yake ----------
yake_extractor = yake.KeywordExtractor(lan="en", n=2, top=10)

# ---------- 辅助函数 ----------
def has_chinese(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def _calc_max_tags(text_len: int) -> int:
    min_tags = 5
    max_tags = 80
    step_chars = 40
    step_count = 5
    tags = min_tags + (text_len // step_chars) * step_count
    return max(min_tags, min(tags, max_tags))

# ---------- 核心提取（纯文本） ----------
def extract_tags_from_prompt(prompt: str, max_tags: int = None) -> list:
    if not prompt or not isinstance(prompt, str):
        return []
    prompt = prompt.strip()
    if len(prompt) < 3:
        return []

    if max_tags is None:
        effective_max = _calc_max_tags(len(prompt))
    else:
        effective_max = max_tags

    # ---------- 检测是否为标签组合 ----------
    # 按逗号或分号拆分
    separators = [',', '，', ';', '；']
    parts = [prompt]
    for sep in separators:
        new_parts = []
        for p in parts:
            new_parts.extend(p.split(sep))
        parts = new_parts
    parts = [p.strip() for p in parts if p.strip()]
    # 如果片段数量 >= 3 且平均长度 <= 6，认为是标签组合
    if len(parts) >= 3:
        total_len = sum(len(p) for p in parts)
        avg_len = total_len / len(parts)
        if avg_len <= 6:
            # 标签组合直接返回去重后的列表
            tags = []
            seen = set()
            for p in parts:
                # 过滤过短或纯数字
                if len(p) < 2 or p.isdigit() or p in seen:
                    continue
                # 去除停用词（可选，但标签组合通常保留所有词）
                # 这里为了灵活性，我们不过滤停用词，但可自定义
                seen.add(p)
                tags.append(p)
            # 限制数量
            if len(tags) > effective_max:
                tags = tags[:effective_max]
            logger.info(f"标签组合直接提取: {tags}")
            return tags

    # ---------- 自然语言处理（原有逻辑） ----------
    # 中文处理
    if has_chinese(prompt):
        try:
            words = pseg.cut(prompt)
            collected = []
            for word, flag in words:
                word = word.strip()
                if len(word) < 2 or word in STOPWORDS:
                    continue
                if flag in ('n', 'v', 'a'):
                    collected.append(word)
            if collected:
                counter = Counter(collected)
                sorted_items = sorted(counter.items(), key=lambda x: (x[1], len(x[0])), reverse=True)
                tags = [w for w, _ in sorted_items[:effective_max]]
                logger.info(f"jieba.posseg 提取（名词/动词/形容词）: {tags}")
                return tags
        except Exception as e:
            logger.error(f"jieba.posseg 提取失败: {e}")

    # 英文处理（保持原有）
    try:
        results = yake_extractor.extract_keywords(prompt)
        candidate_words = [kw.strip() for kw, _ in results if kw.strip() not in STOPWORDS]
        tags = [kw for kw in candidate_words if kw.lower() not in STOPWORDS and len(kw) > 2]
        if tags:
            logger.info(f"yake 提取（英文）: {tags[:effective_max]}")
            return tags[:effective_max]
    except Exception as e:
        logger.error(f"英文提取失败: {e}")

    # 回退词频统计
    try:
        words = jieba.lcut(prompt)
        counter = Counter(words)
        filtered = [(w, c) for w, c in counter.items() if len(w) >= 2 and w not in STOPWORDS]
        filtered.sort(key=lambda x: x[1], reverse=True)
        tags = [w for w, _ in filtered[:effective_max]]
        if tags:
            logger.info(f"词频回退提取: {tags}")
            return tags
    except Exception as e:
        logger.error(f"回退失败: {e}")

    return []

# ---------- JSON 提取（增强） ----------
def extract_from_json(json_str: str, topK: int = None, include_negative: bool = False) -> list:
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        logger.warning("JSON 解析失败，降级为纯文本")
        return extract_tags_from_prompt(json_str, topK)

    text_pool = []

    def collect_texts(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key in ['text', 'prompt', 'widgets_values', 'title']:
                    if isinstance(value, str):
                        if len(value) > 10:
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

    if include_negative:
        # 可额外提取负面字段，但会增加噪声，默认关闭
        pass

    # 去重
    unique_texts = list(set(text_pool))
    # 按长度从长到短排序
    unique_texts.sort(key=len, reverse=True)

    if not unique_texts:
        return []

    # 合并
    full_text = " ".join(unique_texts)
    if len(full_text) > 2000:
        full_text = full_text[:2000]

    return extract_tags_from_prompt(full_text, topK)