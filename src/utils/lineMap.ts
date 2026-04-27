/**
 * 将 Markdown 内容映射为段落行号数组（用于编辑器行高亮、全局搜索跳转）。
 * 每个元素是一个"段落"（非空行组）的起始行号（1-indexed）。
 * 代码块作为整体处理，不拆分内部行。
 */
export function computeLineMap(content: string): number[] {
    const lines = content.split("\n");
    const map: number[] = [];
    let i = 0;
    while (i < lines.length) {
        while (i < lines.length && lines[i].trim() === "") i++;
        if (i >= lines.length) break;
        map.push(i + 1);
        const fenceMatch = lines[i].trimStart().match(/^(`{3,}|~{3,})/);
        if (fenceMatch) {
            const fence = fenceMatch[1];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith(fence)) i++;
            if (i < lines.length) i++;
        } else {
            while (i < lines.length && lines[i].trim() !== "") i++;
        }
    }
    return map;
}
