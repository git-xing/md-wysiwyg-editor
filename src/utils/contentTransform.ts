/**
 * Markdown 内容的纯函数转换工具，供 MarkdownEditorProvider 和单元测试共用。
 * 这些函数不依赖 VSCode API（无 webview.asWebviewUri），可在 Node 环境下直接测试。
 */

/**
 * 从 Markdown 内容中提取 YAML Frontmatter。
 * 仅识别文件开头的标准格式（--- ... ---）。
 */
export function extractFrontmatter(content: string): { frontmatter: string; body: string } {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (match) {
        return { frontmatter: match[0], body: content.slice(match[0].length) };
    }
    return { frontmatter: "", body: content };
}

/**
 * 将 webviewUri 还原为相对路径，并在最前面拼接 frontmatter。
 * 对应 _prepareContentForSave 的纯函数提取版本。
 */
export function restoreContentForSave(
    content: string,
    frontmatter: string,
    uriMap: Map<string, string>,
): string {
    let result = frontmatter ? frontmatter + content : content;
    for (const [webviewUri, relPath] of uriMap) {
        result = result.split(webviewUri).join(relPath);
    }
    return result;
}
