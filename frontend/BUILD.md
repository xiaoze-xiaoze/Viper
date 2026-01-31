# Frontend 构建（Windows）

安装依赖
```powershell
Set-Location C:\code\Viper\frontend
npm ci
```

检查
```powershell
Set-Location C:\code\Viper\frontend
npm run lint
```

构建
```powershell
Set-Location C:\code\Viper\frontend
npm run build
```

本地预览
```powershell
Set-Location C:\code\Viper\frontend
npm run preview -- --host 127.0.0.1 --port 5173
```
