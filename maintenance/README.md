# 公开发布版本维护

修复基于公开提交 `0afa34f`。这里只维护已公开发送到浏览器的代码，不包含教师私有工程、完整课件、评分文件或额外教学材料。`release-support.js` 放置可单独测试的存储校验、CSV 来源处理与参数约束；压缩发布文件仅修改对应调用点及图片加载逻辑。[bundle-changes.md](bundle-changes.md) 提供逐项修改前后对照，便于维护者同步回原始开发工程。

## 修复内容与复现方法

| 问题 | 原版复现 | 修复行为 |
| --- | --- | --- |
| 学习进度类型异常导致整页初始化中断 | 将 `newton-progress` 设为 JSON `null` 后刷新 | 只恢复已知布尔标记，异常内容回退为空进度 |
| 数据记录中的空行对象导致初始化中断 | 将 `newton-data` 设为 `{"rows":[null,{"k":5,"xL":1,"xR":3}]}` 后刷新 | 损坏行保留为空行，其他有效读数保留；来源字段按类型恢复 |
| 清空不确定度后刷新，静默恢复默认值 | 模拟数据中清空误差限，刷新 | 保持无效输入及错误提示，避免凭空更改实验参数 |
| CSV 丢失影像/模拟来源与计算配置 | 影像送入数据处理 → 导出 CSV → 导入 | CSV 保存来源、标定、波长与计算配置；影像不确定度仍需单独评定 |
| 手机数据页横向溢出 | 390px 视口打开已载入的数据页 | 给表格滚动容器建立定位上下文，约束隐藏表头；保留表内横向滚动 |
| 图像参数突破 HTML 上限 | 输入平滑尺度 11、环间距 101 后识别 | 计算前按界面上限限制并同步显示，避免过大卷积核 |
| 无效小图的 Blob URL 未释放 | 上传 1×1 PNG | 在成功、拒绝、失败、过期加载路径均释放 URL；允许再次选择同一文件 |
| 先选的慢图覆盖后选图片 | 先选慢解码图，随后选另一张图 | 仅最新选择可以提交图像状态；缩放后画布维度至少为 2 |

已有正常数据和教学计算公式保持兼容。没有来源信息的旧版 CSV 无法推断原始测量方式，导入时会显示提示。CSV 新增来源列不应删除或混用不同实验参数；不完整或不一致的元数据将明确报错。

## 本地验证

需要 Node.js 20 或更新版本。浏览器测试使用独立临时配置、临时本地 HTTP 端口，图片与读数均在本地处理；不会使用个人浏览器资料。

```sh
npm ci
npx playwright install chromium
npm test
```

也可使用已安装的 Edge（PowerShell）：

```powershell
$env:BROWSER_CHANNEL = 'msedge'
npm test
```

`npm run test:unit` 仅运行纯函数测试。`npm run test:browser` 检查七个模块、完整单向测量、反向操作恢复、CSV 往返、PNG/SVG 下载、图片加载、存储恢复、测验、离线打开，以及 320/390/768/1440px 布局。

截图和下载验证文件输出到已忽略的 `test-results/`。截图关闭过渡动画后采集，避免把淡入中间帧误认为最终页面。

对照原始发布版本复现（PowerShell）：

```powershell
$env:BROWSER_CHANNEL = 'msedge'
$env:BASELINE_REF = '0afa34f'
node --test --test-name-pattern='null or wrongly|damaged saved|blank uncertainty|synthetic CSV|image CSV|image parameter|small image|latest image|all views' tests/browser.test.cjs
Remove-Item Env:BASELINE_REF
```

以上对照用例在原始版本中预期失败；移除 `BASELINE_REF` 后测试当前文件。这里的本地测试结果不等同于 GitHub Actions 或原站部署结果。
