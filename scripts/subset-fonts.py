from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
HAND_SOURCE = ROOT / "raw-fonts" / "ZCOOLXiaoWei-Regular.ttf"
SYMBOL_SOURCE = ROOT / "raw-fonts" / "Yozai-Medium.ttf"
HAND_OUTPUT = ROOT / "public" / "fonts" / "manman-hand.woff2"
SYMBOL_OUTPUT = ROOT / "public" / "fonts" / "manman-symbols.woff2"

REQUIRED = set(
    "，。、；：！？\"\"''（）【】「」——…～¥"
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    " "
)


def is_han(character: str) -> bool:
    codepoint = ord(character)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
    )


def write_subset(source: Path, output: Path, characters: set[str]) -> None:
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=sorted(ord(character) for character in characters))
    subsetter.subset(font)
    subset.save_font(font, str(output), options)


def main() -> None:
    source_files = sorted([*SRC.rglob("*.ts"), *SRC.rglob("*.tsx")])
    source_text = "".join(path.read_text(encoding="utf-8") for path in source_files)
    han_characters = {character for character in source_text if is_han(character)}
    source_non_ascii = {
        character
        for character in source_text
        if ord(character) > 127 and not character.isspace()
    }
    requested = han_characters | REQUIRED | source_non_ascii

    hand_cmap = TTFont(HAND_SOURCE).getBestCmap()
    hand_characters = {character for character in requested if ord(character) in hand_cmap}
    symbol_characters = requested - hand_characters
    symbol_cmap = TTFont(SYMBOL_SOURCE).getBestCmap()
    unsupported = {character for character in symbol_characters if ord(character) not in symbol_cmap}
    if unsupported:
        raise RuntimeError(f"原始字体仍缺少字符:{''.join(sorted(unsupported))}")

    write_subset(HAND_SOURCE, HAND_OUTPUT, hand_characters)
    write_subset(SYMBOL_SOURCE, SYMBOL_OUTPUT, symbol_characters)

    generated_hand = TTFont(HAND_OUTPUT).getBestCmap()
    generated_symbols = TTFont(SYMBOL_OUTPUT).getBestCmap()
    missing = {
        character
        for character in requested
        if ord(character) not in generated_hand and ord(character) not in generated_symbols
    }
    if missing:
        raise RuntimeError(f"生成后的字体仍缺少字符:{''.join(sorted(missing))}")

    print(f"扫描文件:{len(source_files)}")
    print(f"源码汉字:{len(han_characters)}")
    print(f"指定标点、数字、英文字母:{len(REQUIRED)}")
    print(f"去重后总字符:{len(requested)}")
    print(f"ZCOOL XiaoWei 主字体:{len(generated_hand)}")
    print(f"补充符号字体:{len(generated_symbols)}")
    print(f"缺失字符:{len(missing)}")
    print(f"回字覆盖:{'是' if ord('回') in generated_hand else '否'}")


if __name__ == "__main__":
    main()
