#!/bin/bash
# Script de despliegue automático para el VPS
echo "🔄 Descartando modificaciones automáticas en el VPS..."
git reset --hard

echo "📥 Descargando la última versión desde GitHub..."
git pull

echo "♻️ Reiniciando el servicio en PM2..."
pm2 restart sistema-hab

echo "✅ ¡Despliegue completado con éxito!"
