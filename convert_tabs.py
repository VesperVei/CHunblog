#!/usr/bin/env python3
"""
Convert leading tabs to 2 spaces in source files recursively.
"""

import os
import sys


def process_file(filepath):
    """Process a single file, converting leading tabs to 2 spaces."""
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    modified = False
    new_lines = []

    for line in lines:
        # Count leading tabs
        leading_tabs = 0
        for char in line:
            if char == "\t":
                leading_tabs += 1
            else:
                break

        if leading_tabs > 0:
            # Replace leading tabs with 2 spaces each
            new_line = "  " * leading_tabs + line[leading_tabs:]
            new_lines.append(new_line)
            modified = True
        else:
            new_lines.append(line)

    if modified:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        print(f"Modified: {filepath}")


def main():
    root_dir = sys.argv[1] if len(sys.argv) > 1 else "."

    # File extensions to process
    extensions = {
        ".py",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".astro",
        ".css",
        ".scss",
        ".html",
        ".md",
        ".mdx",
        ".json",
        ".yaml",
        ".yml",
        ".sh",
        ".mjs",
    }

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip node_modules, .git, dist, and other common directories
        dirnames[:] = [
            d
            for d in dirnames
            if d
            not in [
                "node_modules",
                ".git",
                "dist",
                ".astro",
                "__pycache__",
                ".venv",
                "venv",
            ]
        ]

        for filename in filenames:
            filepath = os.path.join(dirpath, filename)

            # Check if file has a relevant extension
            _, ext = os.path.splitext(filename)
            if ext.lower() in extensions:
                process_file(filepath)


if __name__ == "__main__":
    main()
