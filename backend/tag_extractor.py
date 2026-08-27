"""
标签提取模块（增强版）
- 中文：使用 jieba.posseg 过滤词性，只保留名词、动词、形容词
- 增加停用词和虚词过滤
- 英文：整体保留短标签（无分隔符且词数≤4），否则使用 yake（top=500）+ 单词拆分，提取所有可能的实词和短语
- 支持从 JSON 工作流中提取文本
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

# ---------- 初始化 yake（top 调至 500，获取更多候选） ----------
yake_extractor = yake.KeywordExtractor(lan="en", n=2, top=500)

# ---------- 辅助函数 ----------
def has_chinese(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def _calc_max_tags(text_len: int) -> int:
    # 此函数仅用于回退方案，主逻辑不再使用
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

    # ---------- 定义分隔符 ----------
    separators = [',', '，', ';', '；']

    # ---------- 检测是否为标签组合 ----------
    # 按逗号或分号拆分
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
            # 标签组合直接返回所有标签（不限制数量）
            tags = []
            seen = set()
            for p in parts:
                if len(p) < 2 or p.isdigit() or p in seen:
                    continue
                seen.add(p)
                tags.append(p)
            logger.info(f"标签组合提取（全部）: {tags}")
            return tags

    # ---------- 自然语言处理 ----------
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
                # 去重（保持顺序）
                seen = set()
                unique = []
                for w in collected:
                    if w not in seen:
                        seen.add(w)
                        unique.append(w)
                logger.info(f"jieba.posseg 提取（名词/动词/形容词，全部）: {unique}")
                return unique
        except Exception as e:
            logger.error(f"jieba.posseg 提取失败: {e}")

    # 英文处理
    else:
        # 检查是否为短标签：无分隔符，词数 <= 4
        if not any(sep in prompt for sep in separators):
            words = prompt.split()
            if len(words) <= 4:
                logger.info(f"英文短标签整体保留: [{prompt}]")
                return [prompt.strip()]

        # 提取所有关键词（短语和单词）
        all_tags = set()

        # 1. yake 提取短语（top 已设为 500）
        try:
            results = yake_extractor.extract_keywords(prompt)
            for kw, score in results:
                kw = kw.strip()
                if len(kw) > 2 and kw not in STOPWORDS:
                    all_tags.add(kw)
        except Exception as e:
            logger.error(f"yake 提取失败: {e}")

        # 2. 拆分所有单词，过滤停用词和短词
        try:
            words = re.findall(r'\b[a-zA-Z]+\b', prompt)
            for w in words:
                w_lower = w.lower()
                if len(w) >= 2 and w_lower not in STOPWORDS:
                    all_tags.add(w)
        except Exception as e:
            logger.error(f"单词拆分提取失败: {e}")

        if all_tags:
            unique_tags = list(all_tags)
            # 按长度和字母顺序排序（可选，但可保持一定顺序）
            unique_tags.sort(key=lambda x: (len(x), x.lower()))
            logger.info(f"英文提取（全部，共 {len(unique_tags)} 个）: {unique_tags}")
            return unique_tags

    # 回退词频统计（可限制数量，防止过度回退时产生过多噪音）
    try:
        words = jieba.lcut(prompt)
        counter = Counter(words)
        filtered = [(w, c) for w, c in counter.items() if len(w) >= 2 and w not in STOPWORDS]
        filtered.sort(key=lambda x: x[1], reverse=True)
        effective_max = _calc_max_tags(len(prompt))
        tags = [w for w, _ in filtered[:effective_max]]
        if tags:
            logger.info(f"词频回退提取（限制 {effective_max} 个）: {tags}")
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
        return extract_tags_from_prompt(json_str)

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

    return extract_tags_from_prompt(full_text)