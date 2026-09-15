# Fantasy3D 资产商店

本地桌面演示程序，可浏览示例商品、在后台上下架、创建模拟订单、查看订单、下载示例 TXT。不会扣款或收款。没有可交付文件和商用许可证明的条目始终是草稿，不能公开出售或进入推广流程。

## 启动

安装后双击桌面 **Fantasy3D 资产商店**。程序在独立窗口内自动启动本地服务，关闭窗口时服务随程序退出。无需另外安装 Node，无黑色命令窗口。端口自动选择，不与已有 4000 端口服务冲突。

店铺内容保留英文导航；页面顶部有中文提示说明本地模拟状态。

## 使用

1. **Asset Store** 浏览示例商品，点击商品查看介绍。
2. **Admin Panel** 切换 Published / Draft；只影响这台电脑上的示例商品。
3. **Demo Checkout** 填写测试邮箱，生成模拟订单，不需要付款。
4. **Orders** 按邮箱查看本地模拟订单；下载为说明用途的 TXT，不是模型 ZIP。

本地 JSON 持久保存商品状态和模拟订单。Electron 数据目录下的 `store-data/store.json` 存放数据，安装包内不含测试订单。订单邮箱仅保存在本机，没有发送邮件。管理页面只用于本地操作，不具备线上店铺所需的客户身份验证。

## 开发和打包

源码包括 server.js、electron-main.js、frontend 和 tests。需 Node.js 22.12+ 与 npm（或 pnpm）。

```text
npm install
npm test
npm run electron
npm run build
```

安装包输出：`dist/Fantasy3D-Store-Setup-1.0.0.exe`。

锁定的 pnpm 依赖位于 pnpm-lock.yaml；使用 pnpm 时先执行 `pnpm install` 并允许官方 Electron 安装脚本（下载运行内核）。

## 与原始粘贴代码的区别

- 服务在 Electron 主进程内启动，避免安装后找不到外部 node。
- 等待服务监听成功后加载窗口，取消固定 2.2 秒延时。
- 仅监听 127.0.0.1，拒绝外站请求；窗口不加载外部网页。
- 模拟订单使用 simulated 状态，页面明确无真实支付。
- 商品状态与模拟订单落盘，重启后保留；错误时显示提示。
- 隐藏草稿商品，校验邮箱和上下架状态，演示下载须对应存在的订单。

真实经营仍需要真实且有权销售的资产包、支付服务商对接、客户身份与订单权限校验、对外部署等；当前安装包仅交付本地演示流程。

## Render 发布

仓库根目录提供 `render.yaml`。Render 服务的构建命令为 `npm ci`，启动命令为 `npm start`，并监听平台提供的 `PORT`。发布后先检查 `/api/app-info` 与 `/api/store/tasks`：两者均返回 JSON 后，办公区才会显示可核查的任务、推广草稿和会议记录。
