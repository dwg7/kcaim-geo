#!/usr/bin/env python3
"""旧名(kcaim)。check_miso.py に転送する薄いラッパー。"""
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).with_name('check_miso.py')), run_name='__main__')
