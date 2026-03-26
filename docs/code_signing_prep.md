# Windows 签名前准备

## 为什么建议签名
- 降低 Windows Defender 和 SmartScreen 的告警概率
- 提高内部工具的可信度
- 方便正式版本归档和追踪

## 需要准备的内容
- 可用的代码签名证书
- 对应私钥或企业签名服务
- Windows `signtool.exe`
- 可用的时间戳服务地址

## 常见签名命令
示例命令如下，实际证书指纹和时间戳服务请替换：

```bat
signtool sign ^
  /fd SHA256 ^
  /tr http://timestamp.digicert.com ^
  /td SHA256 ^
  /sha1 YOUR_CERT_THUMBPRINT ^
  dist\SGCCDownloader.exe
```

## 签名后验证
```bat
signtool verify /pa /v dist\SGCCDownloader.exe
```

## 建议流程
1. 先构建 `exe`
2. 再做签名
3. 验证签名结果
4. 最后生成对外交付 zip 包

## 注意事项
- 不要在签名后再次修改 exe
- 如果重新构建，需重新签名
- 发布记录中建议同时保存版本号、签名时间和签名证书信息
