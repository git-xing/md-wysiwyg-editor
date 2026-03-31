import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const commonOptions = {
    bundle: true,
    minify: isProduction,
    sourcemap: !isProduction,
    logLevel: 'info',
};

// Extension 主进程（Node.js）
const extensionBuild = {
    ...commonOptions,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'], // vscode 模块由 VSCode 运行时注入，不能打包
};

// WebView 前端（Browser）
const webviewBuild = {
    ...commonOptions,
    entryPoints: ['webview/index.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    target: 'es2020',
    format: 'iife', // WebView 中无 ES module 加载器，使用 IIFE
};

if (isWatch) {
    const [ctx1, ctx2] = await Promise.all([
        esbuild.context(extensionBuild),
        esbuild.context(webviewBuild),
    ]);
    await Promise.all([ctx1.watch(), ctx2.watch()]);
    console.log('Watching for changes...');
} else {
    await Promise.all([
        esbuild.build(extensionBuild),
        esbuild.build(webviewBuild),
    ]);
}
