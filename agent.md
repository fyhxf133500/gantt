# Agent Notes

## 经验教训：编码问题
- 原因：我用 PowerShell 的 `Set-Content` 默认编码（UTF-16LE）重写了 `GanttChart.tsx`，但 Vite/浏览器按 UTF-8 解析，导致中文显示为乱码。
- 规避：后续凡是用 PowerShell 写入源码文件，必须显式指定 `-Encoding utf8`；或优先使用 WSL 内的 `cat > file` 等方式写入，确保 UTF-8。
- 补充：PowerShell 的 `-Encoding utf8` 在 Windows PowerShell 下会写入 UTF-8 BOM，部分构建/热更新链路会出现“模块不提供导出”的报错；写源码尽量用 WSL 写入或写完去除 BOM。
- 校验：若出现中文乱码或导出异常，优先检查文件编码与 BOM；必要时重新以 UTF-8 无 BOM 方式写回。

## 经验教训：Get-Content 误读 UTF-8 无 BOM
- 原因：在 Windows PowerShell 中用 `Get-Content -Raw` 读取 UTF-8 无 BOM 文件时，会按默认编码（通常是 ANSI）解码，导致中文变成乱码；再写回时就把乱码永久保存，触发语法错误（如字符串引号被破坏）。
- 规避：避免用 `Get-Content` 直接读写含中文的 UTF-8 无 BOM 文件；改用 `[System.IO.File]::ReadAllText(path, utf8)` / `WriteAllText`，或在 WSL 里编辑。
- 校验：修改后若出现“Unexpected token”之类解析错误，优先检查源码中中文字符串是否被破坏。