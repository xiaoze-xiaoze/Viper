# Backend 打包（Windows）

安装依赖
```powershell
conda activate viper
```

打包
```
pyinstaller -y backend/pyinstaller.spec --distpath backend/dist --workpath backend/build/pyinstaller
```

测试
```
# windows
./backend/dist/viper-backend.exe --host 127.0.0.1 --port 8000

# linux
./backend/dist/viper-backend --host 127.0.0.1 --port 8000
```
