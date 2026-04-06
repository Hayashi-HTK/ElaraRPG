// Firebase auth initialization and logic
import {
    auth,
    db,
    doc,
    setDoc,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    sendPasswordResetEmail,
    waitForAuth,
    GoogleAuthProvider,
    signInWithPopup,
    collection,
    query,
    where,
    getDocs
} from './firebase.js';

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const recoverForm = document.getElementById('recover-form');
const googleLoginBtn = document.getElementById('google-login-btn');
const errorMsg = document.getElementById('error-message');

// Utility to show error messages
const showError = (message) => {
    if (errorMsg) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
        errorMsg.style.color = '#EF4444'; // Red
        setTimeout(() => {
            errorMsg.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
};

const showSuccess = (message) => {
    if (errorMsg) {
        errorMsg.textContent = message;
        errorMsg.style.color = '#10B981'; // Green
        errorMsg.style.display = 'block';
        setTimeout(() => {
            errorMsg.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
};

// Toggle Mode Logic
window.toggleAuthMode = (mode) => {
    const sections = {
        'login': document.getElementById('login-section'),
        'register': document.getElementById('register-section'),
        'recover': document.getElementById('recover-section')
    };
    
    Object.values(sections).forEach(section => {
        if (section && !section.classList.contains('hidden')) {
            section.style.opacity = '0';
            section.style.transform = 'translateY(10px)';
        }
    });

    setTimeout(() => {
        Object.keys(sections).forEach(key => {
            const section = sections[key];
            if (section) {
                if (key === mode) {
                    section.classList.remove('hidden');
                    section.offsetHeight;
                    section.style.opacity = '1';
                    section.style.transform = 'translateY(0)';
                } else {
                    section.classList.add('hidden');
                }
            }
        });
    }, 300);
};

// Setup Form Listeners
const setupFormListeners = () => {
    console.log('Setting up form listeners...');

    const bindEnterToSubmit = (form) => {
        if (!form) return;
        const inputs = Array.from(form.querySelectorAll('input'));
        inputs.forEach((input) => {
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit(submitBtn || undefined);
                    return;
                }
                if (submitBtn) {
                    submitBtn.click();
                    return;
                }
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
        });
    };

    bindEnterToSubmit(loginForm);
    bindEnterToSubmit(registerForm);
    bindEnterToSubmit(recoverForm);

    // Login logic
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Login form submitted');

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            if (!email || !password) {
                showError('Preencha todos os campos');
                return;
            }

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                console.log('Login success:', userCredential.user.uid);

                sessionStorage.setItem('just_logged_in', 'true');
                window.location.replace('dashboard.html');
            } catch (error) {
                console.error('Login error:', error);

                let errorMessage = 'Erro ao fazer login';
                switch (error.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                    case 'auth/invalid-credential':
                        errorMessage = 'Email ou senha incorretos';
                        break;
                    case 'auth/invalid-email':
                        errorMessage = 'Email inválido';
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = 'Muitas tentativas. Tente novamente mais tarde';
                        break;
                    default:
                        errorMessage = error.message;
                }

                showError(errorMessage);
            }
        });
    }

    // Google login logic
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', async () => {
            console.log('Google login button clicked');

            try {
                const provider = new GoogleAuthProvider();
                const userCredential = await signInWithPopup(auth, provider);
                const user = userCredential.user;

                console.log('Google login success:', user.uid);

                // Salva/atualiza perfil básico no Firestore
                try {
                    const fullName = user.displayName || '';
                    const email = user.email || '';
                    let nickname = email ? email.split('@')[0].toLowerCase() : 'aventureiro';

                    // Verificar se já existe perfil para este usuário
                    const profileRef = doc(db, 'profiles', user.uid);
                    const profileSnap = await getDoc(profileRef);

                    if (!profileSnap.exists()) {
                        // Apenas gera nickname único se for um perfil novo
                        const q = query(collection(db, 'profiles'), where('nickname', '==', nickname));
                        const snapshot = await getDocs(q);
                        
                        if (!snapshot.empty) {
                            // Se já existe, adiciona um sufixo aleatório
                            nickname += '_' + Math.floor(Math.random() * 10000);
                        }

                        await setDoc(profileRef, {
                            full_name: fullName,
                            nickname: nickname,
                            email: email,
                            avatar_url: user.photoURL || '',
                            provider: 'google',
                            created_at: new Date(),
                            updated_at: new Date()
                        }, { merge: true });
                    } else {
                        // Se já existe, apenas atualiza o que for necessário (ex: foto se mudou)
                        await setDoc(profileRef, {
                            updated_at: new Date()
                        }, { merge: true });
                    }

                    console.log('Google profile saved successfully');
                } catch (dbError) {
                    console.error('Error saving Google profile to DB:', dbError);
                }

                sessionStorage.setItem('just_logged_in', 'true');
                window.location.replace('dashboard.html');
            } catch (error) {
                console.error('Google login error:', error);

                let errorMessage = 'Erro ao entrar com Google';
                switch (error.code) {
                    case 'auth/popup-closed-by-user':
                        errorMessage = 'Login com Google cancelado';
                        break;
                    case 'auth/popup-blocked':
                        errorMessage = 'O navegador bloqueou a janela de login. Libere o popup e tente novamente';
                        break;
                    case 'auth/cancelled-popup-request':
                        errorMessage = 'A solicitação de login foi cancelada. Tente novamente';
                        break;
                    case 'auth/account-exists-with-different-credential':
                        errorMessage = 'Já existe uma conta com este email usando outro método de login';
                        break;
                    default:
                        errorMessage = error.message || 'Não foi possível entrar com Google';
                }

                showError(errorMessage);
            }
        });
    }

    // Register logic
    if (registerForm) {
        const regUsernameInput = document.getElementById('reg-username');
        if (regUsernameInput) {
            regUsernameInput.addEventListener('blur', async () => {
                const username = regUsernameInput.value.trim().toLowerCase();
                if (username.length < 3) return;

                try {
                    const q = query(collection(db, 'profiles'), where('nickname', '==', username));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        showError('Este nome de usuário já está em uso.');
                        regUsernameInput.style.borderColor = '#EF4444';
                    } else {
                        regUsernameInput.style.borderColor = '#10B981';
                    }
                } catch (err) {
                    console.error("Erro ao verificar username:", err);
                }
            });
        }

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Register form submitted');

            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;
            const fullName = document.getElementById('reg-fullName').value.trim();
            const username = document.getElementById('reg-username').value.trim().toLowerCase();

            if (!email || !password || !fullName || !username) {
                showError('Preencha todos os campos obrigatórios');
                return;
            }

            // Verificar se o username (nickname) já existe
            try {
                const q = query(collection(db, 'profiles'), where('nickname', '==', username));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    showError('Este nome de usuário já está em uso.');
                    return;
                }
            } catch (err) {
                console.error("Erro ao verificar disponibilidade do username:", err);
            }

            if (password.length < 6) {
                showError('A senha deve ter pelo menos 6 caracteres');
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                console.log('Registration success:', userCredential.user.uid);
                
                await updateProfile(userCredential.user, {
                    displayName: fullName
                });

                try {
                    await setDoc(doc(db, 'profiles', userCredential.user.uid), {
                        full_name: fullName,
                        nickname: username,
                        email: email,
                        provider: 'password',
                        created_at: new Date(),
                        updated_at: new Date()
                    }, { merge: true });

                    console.log('Profile saved successfully');
                } catch (dbError) {
                    console.error('Error saving profile to DB:', dbError);
                }

                sessionStorage.setItem('just_logged_in', 'true');
                window.location.replace('dashboard.html');
            } catch (error) {
                console.error('Registration error:', error);

                let errorMessage = 'Erro ao criar conta';
                const errorCode = error.code || (error.error && error.error.code);
                
                switch (errorCode) {
                    case 'auth/email-already-in-use':
                        errorMessage = 'Este email já está sendo usado por outra conta.';
                        break;
                    case 'auth/invalid-email':
                        errorMessage = 'O endereço de email não é válido.';
                        break;
                    case 'auth/weak-password':
                        errorMessage = 'A senha escolhida é muito fraca. Use pelo menos 6 caracteres.';
                        break;
                    default:
                        errorMessage = error.message;
                }

                showError(errorMessage);
            }
        });
    }

    // Recovery logic
    if (recoverForm) {
        recoverForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('recover-email').value.trim();

            if (!email) {
                showError('Informe seu email');
                return;
            }

            try {
                await sendPasswordResetEmail(auth, email);
                showSuccess('Email de recuperação enviado! Verifique sua caixa de entrada.');

                setTimeout(() => {
                    window.toggleAuthMode('login');
                }, 3000);
            } catch (error) {
                console.error('Recovery failed:', error);
                showError('Erro ao enviar email de recuperação: ' + error.message);
            }
        });
    }
};

const setupToggleListeners = () => {
    const links = [
        { id: 'to-register', mode: 'register' },
        { id: 'to-recover', mode: 'recover' },
        { id: 'to-login-from-reg', mode: 'login' },
        { id: 'to-login-from-recover', mode: 'login' }
    ];

    links.forEach(link => {
        const el = document.getElementById(link.id);
        if (el) {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                window.toggleAuthMode(link.mode);
            });
        }
    });
};

// Initialization
const init = async () => {
    console.log('Initializing auth script...');
    
    // 1. Setup UI listeners immediately
    setupToggleListeners();
    setupFormListeners();

    // 2. Check if user is already logged in
    try {
        const user = await waitForAuth();
        const path = window.location.pathname;
        
        if (user && (path.includes('login') || path.includes('register'))) {
            console.log('User already logged in, redirecting to dashboard...');
            window.location.replace('dashboard.html');
        }
    } catch (err) {
        console.error('Auth check error:', err);
    }
};

// Execute init
init();
