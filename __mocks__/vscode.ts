/**
 * VSCode API 最小可用 mock，供 Vitest 单元测试使用。
 * 通过 vitest.config.ts 的 resolve.alias 将 "vscode" 重定向到此文件。
 */
import * as nodePath from "path";
import { vi } from "vitest";

function makeUri(fsPath: string, scheme = "file") {
    return {
        fsPath,
        scheme,
        path: fsPath,
        toString: () => (scheme === "file" ? `file://${fsPath}` : `${scheme}://${fsPath}`),
    };
}

export const Uri = {
    file: (p: string) => makeUri(p, "file"),
    joinPath: (base: { fsPath: string; scheme?: string }, ...parts: string[]) =>
        makeUri(nodePath.join(base.fsPath, ...parts), base.scheme ?? "file"),
    parse: (s: string) => {
        if (s.startsWith("file://")) return makeUri(decodeURIComponent(s.slice(7)), "file");
        return { fsPath: s, scheme: "unknown", path: s, toString: () => s };
    },
};

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 } as const;

export const workspace = {
    fs: {
        readFile: vi.fn<() => Promise<Uint8Array>>(),
        writeFile: vi.fn<() => Promise<void>>(),
        readDirectory: vi.fn<() => Promise<[string, number][]>>(),
        stat: vi.fn<() => Promise<{ type: number }>>(),
        createDirectory: vi.fn<() => Promise<void>>(),
        delete: vi.fn<() => Promise<void>>(),
    },
    getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    })),
    getWorkspaceFolder: vi.fn(() => undefined as undefined | { uri: ReturnType<typeof makeUri> }),
    workspaceFolders: undefined as undefined | Array<{ uri: ReturnType<typeof makeUri> }>,
};

export const window = {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
};

export const commands = {
    executeCommand: vi.fn(),
};

export const EventEmitter = vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
}));

export const l10n = {
    t: vi.fn((msg: string, ...args: unknown[]) =>
        args.reduce<string>((s, arg, i) => s.replace(`{${i}}`, String(arg)), msg)
    ),
};

export const CancellationTokenSource = vi.fn(() => ({
    token: { isCancellationRequested: false, onCancellationRequested: vi.fn() },
    cancel: vi.fn(),
    dispose: vi.fn(),
}));
