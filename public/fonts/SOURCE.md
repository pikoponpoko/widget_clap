# PDF用の日本語フォント

元フォント: Noto Sans JP / Google Fonts
https://github.com/google/fonts/tree/main/ofl/notosansjp

`NotoSansJP[wght].ttf` のwght=400をfontToolsで静的TrueType化しています。
SIL Open Font License 1.1: LICENSE.txt
Reserved Font Name 'Source' は使用していません。

再生成（元フォントを取得した後）：

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont('NotoSansJP[wght].ttf')
font = instantiateVariableFont(font, {'wght': 400}, inplace=True)
font.save('NotoSansJP-Regular.ttf')
```

PDF出力時は全文字を埋め込みます。fontkitのサブセット出力で日本語グリフが欠けるため、互換性を優先しています。
