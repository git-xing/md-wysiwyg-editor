// refractor exports map: "./*" → "./lang/*.js"，所以导入路径不带 "lang/"
import { refractor } from "refractor/core";
import bash from "refractor/bash";
import c from "refractor/c";
import cpp from "refractor/cpp";
import csharp from "refractor/csharp";
import css from "refractor/css";
import go from "refractor/go";
import markup from "refractor/markup"; // html
import java from "refractor/java";
import javascript from "refractor/javascript";
import json from "refractor/json";
import markdown from "refractor/markdown";
import php from "refractor/php";
import python from "refractor/python";
import ruby from "refractor/ruby";
import rust from "refractor/rust";
import sql from "refractor/sql";
import swift from "refractor/swift";
import typescript from "refractor/typescript";
import yaml from "refractor/yaml";

[
    bash, c, cpp, csharp, css, go, markup, java, javascript,
    json, markdown, php, python, ruby, rust, sql, swift, typescript, yaml,
].forEach((lang) => refractor.register(lang));

// ── 自定义 Mermaid 语法高亮 ─────────────────────────────────
if (!refractor.registered('mermaid')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mermaidSyntax: any = function (Prism: any) {
        Prism.languages['mermaid'] = {
            comment: { pattern: /%%[^\r\n]*/, greedy: true },
            string:  { pattern: /"[^"]*"/, greedy: true },
            label:   { pattern: /\|[^|]*\|/, greedy: true },
            bracket: { pattern: /\[(?:[^\[\]]|\[[^\[\]]*\])*\]|\{[^{}]*\}|\([^()]*\)|\(\([^()]*\)\)/, greedy: true },
            keyword: /\b(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|gantt|pie|showData|mindmap|timeline|gitGraph|quadrantChart|xychart-beta|sankey-beta|block-beta|architecture-beta|LR|RL|TD|TB|BT|subgraph|end|participant|actor|Note|note|over|loop|opt|alt|else|critical|break|par|and|rect|activate|deactivate|title|section|class|state|direction|as|autonumber|link|style|classDef|fill|stroke|color)\b/i,
            arrow:   /(?:-->|-->>|->>|--[ox*]|<-->|<-->>|<<-->|o--o|\*--\*|\.->|==>|==|--)/,
            number:  /\b\d+(?:\.\d+)?\b/,
            punctuation: /[[\]{}()]/,
        };
    };
    mermaidSyntax.displayName = 'mermaid';
    mermaidSyntax.aliases = [];
    refractor.register(mermaidSyntax);
}

// ── HAST → HTML 字符串（仅处理 token span，无需 hast-util-to-html）──
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hastToHtml(node: any): string {
    if (node.type === 'text') return escapeHtml(node.value as string);
    if (node.type === 'element') {
        const cls = (node.properties?.className as string[] | undefined)?.join(' ') || '';
        const inner = (node.children as any[])?.map(hastToHtml).join('') ?? '';
        return cls ? `<span class="${cls}">${inner}</span>` : inner;
    }
    if (node.type === 'root') return (node.children as any[])?.map(hastToHtml).join('') ?? '';
    return '';
}

/**
 * 用 refractor 对代码进行语法高亮，返回带 token span 的 HTML 字符串。
 * 若语言不支持或高亮失败，返回 HTML 转义后的纯文本。
 */
export function highlight(code: string, lang: string): string {
    if (!lang || !refractor.registered(lang)) return escapeHtml(code);
    try {
        const tree = refractor.highlight(code, lang);
        return hastToHtml(tree);
    } catch {
        return escapeHtml(code);
    }
}

export { refractor };
