import { defineConfig, type Plugin } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import fs from "fs";
import path from "path";

/**
 * 修复 @tdesign/uniapp 组件样式在 dev 下失效（白底黑字）的问题。
 *
 * 症状：组件样式规则被编译成空作用域选择器 `.t-cell[data-v-]`，永不命中，t-cell/t-tag/t-button
 * 全部退回浏览器默认外观。
 * 成因：TDesign 组件 SFC 的样式块写作 `<style scoped src="./cell.css">`。@vitejs/plugin-vue
 * 把这类样式请求生成为 `cell.css?vue&type=style&index=0&src=<scopeId>&scoped=<scopeId>`，
 * 并把「样式文件 → 描述符」登记进模块级 cache（linkSrcToDescriptor/setSrcDescriptor）。当该请求
 * 早于宿主 .vue 被转译（例如页面重载/HMR 打乱顺序）时，cache 命中失败，plugin-vue 退化为
 * getTempSrcDescriptor（`id: query.id || ''`，见 @vitejs/plugin-vue/dist/index.mjs:130）→
 * 编译出 `[data-v-]`；该结果随后被 vite 模块图缓存，进程内一直返回，重启 dev server 才恢复。
 *
 * 该请求 URL 上的 `scoped`/`src` 参数本身携带的就是正确的 scope id（= 宿主 .vue 的 descriptor.id），
 * 命中与未命中唯一的差别就是它，故此处据 URL 把空 id 补回。构建/命中路径不受影响（它们本就不含 `[data-v-]`）。
 */
function restoreVueSrcScopeId(): Plugin {
  const EMPTY_SCOPE = "[data-v-]";
  return {
    name: "jiazu:restore-vue-src-scope-id",
    enforce: "post",
    transform(code, id) {
      if (!id.includes("vue&type=style") || !code.includes(EMPTY_SCOPE)) return null;
      const match = /[?&]scoped=([0-9a-f]{6,})/.exec(id);
      if (!match) return null;
      return { code: code.split(EMPTY_SCOPE).join(`[data-v-${match[1]}]`), map: null };
    },
  };
}

/**
 * 小程序主包瘦身（2026-10-14 · 主包 2,129,629 B > 2 MiB 上限 32,477 B）。
 *
 * 处置口径：**只对 mp-weixin 产物做「真按需」裁剪**，H5 产物与源码落点一律不动。
 * 两处：
 *
 * ① 主包静态死重（20,476 B）：`src/static/**` 被 uni-app 的 `uni:copy` 插件**原样整目录拷贝**
 *    进小程序产物（不做引用分析），但其中 5 个文件在**小程序产物内零引用**：
 *      · static/icons/favicon.svg / favicon-32.png / favicon-180.png（H5 `index.html` head 三条
 *        `link` 专用；小程序无浏览器 chrome，不存在 favicon 概念）——**源码落点保持
 *        `frontend/src/static/icons/` 不变**（`docs/seo.spec.md` §7 H 登记项），故不搬家、只不随
 *        小程序发布；
 *      · static/tree-meta.json / tree-api.json（陈旧数据；tree-api.json 全仓零引用，
 *        tree-meta.json 仅被 `business/api.ts` 的 `fetchTreeMeta()` 引用，而该函数**全仓无调用点**
 *        且已在小程序构建中被 tree-shaking 掉 —— 实测产物内无 `static/tree-meta.json` 字符串）。
 *    删除前**逐个复核**：在产物全文里搜不到该文件名才删，否则跳过并打日志（防日后新增引用被误删）。
 *
 * ② TDesign 图标样式按需（icon.wxss 145,106 B → 约 2 KB）：`@tdesign/uniapp/dist/icon/icon.css`
 *    把 **2354 个**图标的 `.t-icon-<name>:before{content:"\eXXX"}` 类规则全量打包，而本项目
 *    实际会渲染的图标只有十来个（组件内部固定值，见白名单）。此处按白名单**逐条**过滤，
 *    `@font-face` 与 `.t-icon` / `.t-icon-base` / `.t-icon--image` / `.t-icon__image` 基础规则原样保留。
 */
const TD_ICON_KEEP = [
  // —— 由 @tdesign/uniapp 组件源码实测得出（本项目用到 t-button / t-input / t-cell / t-cell-group /
  //    t-tag / t-radio / t-radio-group / t-loading / t-dropdown-menu / t-dropdown-item）——
  "close", // popup 关闭键 / tag closable 默认 / image 失败态默认
  "close-circle-filled", // input clearable 默认（calcIcon(v,'close-circle-filled')）
  "check", // checkbox `icon="line"` / radio `icon="line"` 勾选态
  "check-circle-filled", // radio 默认 icon="circle" 勾选态
  "check-rectangle-filled", // checkbox 默认 icon="circle"/"rectangle" 勾选态（'check-'+icon+'-filled'）
  "minus-circle-filled", // checkbox 半选态（'minus-'+icon+'-filled'）
  "minus-rectangle-filled",
  "minus-line-filled",
  "chevron-right", // cell arrow 默认右箭头
  "caret-down-small", // dropdown-menu arrowIcon 默认
  // —— 防御性保留（同为上述组件的可配默认值/常见动态取值，单条规则约 60 B）——
  "chevron-down",
  "chevron-up",
  "chevron-left",
  "check-circle",
  "close-circle",
  "loading",
];

