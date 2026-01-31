import os

from PyInstaller.utils.hooks import collect_submodules

hiddenimports = collect_submodules("backend.app")

spec_dir = globals().get("SPECPATH")
if not spec_dir:
    spec_file = globals().get("__file__")
    if spec_file:
        spec_dir = os.path.dirname(os.path.abspath(spec_file))
    else:
        spec_dir = os.getcwd()
repo_root = os.path.abspath(os.path.join(spec_dir, os.pardir))
entrypoint = os.path.abspath(os.path.join(spec_dir, "entrypoint.py"))

a = Analysis(
    [entrypoint],
    pathex=[repo_root],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="viper-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
)
