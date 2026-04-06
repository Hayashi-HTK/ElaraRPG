#!/bin/bash

# Instalação do Firebase CLI e Deploy

echo "📱 RPG Ficha - Firebase Setup Script"
echo "===================================="

# 1. Check if Node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado. Instale de: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js encontrado"

# 2. Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm não está instalado"
    exit 1
fi

echo "✅ npm encontrado"

# 3. Install Firebase CLI
echo ""
echo "📥 Instalando Firebase CLI..."
npm install -g firebase-tools

# 4. Login to Firebase
echo ""
echo "🔐 Fazendo login no Firebase..."
firebase login

# 5. Test Firebase installation
echo ""
echo "✅ Testando instalação..."
firebase --version

echo ""
echo "📋 Próximos passos:"
echo "1. Substitua as credenciais em public/js/firebase.js"
echo "2. Configure Firestore Rules"
echo "3. Execute: firebase deploy"
echo ""
echo "📚 Para mais informações, veja FIREBASE_SETUP.md"
