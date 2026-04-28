/**
 * GitHub 兼容的 slugify 函数。
 *
 * 规则：
 * 1. 转小写
 * 2. 去除 Unicode 标点、符号、emoji（仅保留字母、数字、连字符、下划线、空格）
 * 3. 空格替换为连字符（不合并多个连字符，不去除首尾连字符）
 *
 * 示例：
 *   "H2 二级标题示例"   → "h2-二级标题示例"
 *   "🚀 Emoji 标题"    → "-emoji-标题"
 *   "含特殊字符 : 和 &" → "含特殊字符--和-"
 *   "重复标题"          → "重复标题"  （调用方负责去重后缀）
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        // 去除所有非字母、非数字、非连字符、非下划线、非空格字符
        // \p{L} 匹配所有 Unicode 字母（含 CJK），\p{N} 匹配 Unicode 数字
        // 这会自动去除 emoji、标点符号等
        .replace(/[^\p{L}\p{N}_\- ]/gu, "")
        // 空格 → 连字符（保留重复，以复现 "含特殊字符--和-" 等场景）
        .replace(/ /g, "-");
}
