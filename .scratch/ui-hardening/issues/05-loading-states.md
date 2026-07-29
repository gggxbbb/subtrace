# 05 — loading 态

**What to build:** `(app)/loading.tsx` 全局 loading（TE 风格：黑描边面板 + 脉冲 LED 或骨架条），子路由共享；高频深页（subscriptions/[id]、reports、purchases/[id]）按需补局部 loading.tsx。仅新增，不改任何现有渲染。

**Blocked by:** None

**Status:** resolved

- [x] (app)/loading.tsx 生效：导航切换时不再白屏
- [x] 风格与 TE 面板一致（无 emoji，黑描边）
- [x] 全套件绿

## Answer

`src/app/(app)/loading.tsx`：黑描边白面板 + 脉冲 LED +「加载中」，路由组级生效，全部子路由共享（深页不另设局部 loading——组级已覆盖，遵循 YAGNI）。194 测试全绿，tsc 净。
