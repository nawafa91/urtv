#!/usr/bin/env python3
"""Run the launcher's pure-Java digit normalizer without an Android device."""
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class LauncherDigits(unittest.TestCase):
    def test_latin_digits_preserve_arabic_words_and_formatting(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            harness = root / 'DigitsCheck.java'
            harness.write_text(r'''
package sa.urtv.home;
public class DigitsCheck {
    public static void main(String[] args) {
        String[] input = {"0123456789", "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669",
            "\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9",
            "المفضلة · \u0665 من 10", "\u0661\u0662:\u0660\u0665 ص", "20 أكتوبر", null};
        String[] expected = {"0123456789", "0123456789", "0123456789", "المفضلة · 5 من 10", "12:05 ص", "20 أكتوبر", ""};
        for (int i = 0; i < input.length; i++) {
            if (!Digits.latin(input[i]).equals(expected[i])) throw new AssertionError(i);
        }
    }
}
''', encoding='utf-8')
            source = ROOT / 'android/launcher/src/main/java/sa/urtv/home/Digits.java'
            subprocess.run(['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main', '-encoding', 'UTF-8', '-d', tmp, str(source), str(harness)], check=True)
            subprocess.run(['java', '-cp', tmp, 'sa.urtv.home.DigitsCheck'], check=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
