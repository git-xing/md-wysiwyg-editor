// 匹配任意 html 标签 <xxx>、</xxx>、<xxx/>
export function hasHtmlTag(str: string) {
    const reg = /<\/?[a-zA-Z0-9]+(\s+[^>]*?)?\/?>/;
    return reg.test(str);
}
