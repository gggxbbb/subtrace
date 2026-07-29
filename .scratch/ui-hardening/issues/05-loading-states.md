# 05 — loading 态

**What to build:** `(app)/loading.tsx` 全局 loading（TE 风格：黑描边面板 + 脉冲 LED 或骨架条），子路由共享；高频深页（subscriptions/[id]、reports、purchases/[id]）按需补局部 loading.tsx。仅新增，不改任何现有渲染。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] (app)/loading.tsx 生效：导航切换时不再白屏
- [ ] 风格与 TE 面板一致（无 emoji，黑描边）
- [ ] 全套件绿
