---
name: Bug 报告
description: 发现了一个 Bug，来报告吧
title: "[Bug] <页面/组件>：<简短描述>"
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        > [!NOTE]
        > 提 Issue 前请确认：不是重复提交、已经拉了最新代码（`git pull origin main`）
  - type: textarea
    id: description
    attributes:
      label: Bug 描述
      description: 发生了什么问题？
      placeholder: 清楚地描述你遇到的 bug
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: 复现步骤
      description: 怎么触发这个 bug？
      placeholder: |
        1. 打开页面...
        2. 点击...
        3. 看到错误
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: 期望行为
      description: 原本期待发生什么？
      placeholder: 应该看到...
  - type: textarea
    id: screenshot
    attributes:
      label: 截图（可选）
      description: 有截图的话拖拽上传
  - type: input
    id: browser
    attributes:
      label: 浏览器 / 设备
      description: 用的什么浏览器？什么设备？
      placeholder: 如 Chrome 120 / iPhone 15
  - type: dropdown
    id: group
    attributes:
      label: 涉及小组
      description: 这个问题最可能和哪个组的工作相关？
      options:
        - 未知 / 不确定
        - ① 地图美工
        - ② 交互功能
        - ③ 平台搭建
        - ④ 数据收集
        - ⑤ 智能体
        - ⑥ 数据转换
    validations:
      required: true
