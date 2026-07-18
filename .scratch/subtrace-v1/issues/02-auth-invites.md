# 02 — 认证与邀请制

**What to build:** 用户名+密码（argon2 哈希）+ session cookie 认证。首个注册用户自动成为 ADMIN，此后关闭公开注册；ADMIN 可生成一次性邀请链接，新用户凭邀请 token 注册。登录/登出/注册页面。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 空库时首个注册的用户角色为 ADMIN
- [x] 非空库无邀请 token 无法注册
- [x] 邀请 token 一次性、有过期时间
- [x] 密码 argon2 哈希存储，不明文
- [x] session cookie httpOnly；登出失效
- [x] 未登录访问应用页面跳转登录页

## Answer

Prisma 7 + SQLite（better-sqlite3 适配器，driver adapter 模式）落地：schema（User/Invite/Session）、首次迁移、`prisma.config.ts`（Prisma 7 不再允许 schema 内 url）。
认证服务 `src/lib/auth/service.ts`（仓储缝 9 条测试），Web 层：login/register 页、server actions、受保护 `(app)` 布局、占位 dashboard（含管理员邀请链接生成）。
浏览器冒烟：首用户 ADMIN → 生成邀请 → 登出 → 第二用户凭邀请注册为 USER → 邀请复用被拒 → 未登录跳转登录。
环境坑记录：Prisma 7 需 adapter + `prisma.config.ts` datasource.url；`.env` 的 DATABASE_URL 会被 Next 原样注入运行时，必须用 `file:./data/subtrace.db`（相对仓库根）。
