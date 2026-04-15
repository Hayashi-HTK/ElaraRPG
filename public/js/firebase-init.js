// Bridge to set Firebase globals from the module system
import * as Firebase from './firebase.js';
import './standby.js';
import './branding.js';
import './ui-click.js';

console.log('Initializing Firebase Bridge...')

// Set window globals for non-module scripts
window.auth = Firebase.auth;
window.db = Firebase.db;
window.collection = Firebase.collection;
window.doc = Firebase.doc;
window.getDoc = Firebase.getDoc;
window.getDocs = Firebase.getDocs;
window.query = Firebase.query;
window.where = Firebase.where;
window.orderBy = Firebase.orderBy;
window.addDoc = Firebase.addDoc;
window.updateDoc = Firebase.updateDoc;
window.deleteDoc = Firebase.deleteDoc;
window.setDoc = Firebase.setDoc;
window.serverTimestamp = Firebase.serverTimestamp;

// Auth functions
window.createUserWithEmailAndPassword = Firebase.createUserWithEmailAndPassword;
window.signInWithEmailAndPassword = Firebase.signInWithEmailAndPassword;
window.signOut = Firebase.signOut;
window.onAuthStateChanged = Firebase.onAuthStateChanged;
window.updateProfile = Firebase.updateProfile;
window.sendPasswordResetEmail = Firebase.sendPasswordResetEmail;
window.waitForAuth = Firebase.waitForAuth;

// Google Auth
window.GoogleAuthProvider = Firebase.GoogleAuthProvider;
window.signInWithPopup = Firebase.signInWithPopup;

console.log('Firebase Bridge initialized successfully!');

// Signal that Firebase is fully initialized
window.firebaseReady = true;
if (window.initAuthWhenReady) {
  window.initAuthWhenReady();
}

// Dispatch event for any listeners
window.dispatchEvent(new CustomEvent('firebaseInitialized'));
