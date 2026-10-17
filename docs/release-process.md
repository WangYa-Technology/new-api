# Release Branch Process

本项目采用 `dev`、`main`、`release` 三层分支。客服功能目前只在 `feature/support` 独立开发，不进入 `dev`、`main` 或 `release`。

## 分支职责

- `dev`：日常开发和功能集成分支。
- `main`：已确认、可随时发布的稳定代码。
- `release`：从 `main` 手动推广的发布分支，只用于发布验证、版本标签和线上 hotfix。
- `feature/*`：较大功能的独立开发分支，例如 `feature/support`。
- `hotfix/*`：从 `release` 或线上版本拉出的紧急修复分支。

## 日常开发

1. 小改动可以直接提交到 `dev`。
2. 较大功能从 `dev` 创建 `feature/*` 分支，完成后合回 `dev`。
3. 客服功能保持在 `feature/support`，完成前不合回 `dev`，也不创建指向 `main` 的客服 PR。
4. 功能分支合并完成后删除对应的本地和远程分支。

单人开发不强制要求额外审批。提交或合并前仍应通过已有的 Backend 和 Frontend CI 检查；管理员可根据实际情况直接推进，避免重复创建没有必要的 PR。

## 合并到 main

确认 `dev` 上的内容可以进入稳定版本后，再将 `dev` 合并到 `main`。可以使用 PR，也可以由仓库管理员按当前保护规则完成受控合并。合并前应确认：

- 不包含客服开发分支的改动；
- Backend 和 Frontend CI 已通过；
- 没有未解决的回归问题。

## 发布版本

发布时由 `main` 手动推广到 `release`，不从 `dev`、`feature/*` 或工作区未提交内容创建发布版本：

```bash
git fetch origin
git switch release
git pull --ff-only origin release
git merge --no-ff origin/main -m "hcai(release): promote main to release"
git push origin release
```

确认 `release` 构建和关键功能正常后，在 `release` 当前提交创建并推送版本标签：

```bash
git switch release
git pull --ff-only origin release
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

GitHub Actions 在版本标签上执行构建和发布。发布产物应来自同一个标签提交；发布完成后检查 GitHub Release、各平台构建产物和校验和。

## 非 Docker 服务器发布

生产服务器使用 Linux 原生二进制和 `systemd`，不在服务器上重新编译，也不通过 `git pull` 部署。发布工作流负责一次性构建前端和 Go 二进制，然后通过 SSH/SCP 分发：

1. 构建 `web/dist` 并编译目标平台二进制。
2. 生成 SHA256 校验文件。
3. 备份服务器上的旧程序、环境配置和数据库。
4. 上传并校验新二进制，替换 `/opt/newapi/new-api`。
5. 重启 `new-api` systemd 服务。
6. 检查 `/api/status` 和版本号。
7. 健康检查失败时恢复备份并重启旧版本。

多台服务器按批次或顺序发布，上一台健康检查通过后再继续下一台。数据库迁移只执行一次，并保持新旧版本短暂共存时的兼容性。

## Hotfix

线上问题从 `release` 或对应版本标签创建 `hotfix/*` 分支。修复通过必要的 CI 检查后，同时合回 `main` 和 `release`，然后在 `release` 创建新的 patch 标签，例如 `v1.0.1`。

## 分支保护和清理

`main` 和 `release` 保留 Backend、Frontend CI 检查，禁止强制推送和删除分支。单人开发不要求他人审批，也不要求必须解决全部 PR 对话；管理员可在确认风险后直接完成受控操作。

功能分支和 hotfix 分支合并或废弃后及时删除，`feature/support` 在客服功能完成前保留为长期专用开发分支。
