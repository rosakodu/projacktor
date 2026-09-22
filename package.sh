#!/bin/bash
set -e

echo "==> Building frontend..."
pnpm run build

echo "==> Packaging Projacktor.zip..."
TMP_DIR="/tmp/projacktor_pkg"
rm -rf "$TMP_DIR" Projacktor.zip
mkdir -p "$TMP_DIR/Projacktor"

# Copy all required plugin files
cp -r main.py py_modules defaults bin dist assets plugin.json package.json README.md LICENSE "$TMP_DIR/Projacktor/"

# Ensure binary permissions
chmod +x "$TMP_DIR/Projacktor/bin/"*

# Remove any python cache or unwanted files
find "$TMP_DIR/Projacktor" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$TMP_DIR/Projacktor" -type f -name "*.pyc" -delete 2>/dev/null || true

# Create zip archive
(cd "$TMP_DIR" && zip -r -q Projacktor.zip Projacktor)
mv "$TMP_DIR/Projacktor.zip" ./Projacktor.zip
rm -rf "$TMP_DIR"

echo "==> Projacktor.zip created successfully!"
unzip -l Projacktor.zip | head -n 35
