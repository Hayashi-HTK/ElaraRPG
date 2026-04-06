# 🚀 Guia de Configuração Firebase - RPG Ficha

## 1. Configurar Credenciais Firebase

Abra `public/js/firebase.js` e substitua as credenciais:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

Obtenha essas credenciais em:
1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Clique em "Project Settings" (ícone de engrenagem)
4. Vá para a aba "Your apps"
5. Copie as credenciais de sua aplicação web

## 2. Configurar Firestore

### Criar Collections:

**Collection: `profiles`**
- Documento: `{user_id}`
- Campos:
  - `full_name` (string)
  - `nickname` (string)
  - `birth_date` (string)
  - `play_style` (string)
  - `avatar_url` (string)
  - `banner_url` (string)
  - `updated_at` (timestamp)

**Collection: `sheets`**
- Documento: Auto-generated ID
- Campos:
  - `user_id` (string)
  - `name` (string)
  - `system` (string)
  - `data` (object)
  - `updated_at` (timestamp)

**Collection: `collaborators`**
- Documento: Auto-generated ID
- Campos:
  - `sheet_id` (string)
  - `user_email` (string)
  - `created_at` (timestamp)

### Firestore Rules (Security):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Profiles - apenas o usuário pode ler/escrever seu perfil
    match /profiles/{userId} {
      allow read: if request.auth.uid == userId;
      allow write: if request.auth.uid == userId;
    }
    
    // Sheets - usuário pode ler/escrever suas próprias fichas
    match /sheets/{sheetId} {
      allow read: if request.auth.uid == resource.data.user_id;
      allow write: if request.auth.uid == resource.data.user_id;
      allow create: if request.auth.uid == request.resource.data.user_id;
    }
    
    // Collaborators - qualquer usuário autenticado pode ler/escrever
    match /collaborators/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 3. Configurar Firebase Authentication

1. No Console Firebase, vá para "Authentication"
2. Na aba "Sign-in method", abilite "Email/Password"
3. Salve as configurações

## 4. Deploy no Firebase

```bash
# Instale Firebase CLI (se não tiver)
npm install -g firebase-tools

# Faça login
firebase login

# Inicialize o projeto (se não tiver .firebaserc)
firebase init hosting

# Deploy
firebase deploy
```

## 5. Variáveis de Ambiente (Opcional)

Se preferir usar variáveis de ambiente, crie um arquivo `.firebaserc`:

```json
{
  "projects": {
    "default": "seu-projeto-id"
  }
}
```

## 6. Testar a Aplicação

1. Acesse `https://seu-projeto.firebaseapp.com`
2. Crie uma conta
3. Teste funcionalidades de cadastro, login e fichas

## ⚠️ Problemas Comuns

### "Firebase is not defined"
- Certifique-se que `firebase-init.js` está siendo carregado em todas as páginas

### "Permission denied"
- Verifique as Firestore Rules
- Certifique-se que está autenticado

### "Failed to load modules"
- Use HTTP/HTTPS (não funciona com file://)
- Use um servidor local: `python -m http.server 8000`

## 📚 Recursos

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
