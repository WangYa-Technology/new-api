# Release Branch Process

版本发布只从 `release` 分支进行。`main` 用于持续开发，客服功能等未确认改动不得直接进入发版分支。

## 固定流程

1. 在 `main` 完成开发、代码审查和必要验证。
2. 从 `main` 创建发版 PR，目标分支为 `release`。PR 必须经过审查和 CI，通过后由有权限的维护者手动合并；禁止直接 push 到 `release`：

   ```bash
   gh pr create --base release --head main --title "release: merge main for vX.Y.Z"
   ```

3. 在 `release` 分支验证构建、数据库迁移和关键功能。禁止在 `release` 上直接开发提交；发现问题时回到 `main` 修复，再通过新的 PR 合入。
4. 确认版本号后，在 `release` 当前提交创建并推送签名标签：

   ```bash
   git switch release
   git pull --ff-only origin release
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. GitHub Actions 的 Linux、macOS、Windows、Docker 和 Electron 发布流程会验证标签提交属于远程 `release` 分支历史。验证通过后才构建和发布；从 `main` 或其他分支创建的标签会被拒绝。
6. 发布完成后检查 GitHub Release、Docker 多架构镜像、校验和以及 Electron 构建产物。需要同步到 GitCode 时，使用现有的手动同步工作流并填写已发布的标签。

## 分支规则

- `main`：日常开发和合并目标，不直接触发正式版本发布。
- `release`：只接收已确认的 `main` 合并，用于发布候选验证和正式标签。
- `codex/*`、`feature/*`：功能开发分支，不能直接创建正式发布标签。
- 正式标签必须使用 `vMAJOR.MINOR.PATCH` 格式，并且标签指向 `release` 分支最新确认提交。
- 不重复使用已经发布的标签；版本回滚通过修复提交和新版本号完成。