function mainPackageSlimPlugin(): Plugin {
  let outDir = "";
  return {
    name: "jiapu:main-package-slim",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      // 平台护栏：只处理小程序产物；H5 产物（dist/build/h5）绝不动
      if (!/[\\/]mp-weixin([\\/]|$)/.test(outDir) || !fs.existsSync(outDir)) return;

      // ---------- ① 主包静态死重 ----------
      const deadStatic = [
        "static/icons/favicon.svg",
        "static/icons/favicon-32.png",
        "static/icons/favicon-180.png",
        "static/tree-meta.json",
        "static/tree-api.json",
      ];
      // 产物全文（排除待删文件自身）拼一份引用文本，逐个复核「零引用」后才删
      const texts: string[] = [];
      const walk = (dir: string) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(p);
          else if (/\.(js|json|wxml|wxss|wxs)$/.test(ent.name)) {
            try {
              texts.push(fs.readFileSync(p, "utf8"));
            } catch {
              /* 忽略不可读文件 */
            }
          }
        }
      };
      walk(outDir);
      const removed: string[] = [];
      const skipped: string[] = [];
      let deadBytes = 0;
      for (const rel of deadStatic) {
        const abs = path.join(outDir, rel);
        if (!fs.existsSync(abs)) continue;
        const base = path.basename(rel);
        const isReferenced = texts.some((t) => t.includes(base));
        if (isReferenced) {
          skipped.push(rel);
          continue;
        }
        deadBytes += fs.statSync(abs).size;
        fs.unlinkSync(abs);
        removed.push(rel);
      }
      console.log(
        `[main-package-slim] ① 移出主包静态死重 ${removed.length} 个` +
          (removed.length ? `（已删）: ${removed.join(", ")}` : "") +
          (skipped.length ? `；跳过（产物内仍有引用）: ${skipped.join(", ")}` : ""),
      );

      // ---------- ② TDesign 图标样式按需 ----------
      const iconWxss = path.join(outDir, "node-modules/@tdesign/uniapp/dist/icon/icon.wxss");
      let iconBefore = 0;
      let iconAfter = 0;
      if (fs.existsSync(iconWxss)) {
        const css = fs.readFileSync(iconWxss, "utf8");
        iconBefore = Buffer.byteLength(css);
        // 只匹配「纯图标名」规则：`.t-icon-<name>[.scope]:before{...}`；
        // 基础规则 `.t-icon` / `.t-icon-base` / `.t-icon--image` / `.t-icon__image` / `@font-face` 不会命中
        const keep = new Set(TD_ICON_KEEP);
        let total = 0;
        let kept = 0;
        const out = css.replace(
          /\.t-icon-([a-z0-9][a-z0-9-]*)(?:\.[^{},]+)?:before\{[^{}]*\}/g,
          (rule, name) => {
            total += 1;
            if (keep.has(name)) {
              kept += 1;
              return rule;
            }
            return "";
          },
        );
        // 防御：若规则结构与预期不符（匹配数异常偏小），放弃裁剪，避免误删
        if (total > 1000) {
          fs.writeFileSync(iconWxss, out);
          iconAfter = Buffer.byteLength(out);
          console.log(
            `[main-package-slim] ② icon.wxss 按需: ${iconBefore} B → ${iconAfter} B ` +
              `(图标规则 ${kept}/${total} 条保留，白名单 ${TD_ICON_KEEP.length} 个)`,
          );
        } else {
          iconAfter = iconBefore;
          console.log(
            `[main-package-slim] ② icon.wxss 结构不符合预期（匹配 ${total} 条），已放弃裁剪`,
          );
        }
      }
      console.log(
        `[main-package-slim] 合计减重 ${deadBytes + (iconBefore - iconAfter)} B ` +
          `(静态 ${deadBytes} B + 图标样式 ${iconBefore - iconAfter} B)`,
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  // 部署基路径：默认 '/'（本地 dev 不受影响），部署到子路径时用 H5_BASE 覆盖，
  // 例：H5_BASE=/jiazu/ npm run build:h5（同时驱动产物资源前缀与 uni 运行时 router.base）
  base: process.env.H5_BASE || '/',
  plugins: [uni(), restoreVueSrcScopeId(), mainPackageSlimPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@business": path.resolve(__dirname, "src/business"),
    },
  },
  server: {
    // 浏览器访问端口：默认 5199（可用 PORT 覆盖，如 PORT=5201 npm run dev:h5）
    port: Number(process.env.PORT) || 5199,
    proxy: {
      "/api": {
        // 默认指向自有数据层 compat-api（树 JSON + 详情文档，读写同源）；
        // 本地：COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js 3100
        // 指向其他后端时用 API_PROXY 覆盖（legacy Gramps 链路 5197/5198 已于 2026-09-19 退役）
        target: process.env.API_PROXY || "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
});
