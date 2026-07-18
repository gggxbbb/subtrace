# 02 — 认证与邀请制

**What to build:** 用户名+密码（argon2 哈希）+ session cookie 认证。首个注册用户自动成为 ADMIN，此后关闭公开注册；ADMIN 可生成一次性邀请链接，新用户凭邀请 token 注册。登录/登出/注册页面。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 空库时首个注册的用户角色为 ADMIN
- [ ] 非空库无邀请 token 无法注册
- [ ] 邀请 token 一次性、有过期时间
- [ ] 密码 argon2 哈希存储，不明文
- [ ] session cookie httpOnly；登出失效
- [ ] 未登录访问应用页面跳转登录页
