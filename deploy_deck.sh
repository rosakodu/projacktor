#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Projacktor — скрипт деплоя на Steam Deck
# ──────────────────────────────────────────────────────────────

DECK_IP="${1:-192.168.0.103}"
DECK_USER="deck"
DECK_PASS="0451"
PLUGIN_NAME="Projacktor"
REMOTE_DIR="/home/${DECK_USER}/homebrew/plugins/${PLUGIN_NAME}"

echo "Projacktor — деплой на Steam Deck (${DECK_IP})"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Сборка фронтенда
echo "Сборка фронтенда..."
pnpm run build
if [ $? -ne 0 ]; then
    echo "Ошибка сборки!"
    exit 1
fi
echo "Сборка завершена"

# 2. Подготовка директории на Deck
echo "Подготовка папки на Steam Deck..."
sshpass -p "${DECK_PASS}" ssh -o StrictHostKeyChecking=no \
    "${DECK_USER}@${DECK_IP}" \
    "echo '${DECK_PASS}' | sudo -S rm -rf '/home/${DECK_USER}/homebrew/plugins/projactor' '/home/${DECK_USER}/homebrew/plugins/projecktor' 2>/dev/null || true; echo '${DECK_PASS}' | sudo -S mkdir -p '${REMOTE_DIR}'; echo '${DECK_PASS}' | sudo -S chown -R ${DECK_USER}:${DECK_USER} '${REMOTE_DIR}'; echo '${DECK_PASS}' | sudo -S chmod -R 777 '${REMOTE_DIR}'"

# 3. Деплой на Deck
echo "Копирование файлов на Steam Deck..."
rsync -avz --inplace --no-owner --no-group --no-perms --omit-dir-times --delete \
    --exclude='node_modules' \
    --exclude='src' \
    --exclude='.git' \
    --exclude='.gitignore' \
    --exclude='*.md' \
    --exclude='pnpm-lock.yaml' \
    --exclude='tsconfig.json' \
    --exclude='rollup.config.js' \
    --exclude='deploy_deck.sh' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    -e "sshpass -p '${DECK_PASS}' ssh -o StrictHostKeyChecking=no" \
    ./ "${DECK_USER}@${DECK_IP}:${REMOTE_DIR}/"

if [ $? -ne 0 ]; then
    echo "Ошибка копирования!"
    exit 1
fi
echo "Файлы скопированы"

# 4. Права на исполнение для бинарников
echo "Установка прав на исполнение для bin/..."
sshpass -p "${DECK_PASS}" ssh -o StrictHostKeyChecking=no \
    "${DECK_USER}@${DECK_IP}" \
    "chmod +x ${REMOTE_DIR}/bin/* 2>/dev/null || true"

# 5. Перезапуск Decky Loader
echo "Перезапуск Decky Loader..."
sshpass -p "${DECK_PASS}" ssh -o StrictHostKeyChecking=no \
    "${DECK_USER}@${DECK_IP}" \
    "echo '${DECK_PASS}' | sudo -S systemctl restart plugin_loader.service"

echo "Деплой завершён! Плагин Projacktor установлен на Steam Deck."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
