// Firebase core initialization and exports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';

import { 
  getAuth, 
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  updateProfile, 
  sendPasswordResetEmail 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  setDoc, 
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  limit,
  increment,
  deleteField
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDbMoIJRDnG9bM9r1yl7CVvprYZCDbJJbo",
  authDomain: "elarafichas.firebaseapp.com",
  projectId: "elarafichas",
  storageBucket: "elarafichas.firebasestorage.app",
  messagingSenderId: "166091798299",
  appId: "1:166091798299:web:588df245d77d5b340a45be",
  measurementId: "G-FF6CS657FS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Helper for auth state
// More robust version to avoid premature 'null' results during initialization
const waitForAuth = () => {
  return new Promise(resolve => {

    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    
    let resolved = false;

    const unsub = onAuthStateChanged(auth, (user) => {
      if (resolved) return;

      resolved = true;
      unsub();
      resolve(user);
    });
    
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve(null);
      }
    }, 3000);

  });
};

export {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  limit,
  increment,
  deleteField,

  GoogleAuthProvider,
  signInWithPopup,

  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  waitForAuth
};
