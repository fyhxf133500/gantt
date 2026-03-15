import codecs
from pathlib import Path

root = Path('src')
exts = {'.ts', '.tsx', '.css', '.js', '.jsx', '.json', '.html'}

def decode_bytes(data: bytes) -> str:
    if data.startswith(codecs.BOM_UTF8):
        return data.decode('utf-8-sig')
    if data.startswith(codecs.BOM_UTF16_LE):
        return data.decode('utf-16-le')
    if data.startswith(codecs.BOM_UTF16_BE):
        return data.decode('utf-16-be')
    try:
        return data.decode('utf-8')
    except UnicodeDecodeError:
        try:
            return data.decode('utf-16-le')
        except UnicodeDecodeError:
            return data.decode('latin1')

count = 0
for path in root.rglob('*'):
    if path.is_file() and path.suffix in exts:
        data = path.read_bytes()
        text = decode_bytes(data)
        path.write_text(text, encoding='utf-8', newline='\n')
        count += 1

print(f"rewrote {count} files to utf-8")
